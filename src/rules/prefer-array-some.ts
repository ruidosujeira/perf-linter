import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'preferSome';

interface ComparisonMetadata {
  negateResult: boolean;
  operatorText: string;
}

function isZeroLiteral(node: TSESTree.Node | null | undefined): node is TSESTree.Literal & { value: number } {
  return !!node && node.type === AST_NODE_TYPES.Literal && node.value === 0;
}

function inspectComparison(node: TSESTree.BinaryExpression): ComparisonMetadata | null {
  if (!isZeroLiteral(node.right)) {
    return null;
  }

  switch (node.operator) {
    case '>':
    case '!==':
    case '!=':
      return { negateResult: false, operatorText: `${node.operator} 0` };
    case '===':
    case '==':
      return { negateResult: true, operatorText: `${node.operator} 0` };
    default:
      return null;
  }
}

function isFilterCall(node: TSESTree.CallExpression): node is TSESTree.CallExpression & {
  callee: TSESTree.MemberExpression & { property: TSESTree.Identifier };
} {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }

  const { property } = node.callee;
  return property.type === AST_NODE_TYPES.Identifier && property.name === 'filter';
}

export default createRule<Options, MessageIds>({
  name: 'prefer-array-some',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer .some() instead of .filter().length > 0 when checking array existence.',
  recommended: 'recommended'
    },
    hasSuggestions: true,
    fixable: 'code',
    schema: [],
    messages: {
      preferSome: 'Use .some() instead of .filter().length {{operatorText}} to avoid unnecessary array allocations.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isFilterCall(node)) {
          return;
        }

        const parentMember = node.parent;
        if (!parentMember || parentMember.type !== AST_NODE_TYPES.MemberExpression) {
          return;
        }

        if (parentMember.object !== node) {
          return;
        }

        const { property } = parentMember;
        if (property.type !== AST_NODE_TYPES.Identifier || property.name !== 'length') {
          return;
        }

        const binaryParent = parentMember.parent;
        if (!binaryParent || binaryParent.type !== AST_NODE_TYPES.BinaryExpression) {
          return;
        }

        if (binaryParent.left !== parentMember) {
          return;
        }

        const comparisonMeta = inspectComparison(binaryParent);
        if (!comparisonMeta) {
          return;
        }

        const sourceCode = context.getSourceCode();
        const calleeObject = node.callee.object;
        const arrayText = sourceCode.getText(calleeObject);
        const callbackArg = node.arguments[0];
        const thisArg = node.arguments[1];
        const callbackText = callbackArg ? sourceCode.getText(callbackArg) : 'Boolean';
        const someCall = `${arrayText}.some(${callbackText}${thisArg ? `, ${sourceCode.getText(thisArg)}` : ''})`;
        const replacement = comparisonMeta.negateResult ? `!${someCall}` : someCall;

        context.report({
          node: binaryParent,
          messageId: 'preferSome',
          data: {
            operatorText: comparisonMeta.operatorText
          },
          fix(fixer: TSESLint.RuleFixer) {
            return fixer.replaceText(binaryParent, replacement);
          }
        });
      }
    };
  }
});
