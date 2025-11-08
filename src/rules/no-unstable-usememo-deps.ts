import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds =
  | 'unstableDependencyInline'
  | 'unstableDependencyLocal'
  | 'unstableDependencyProp'
  | 'missingDepsArray';

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type UnstableKind =
  | 'objectLiteral'
  | 'arrayLiteral'
  | 'arrowFunction'
  | 'functionExpression'
  | 'newExpression';

interface UnstableBindingInfo {
  kind: UnstableKind;
  node: TSESTree.Node;
  declaredIn: string | null;
}

interface UnstablePropInfo extends UnstableBindingInfo {
  parentComponent: string | null;
  bindingName: string;
}

interface ComponentContext {
  node: FunctionNode;
  name: string | null;
  unstableBindings: Map<string, UnstableBindingInfo>;
  propAliases: Map<string, string>;
  propsParamNames: Set<string>;
}

interface PendingPropCheck {
  node: TSESTree.Node;
  componentName: string | null;
  propName: string;
  index: number;
}

function isUseMemoCallee(node: TSESTree.Expression | TSESTree.Super): boolean {
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return isUseMemoCallee(node.expression);
  }

  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'useMemo';
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const property = node.property;
    return property.type === AST_NODE_TYPES.Identifier && property.name === 'useMemo';
  }

  return false;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
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

    if (current.type === AST_NODE_TYPES.AssignmentExpression && current.left.type === AST_NODE_TYPES.Identifier) {
      return current.left.name;
    }

    if (current.type === AST_NODE_TYPES.Property && current.key.type === AST_NODE_TYPES.Identifier) {
      return current.key.name;
    }

    current = current.parent ?? undefined;
  }

  return null;
}

function getPropertyName(key: TSESTree.Expression | TSESTree.PrivateIdentifier): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }

  return null;
}

function collectPropAliasesFromPattern(
  pattern: TSESTree.BindingName,
  register: (local: string, prop: string) => void
): void {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      register(pattern.name, pattern.name);
      return;
    case AST_NODE_TYPES.ObjectPattern: {
      for (const property of pattern.properties) {
        if (property.type === AST_NODE_TYPES.Property) {
          const propName = getPropertyName(property.key);
          if (!propName) {
            continue;
          }

          const value = property.value;
          if (value.type === AST_NODE_TYPES.Identifier) {
            register(value.name, propName);
          } else if (
            value.type === AST_NODE_TYPES.AssignmentPattern &&
            value.left.type === AST_NODE_TYPES.Identifier
          ) {
            register(value.left.name, propName);
          }
        } else if (
          property.type === AST_NODE_TYPES.RestElement &&
          property.argument.type === AST_NODE_TYPES.Identifier
        ) {
          register(property.argument.name, property.argument.name);
        }
      }
      return;
    }
    case AST_NODE_TYPES.ArrayPattern:
      return;
  }
}

type ParamPattern =
  | TSESTree.Identifier
  | TSESTree.ObjectPattern
  | TSESTree.ArrayPattern
  | TSESTree.RestElement
  | TSESTree.AssignmentPattern;

function isParamPattern(node: TSESTree.Node | null | undefined): node is ParamPattern {
  if (!node) {
    return false;
  }

  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.ObjectPattern:
    case AST_NODE_TYPES.ArrayPattern:
    case AST_NODE_TYPES.RestElement:
    case AST_NODE_TYPES.AssignmentPattern:
      return true;
    default:
      return false;
  }
}

function registerParamAliases(
  param: ParamPattern,
  propsParamNames: Set<string>,
  propAliases: Map<string, string>
): void {
  if (param.type === AST_NODE_TYPES.Identifier) {
    propsParamNames.add(param.name);
    return;
  }

  if (param.type === AST_NODE_TYPES.ObjectPattern) {
    collectPropAliasesFromPattern(param, (local, prop) => {
      propAliases.set(local, prop);
    });
    return;
  }

  if (param.type === AST_NODE_TYPES.AssignmentPattern) {
    const left = param.left;
    if (left.type === AST_NODE_TYPES.Identifier) {
      propsParamNames.add(left.name);
    } else if (isParamPattern(left)) {
      registerParamAliases(left, propsParamNames, propAliases);
    }
    return;
  }

  if (param.type === AST_NODE_TYPES.RestElement) {
    const argument = param.argument;
    if (argument.type === AST_NODE_TYPES.Identifier) {
      propsParamNames.add(argument.name);
    } else if (argument.type === AST_NODE_TYPES.ObjectPattern) {
      collectPropAliasesFromPattern(argument, (local, prop) => {
        propAliases.set(local, prop);
      });
    }
    return;
  }

  // Array patterns do not give us named props directly.
}

function getUnstableKind(node: TSESTree.Expression | null | undefined): UnstableKind | null {
  if (!node) {
    return null;
  }

  switch (node.type) {
    case AST_NODE_TYPES.ObjectExpression:
      return 'objectLiteral';
    case AST_NODE_TYPES.ArrayExpression:
      return 'arrayLiteral';
    case AST_NODE_TYPES.ArrowFunctionExpression:
      return 'arrowFunction';
    case AST_NODE_TYPES.FunctionExpression:
      return 'functionExpression';
    case AST_NODE_TYPES.NewExpression:
      return 'newExpression';
    default:
      return null;
  }
}

