import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

export type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

/**
 * Check if a CallExpression is a Vue Composition API function
 */
export function isVueCompositionAPI(node: TSESTree.CallExpression, apiName: string): boolean {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name === apiName;
  }

  if (node.callee.type === AST_NODE_TYPES.MemberExpression && !node.callee.computed) {
    return (
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      node.callee.property.name === apiName
    );
  }

  if (node.callee.type === AST_NODE_TYPES.ChainExpression) {
    return isVueCompositionAPI({ ...node, callee: node.callee.expression } as TSESTree.CallExpression, apiName);
  }

  return false;
}

/**
 * Check if a CallExpression is Vue's computed()
 */
export function isVueComputed(node: TSESTree.CallExpression): boolean {
  return isVueCompositionAPI(node, 'computed');
}

/**
 * Check if a CallExpression is Vue's watch() or watchEffect()
 */
export function isVueWatch(node: TSESTree.CallExpression): boolean {
  return isVueCompositionAPI(node, 'watch') || isVueCompositionAPI(node, 'watchEffect');
}

/**
 * Check if a CallExpression is Vue's ref()
 */
export function isVueRef(node: TSESTree.CallExpression): boolean {
  return isVueCompositionAPI(node, 'ref');
}

/**
 * Check if a CallExpression is Vue's reactive()
 */
export function isVueReactive(node: TSESTree.CallExpression): boolean {
  return isVueCompositionAPI(node, 'reactive');
}

/**
 * Check if a CallExpression is Vue's toRef() or toRefs()
 */
export function isVueToRef(node: TSESTree.CallExpression): boolean {
  return isVueCompositionAPI(node, 'toRef') || isVueCompositionAPI(node, 'toRefs');
}

/**
 * Check if node is an Options API component (export default { ... })
 */
export function isVueOptionsAPIComponent(node: TSESTree.ExportDefaultDeclaration): boolean {
  if (node.declaration.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }

  // Check for common Vue Options API properties
  const properties = node.declaration.properties;
  const vueOptionProps = ['data', 'computed', 'watch', 'methods', 'mounted', 'created', 'setup'];

  return properties.some(prop => {
    if (prop.type !== AST_NODE_TYPES.Property) {
      return false;
    }
    if (prop.key.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }
    return vueOptionProps.includes(prop.key.name);
  });
}

/**
 * Check if a Property is a computed property in Options API
 */
export function isVueOptionsComputed(prop: TSESTree.Property): boolean {
  return (
    prop.key.type === AST_NODE_TYPES.Identifier &&
    prop.key.name === 'computed' &&
    prop.value.type === AST_NODE_TYPES.ObjectExpression
  );
}

/**
 * Check if a Property is a watch in Options API
 */
export function isVueOptionsWatch(prop: TSESTree.Property): boolean {
  return (
    prop.key.type === AST_NODE_TYPES.Identifier &&
    prop.key.name === 'watch' &&
    prop.value.type === AST_NODE_TYPES.ObjectExpression
  );
}

/**
 * Extract the getter function from a computed property
 * Works with both Composition API and Options API
 */
export function getComputedGetter(node: TSESTree.CallExpression | TSESTree.Property): FunctionNode | null {
  // Composition API: computed(() => ...)
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const [arg] = node.arguments;
    if (!arg) {
      return null;
    }

    if (
      arg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      arg.type === AST_NODE_TYPES.FunctionExpression
    ) {
      return arg;
    }

    // computed({ get: () => ..., set: () => ... })
    if (arg.type === AST_NODE_TYPES.ObjectExpression) {
      const getProp = arg.properties.find(
        p =>
          p.type === AST_NODE_TYPES.Property &&
          p.key.type === AST_NODE_TYPES.Identifier &&
          p.key.name === 'get'
      ) as TSESTree.Property | undefined;

      if (
        getProp &&
        (getProp.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          getProp.value.type === AST_NODE_TYPES.FunctionExpression)
      ) {
        return getProp.value;
      }
    }
  }

  // Options API: computed: { myProp() { ... } } or computed: { myProp: { get() {...} } }
  if (node.type === AST_NODE_TYPES.Property) {
    if (
      node.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.value.type === AST_NODE_TYPES.FunctionExpression
    ) {
      return node.value;
    }

    if (node.value.type === AST_NODE_TYPES.ObjectExpression) {
      const getProp = node.value.properties.find(
        p =>
          p.type === AST_NODE_TYPES.Property &&
          p.key.type === AST_NODE_TYPES.Identifier &&
          p.key.name === 'get'
      ) as TSESTree.Property | undefined;

      if (
        getProp &&
        (getProp.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          getProp.value.type === AST_NODE_TYPES.FunctionExpression)
      ) {
        return getProp.value;
      }
    }
  }

  return null;
}

