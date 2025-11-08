import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'expensiveArrayMethod' | 'expensiveJsonCall';

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type ReactContextType = 'component' | 'effect';

const HEAVY_ARRAY_METHODS = new Set(['filter', 'reduce', 'sort']);
const HEAVY_JSON_METHODS = new Set(['stringify', 'parse']);

function isComponentName(name: string | null): boolean {
  return !!name && /^[A-Z]/.test(name);
}

function getFunctionName(node: FunctionNode): string | null {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id) {
    return node.id.name;
  }

  if ('id' in node && node.id && node.id.type === AST_NODE_TYPES.Identifier) {
    return node.id.name;
  }

  let current: TSESTree.Node | undefined = node.parent ?? undefined;
  while (current) {
    if (current.type === AST_NODE_TYPES.VariableDeclarator && current.id.type === AST_NODE_TYPES.Identifier) {
      return current.id.name;
    }

    if (current.type === AST_NODE_TYPES.Property && current.key.type === AST_NODE_TYPES.Identifier) {
      return current.key.name;
    }

    current = current.parent ?? undefined;
  }

  return null;
}

function isUseEffectCallee(node: TSESTree.Expression | TSESTree.Super): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'useEffect';
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return (
      !node.computed &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'useEffect'
    );
  }

  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return isUseEffectCallee(node.expression);
  }

  return false;
}

function isMemoHook(node: TSESTree.CallExpression): boolean {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.callee.name === 'useMemo' || node.callee.name === 'useCallback';
  }

  if (node.callee.type === AST_NODE_TYPES.MemberExpression && !node.callee.computed) {
    return (
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      (node.callee.property.name === 'useMemo' || node.callee.property.name === 'useCallback')
    );
  }

  if (node.callee.type === AST_NODE_TYPES.ChainExpression) {
    return isMemoHook({ ...node, callee: node.callee.expression } as TSESTree.CallExpression);
  }

  return false;
}

function isHeavyArrayCall(node: TSESTree.CallExpression): string | null {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return null;
  }

  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const method = node.callee.property.name;
  return HEAVY_ARRAY_METHODS.has(method) ? method : null;
}

function isHeavyJsonCall(node: TSESTree.CallExpression): string | null {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return null;
  }

  if (node.callee.object.type !== AST_NODE_TYPES.Identifier || node.callee.object.name !== 'JSON') {
    return null;
  }

  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const method = node.callee.property.name;
  return HEAVY_JSON_METHODS.has(method) ? method : null;
}

function isFunctionLike(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export default createRule<Options, MessageIds>({
  name: 'no-expensive-computations-in-render',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when expensive computations run inside React render bodies or useEffect callbacks without memoization.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      expensiveArrayMethod:
        'Expensive array method "{{method}}" runs during {{contextType}}. Memoize the result or hoist it outside the render cycle.',
      expensiveJsonCall:
        'JSON.{{method}} executes during {{contextType}}. Cache or memoize heavy serialization/deserialization to avoid blocking renders.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const componentFunctions = new WeakSet<FunctionNode>();
    const effectCallbacks = new WeakSet<FunctionNode>();

    function markComponent(node: FunctionNode): void {
      const name = getFunctionName(node);
      if (isComponentName(name)) {
        componentFunctions.add(node);
      }
    }

    function registerEffectCallback(node: TSESTree.CallExpression): void {
      const [callback] = node.arguments;
      if (!callback) {
        return;
      }

      if (
        callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        callback.type === AST_NODE_TYPES.FunctionExpression
      ) {
        effectCallbacks.add(callback);
      }
    }

    function getReactContext(_node: TSESTree.Node): { kind: ReactContextType; name: string | null } | null {
      const ancestors = context.getAncestors();

      for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const ancestor = ancestors[index];
        if (isFunctionLike(ancestor)) {
          if (componentFunctions.has(ancestor)) {
            return { kind: 'component', name: getFunctionName(ancestor) };
          }

          if (effectCallbacks.has(ancestor)) {
            return { kind: 'effect', name: null };
          }

          return null;
        }
      }

      return null;
    }

    function isInsideMemoizedCallback(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current && current.parent) {
        const parent = current.parent as TSESTree.Node;

        if (isFunctionLike(parent) && parent !== current) {
          if (effectCallbacks.has(parent) || componentFunctions.has(parent)) {
            // Once we reach the owning React function we can stop.
            return false;
          }
        }

        if (parent.type === AST_NODE_TYPES.CallExpression && isMemoHook(parent)) {
          return true;
        }

        current = parent;
      }

      return false;
    }

    return {
      FunctionDeclaration: markComponent,
      FunctionExpression: markComponent,
      ArrowFunctionExpression: markComponent,
      CallExpression(node) {
        if (isUseEffectCallee(node.callee)) {
          registerEffectCallback(node);
        }

        const arrayMethod = isHeavyArrayCall(node);
        if (arrayMethod) {
          const reactContext = getReactContext(node);
          if (!reactContext || isInsideMemoizedCallback(node)) {
            return;
          }

          context.report({
            node,
            messageId: 'expensiveArrayMethod',
            data: {
              method: arrayMethod,
              contextType: reactContext.kind === 'component' ? 'rendering' : 'useEffect'
            }
          });
          return;
        }

        const jsonMethod = isHeavyJsonCall(node);
        if (jsonMethod) {
          const reactContext = getReactContext(node);
          if (!reactContext || isInsideMemoizedCallback(node)) {
            return;
          }

          context.report({
            node,
            messageId: 'expensiveJsonCall',
            data: {
              method: jsonMethod,
              contextType: reactContext.kind === 'component' ? 'rendering' : 'useEffect'
            }
          });
        }
      }
    };
  }
});