function describeKind(kind: UnstableKind): string {
  switch (kind) {
    case 'objectLiteral':
      return 'an object literal created during render';
    case 'arrayLiteral':
      return 'an array literal created during render';
    case 'arrowFunction':
      return 'an arrow function defined during render';
    case 'functionExpression':
      return 'a function expression defined during render';
    case 'newExpression':
      return 'a "new" expression instantiated during render';
  }
}

function describeInlineKind(kind: UnstableKind): string {
  switch (kind) {
    case 'objectLiteral':
      return 'object literal';
    case 'arrayLiteral':
      return 'array literal';
    case 'arrowFunction':
      return 'arrow function';
    case 'functionExpression':
      return 'function expression';
    case 'newExpression':
      return 'constructor call';
  }
}

function formatLocation(name: string | null): string {
  return name ? `component ${name}` : 'this scope';
}

function formatParentLocation(name: string | null): string {
  return name ? `component ${name}` : 'its parent component';
}

function getJSXElementName(name: TSESTree.JSXTagNameExpression): string | null {
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return name.name;
  }

  return null;
}

function isPropsIdentifier(
  expression: TSESTree.Expression,
  propsParamNames: Set<string>
): expression is TSESTree.Identifier {
  return expression.type === AST_NODE_TYPES.Identifier && propsParamNames.has(expression.name);
}

function isPropsMemberExpression(
  expression: TSESTree.Expression,
  propsParamNames: Set<string>
): expression is TSESTree.MemberExpression & {
  object: TSESTree.Identifier;
  property: TSESTree.Identifier;
} {
  return (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    !expression.computed &&
    expression.object.type === AST_NODE_TYPES.Identifier &&
    propsParamNames.has(expression.object.name) &&
    expression.property.type === AST_NODE_TYPES.Identifier
  );
}

