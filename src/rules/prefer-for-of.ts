import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'preferForOfMap' | 'preferForOfForEach';

function getPropertyName(node: TSESTree.Expression | TSESTree.PrivateIdentifier): string | null {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }

  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }

  return null;
}

function isResultUsed(node: TSESTree.CallExpression): boolean {
  let parent: TSESTree.Node | null = node.parent ?? null;

  while (parent) {
    switch (parent.type) {
      case AST_NODE_TYPES.AwaitExpression:
      case AST_NODE_TYPES.ReturnStatement:
      case AST_NODE_TYPES.VariableDeclarator:
      case AST_NODE_TYPES.AssignmentExpression:
      case AST_NODE_TYPES.ArrayExpression:
      case AST_NODE_TYPES.Property:
      case AST_NODE_TYPES.ObjectExpression:
      case AST_NODE_TYPES.CallExpression:
      case AST_NODE_TYPES.NewExpression:
      case AST_NODE_TYPES.ConditionalExpression:
      case AST_NODE_TYPES.SequenceExpression:
        return true;
      case AST_NODE_TYPES.MemberExpression:
        return true;
      case AST_NODE_TYPES.ExpressionStatement:
        return false;
      case AST_NODE_TYPES.ChainExpression:
      case AST_NODE_TYPES.TSAsExpression:
      case AST_NODE_TYPES.TSTypeAssertion:
      case AST_NODE_TYPES.TSNonNullExpression:
        parent = parent.parent ?? null;
        continue;
      default:
        return true;
    }
  }

  return true;
}

export default createRule<Options, MessageIds>({
  name: 'prefer-for-of',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Encourage simple loops to use for/of instead of Array.forEach or Array.map when the return value is unused.',
      recommended: 'recommended'
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferForOfMap:
        'Array.map() return value is unused. Prefer a simple for/of loop instead of allocating callbacks.',
      preferForOfForEach: 'Array.forEach() allocates a callback every render. Prefer a simple for/of loop for side-effects.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
          return;
        }

        const propertyName = getPropertyName(node.callee.property);
        if (!propertyName) {
          return;
        }

        if (propertyName === 'map') {
          if (!isResultUsed(node)) {
            context.report({
              node,
              messageId: 'preferForOfMap'
            });
          }
          return;
        }

        if (propertyName === 'forEach') {
          const [callback, thisArg] = node.arguments;
          if (!callback) return;
          const isArrowOrFn =
            callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression;
          if (!isArrowOrFn) return;

          // Only auto-fix the simple pattern: one parameter identifier, no thisArg provided
          const simpleParam =
            callback.params.length === 1 && callback.params[0].type === AST_NODE_TYPES.Identifier
              ? callback.params[0]
              : null;

          const canFix = simpleParam && !thisArg;

          if (canFix) {
            const sourceCode = context.getSourceCode();
            const arrayText = sourceCode.getText(node.callee.object);
            const itemName = simpleParam!.name;
            const body = callback.body;
            const bodyText =
              body.type === AST_NODE_TYPES.BlockStatement
                ? sourceCode.getText(body)
                : `{ ${sourceCode.getText(body)}; }`;

            context.report({
              node,
              messageId: 'preferForOfForEach',
              fix(fixer) {
                const loop = `for (const ${itemName} of ${arrayText}) ${bodyText}`;
                return fixer.replaceText(node, loop);
              }
            });
            return;
          }

          // Otherwise, report without fixer
          if (isArrowOrFn) {
            context.report({ node, messageId: 'preferForOfForEach' });
          }
        }
      }
    };
  }
});
