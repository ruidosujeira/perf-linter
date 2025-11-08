import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'inlineCallbackProp';

type FunctionLike = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

type JSXReturn = TSESTree.JSXElement | TSESTree.JSXFragment;

function isMapCall(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return false;
  }

  const property = node.callee.property;
  return property.type === AST_NODE_TYPES.Identifier && property.name === 'map';
}

function isFunctionLike(node: TSESTree.Node | undefined): node is FunctionLike {
  if (!node) {
    return false;
  }

  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function getReturnedJSX(node: FunctionLike): JSXReturn | null {
  if (node.body.type === AST_NODE_TYPES.JSXElement || node.body.type === AST_NODE_TYPES.JSXFragment) {
    return node.body;
  }

  if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return null;
  }

  for (const statement of node.body.body) {
    if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
      const argument = statement.argument;
      if (argument.type === AST_NODE_TYPES.JSXElement || argument.type === AST_NODE_TYPES.JSXFragment) {
        return argument;
      }
    }
  }

  return null;
}

function isComponentOpeningElement(opening: TSESTree.JSXOpeningElement): boolean {
  const name = opening.name;
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return /^[A-Z]/.test(name.name);
  }

  return false;
}

function collectInlineCallbackAttributes(
  opening: TSESTree.JSXOpeningElement
): TSESTree.JSXAttribute[] {
  const attributes: TSESTree.JSXAttribute[] = [];

  for (const attribute of opening.attributes) {
    if (attribute.type !== AST_NODE_TYPES.JSXAttribute) {
      continue;
    }

    if (!attribute.value || attribute.value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
      continue;
    }

    const expression = attribute.value.expression;
    if (
      expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      expression.type === AST_NODE_TYPES.FunctionExpression
    ) {
      attributes.push(attribute);
    }
  }

  return attributes;
}

export default createRule<Options, MessageIds>({
  name: 'detect-unnecessary-rerenders',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Flag inline callback props created inside array map expressions that break memoized child components.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      inlineCallbackProp:
        'Inline callback for prop "{{propName}}" inside a list map creates a new function every render. Hoist it or wrap it with useCallback to keep memoized children stable.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isMapCall(node)) {
          return;
        }

        const [callback] = node.arguments;
        if (!isFunctionLike(callback)) {
          return;
        }

        const jsx = getReturnedJSX(callback);
        if (!jsx) {
          return;
        }

        const root = jsx.type === AST_NODE_TYPES.JSXElement ? jsx : null;
        if (!root) {
          return;
        }

        if (!isComponentOpeningElement(root.openingElement)) {
          return;
        }

        const inlineAttributes = collectInlineCallbackAttributes(root.openingElement);
        for (const attribute of inlineAttributes) {
          if (!attribute.value || attribute.value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
            continue;
          }

          const propName = attribute.name.type === AST_NODE_TYPES.JSXIdentifier ? attribute.name.name : 'prop';
          context.report({
            node: attribute.value.expression,
            messageId: 'inlineCallbackProp',
            data: {
              propName
            }
          });
        }
      }
    };
  }
});