export default createRule<Options, MessageIds>({
  name: 'no-unstable-usememo-deps',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent unstable dependencies from invalidating useMemo caches, including objects sourced from parent props.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      unstableDependencyInline:
        'Unstable dependency at position {{index}}: inline {{expressionKind}} is recreated every render.',
      unstableDependencyLocal:
        'Unstable dependency at position {{index}}: "{{name}}" is {{description}} within {{location}}.',
      unstableDependencyProp:
        'Unstable dependency at position {{index}}: prop "{{propName}}" comes from {{parentLocation}}, where it is {{description}}.',
      missingDepsArray:
        'useMemo without a dependency array re-runs every render; provide a stable dependency list or remove useMemo.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const componentStack: ComponentContext[] = [];
    const unstablePropsByComponent = new Map<string, Map<string, UnstablePropInfo>>();
    const pendingPropChecks: PendingPropCheck[] = [];

    function currentComponent(): ComponentContext | null {
      return componentStack[componentStack.length - 1] ?? null;
    }

    function pushComponent(node: FunctionNode): void {
      const name = getFunctionName(node);
      if (name && !isComponentName(name)) {
        return;
      }

      if (!name && node.type !== AST_NODE_TYPES.FunctionDeclaration) {
        return;
      }

      const propsParamNames = new Set<string>();
      const propAliases = new Map<string, string>();

      for (const param of node.params) {
        if (param.type === AST_NODE_TYPES.TSParameterProperty) {
          if (isParamPattern(param.parameter)) {
            registerParamAliases(param.parameter, propsParamNames, propAliases);
          }
          continue;
        }

        if (isParamPattern(param)) {
          registerParamAliases(param, propsParamNames, propAliases);
        }
      }

      componentStack.push({
        node,
        name,
        unstableBindings: new Map(),
        propAliases,
        propsParamNames
      });
    }

    function popComponent(node: FunctionNode): void {
      const top = currentComponent();
      if (top && top.node === node) {
        componentStack.pop();
      }
    }

    function reportInlineDependency(node: TSESTree.Expression, index: number, kind: UnstableKind): void {
      context.report({
        node,
        messageId: 'unstableDependencyInline',
        data: {
          index: index.toString(),
          expressionKind: describeInlineKind(kind)
        }
      });
    }

    function reportLocalDependency(
      node: TSESTree.Identifier,
      index: number,
      name: string,
      binding: UnstableBindingInfo,
      component: ComponentContext
    ): void {
      context.report({
        node,
        messageId: 'unstableDependencyLocal',
        data: {
          index: index.toString(),
          name,
          description: describeKind(binding.kind),
          location: formatLocation(component.name)
        }
      });
    }

    function reportPropDependency(
      node: TSESTree.Node,
      index: number,
      propName: string,
      info: UnstablePropInfo
    ): void {
      context.report({
        node,
        messageId: 'unstableDependencyProp',
        data: {
          index: index.toString(),
          propName,
          parentLocation: formatParentLocation(info.parentComponent),
          description: describeKind(info.kind)
        }
      });
    }

    function handlePropDependency(
      node: TSESTree.Node,
      component: ComponentContext,
      propName: string,
      index: number
    ): void {
      if (!component.name) {
        return;
      }

      const props = unstablePropsByComponent.get(component.name);
      const info = props?.get(propName);
      if (info) {
        reportPropDependency(node, index, propName, info);
      } else {
        pendingPropChecks.push({
          node,
          componentName: component.name,
          propName,
          index
        });
      }
    }

    const listeners: TSESLint.RuleListener = {
      FunctionDeclaration: pushComponent,
      'FunctionDeclaration:exit': popComponent,
      FunctionExpression: pushComponent,
      'FunctionExpression:exit': popComponent,
      ArrowFunctionExpression: pushComponent,
      'ArrowFunctionExpression:exit': popComponent,
      VariableDeclarator(node) {
        const component = currentComponent();
        if (!component) {
          return;
        }

        if (node.id.type === AST_NODE_TYPES.Identifier) {
          if (node.init && isPropsMemberExpression(node.init, component.propsParamNames)) {
            component.propAliases.set(node.id.name, node.init.property.name);
            return;
          }

          const kind = getUnstableKind(node.init ?? null);
          if (kind) {
            component.unstableBindings.set(node.id.name, {
              kind,
              node: node.init ?? node.id,
              declaredIn: component.name
            });
          }
        } else if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init &&
          isPropsIdentifier(node.init, component.propsParamNames)
        ) {
          collectPropAliasesFromPattern(node.id, (local, prop) => {
            component.propAliases.set(local, prop);
          });
        }
      },
      JSXAttribute(node) {
        const component = currentComponent();
        if (!component || !component.name) {
          return;
        }

        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) {
          return;
        }

        const opening = node.parent as TSESTree.JSXOpeningElement;
        const elementName = getJSXElementName(opening.name);
        if (!elementName || !isComponentName(elementName)) {
          return;
        }

        const value = node.value;
        if (!value || value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
          return;
        }

        const expression = value.expression;
        if (expression.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const binding = component.unstableBindings.get(expression.name);
        if (!binding) {
          return;
        }

        let entry = unstablePropsByComponent.get(elementName);
        if (!entry) {
          entry = new Map();
          unstablePropsByComponent.set(elementName, entry);
        }

        if (!entry.has(node.name.name)) {
          entry.set(node.name.name, {
            ...binding,
            parentComponent: component.name,
            bindingName: expression.name
          });
        }
      },
      CallExpression(node) {
        if (!isUseMemoCallee(node.callee)) {
          return;
        }

        const args = node.arguments;
        if (args.length < 2) {
          context.report({
            node,
            messageId: 'missingDepsArray'
          });
          return;
        }

        const depsArg = args[1];
        if (!depsArg) {
          context.report({
            node,
            messageId: 'missingDepsArray'
          });
          return;
        }

        if (depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
          return;
        }

        const component = currentComponent();

        for (let index = 0; index < depsArg.elements.length; index += 1) {
          const element = depsArg.elements[index];
          if (!element || element.type === AST_NODE_TYPES.SpreadElement) {
            continue;
          }

          if (
            element.type !== AST_NODE_TYPES.Identifier &&
            element.type !== AST_NODE_TYPES.MemberExpression &&
            element.type !== AST_NODE_TYPES.ChainExpression
          ) {
            const inlineKind = getUnstableKind(element as TSESTree.Expression);
            if (inlineKind) {
              reportInlineDependency(element as TSESTree.Expression, index, inlineKind);
            }
            continue;
          }

          if (!component) {
            continue;
          }

          if (element.type === AST_NODE_TYPES.Identifier) {
            const binding = component.unstableBindings.get(element.name);
            if (binding) {
              reportLocalDependency(element, index, element.name, binding, component);
              continue;
            }

            const propName = component.propAliases.get(element.name);
            if (propName) {
              handlePropDependency(element, component, propName, index);
            }
            continue;
          }

          if (element.type === AST_NODE_TYPES.ChainExpression) {
            const expression = element.expression;
            if (
              expression.type === AST_NODE_TYPES.MemberExpression &&
              !expression.computed &&
              expression.object.type === AST_NODE_TYPES.Identifier &&
              component.propsParamNames.has(expression.object.name) &&
              expression.property.type === AST_NODE_TYPES.Identifier
            ) {
              handlePropDependency(expression, component, expression.property.name, index);
            }
            continue;
          }

          if (
            element.type === AST_NODE_TYPES.MemberExpression &&
            !element.computed &&
            element.object.type === AST_NODE_TYPES.Identifier &&
            component.propsParamNames.has(element.object.name) &&
            element.property.type === AST_NODE_TYPES.Identifier
          ) {
            handlePropDependency(element, component, element.property.name, index);
          }
        }
      },
      'Program:exit'() {
        for (const pending of pendingPropChecks) {
          if (!pending.componentName) {
            continue;
          }

          const props = unstablePropsByComponent.get(pending.componentName);
          if (!props) {
            continue;
          }

          const info = props.get(pending.propName);
          if (info) {
            reportPropDependency(pending.node, pending.index, pending.propName, info);
          }
        }
      }
    };

    return listeners;
  }
});