/**
 * Extract the watcher callback from a watch expression
 */
export function getWatchCallback(node: TSESTree.CallExpression | TSESTree.Property): FunctionNode | null {
  // Composition API: watch(source, (newVal, oldVal) => ...)
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callback = node.arguments[1] || node.arguments[0]; // watchEffect has callback as first arg

    if (
      callback &&
      (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        callback.type === AST_NODE_TYPES.FunctionExpression)
    ) {
      return callback;
    }
  }

  // Options API: watch: { myData(newVal, oldVal) { ... } }
  if (node.type === AST_NODE_TYPES.Property) {
    if (
      node.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.value.type === AST_NODE_TYPES.FunctionExpression
    ) {
      return node.value;
    }

    // watch: { myData: { handler() {...}, deep: true } }
    if (node.value.type === AST_NODE_TYPES.ObjectExpression) {
      const handlerProp = node.value.properties.find(
        p =>
          p.type === AST_NODE_TYPES.Property &&
          p.key.type === AST_NODE_TYPES.Identifier &&
          p.key.name === 'handler'
      ) as TSESTree.Property | undefined;

      if (
        handlerProp &&
        (handlerProp.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          handlerProp.value.type === AST_NODE_TYPES.FunctionExpression)
      ) {
        return handlerProp.value;
      }
    }
  }

  return null;
}

/**
 * Check if an expression contains nested computed/watch calls
 */
export function hasNestedReactivity(node: TSESTree.Node): boolean {
  let hasNested = false;

  function traverse(n: TSESTree.Node): void {
    if (hasNested) return;

    if (n.type === AST_NODE_TYPES.CallExpression) {
      if (isVueComputed(n) || isVueWatch(n)) {
        hasNested = true;
        return;
      }
    }

    // Recursively check children (simplified traversal)
    const keys = Object.keys(n) as (keyof TSESTree.Node)[];
    for (const key of keys) {
      const value = n[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item && typeof item === 'object' && 'type' in item) {
              traverse(item as TSESTree.Node);
            }
          });
        } else if ('type' in value) {
          traverse(value as TSESTree.Node);
        }
      }
    }
  }

  traverse(node);
  return hasNested;
}

/**
 * Check if a function/expression contains expensive operations
 * (similar to React's expensive computation detection)
 */
export function hasExpensiveOperations(node: FunctionNode): boolean {
  let hasExpensive = false;

  function traverse(n: TSESTree.Node): void {
    if (hasExpensive) return;

    // Check for loops
    if (
      n.type === AST_NODE_TYPES.ForStatement ||
      n.type === AST_NODE_TYPES.ForInStatement ||
      n.type === AST_NODE_TYPES.ForOfStatement ||
      n.type === AST_NODE_TYPES.WhileStatement ||
      n.type === AST_NODE_TYPES.DoWhileStatement
    ) {
      hasExpensive = true;
      return;
    }

    // Check for array methods that iterate
    if (n.type === AST_NODE_TYPES.CallExpression && n.callee.type === AST_NODE_TYPES.MemberExpression) {
      const methodName =
        n.callee.property.type === AST_NODE_TYPES.Identifier ? n.callee.property.name : null;
      if (methodName && ['filter', 'map', 'reduce', 'find', 'some', 'every'].includes(methodName)) {
        hasExpensive = true;
        return;
      }
    }

    // Recursively check children
    const keys = Object.keys(n) as (keyof TSESTree.Node)[];
    for (const key of keys) {
      const value = n[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item && typeof item === 'object' && 'type' in item) {
              traverse(item as TSESTree.Node);
            }
          });
        } else if ('type' in value) {
          traverse(value as TSESTree.Node);
        }
      }
    }
  }

  traverse(node);
  return hasExpensive;
}
