import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import { isInlineObject, unwrapExpression } from '../utils/react-ast-utils';

type Options = [];
type MessageIds = 'inlineContextValue';

function isContextProviderName(name: TSESTree.JSXTagNameExpression): boolean {
  // Match Something.Provider or props like <UserContext.Provider>
  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    return (
      name.property.type === AST_NODE_TYPES.JSXIdentifier && name.property.name === 'Provider'
    );
  }
  return false;
}

function getJsxAttribute(
  opening: TSESTree.JSXOpeningElement,
  attributeName: string
): TSESTree.JSXAttribute | null {
  for (const attr of opening.attributes) {
    if (attr.type === AST_NODE_TYPES.JSXAttribute && attr.name.name === attributeName) {
      return attr;
    }
  }
  return null;
}

export default createRule<Options, MessageIds>({
  name: 'no-inline-context-value',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow inline object/array in Context.Provider value prop.',
      recommended: 'recommended'
    },
    messages: {
      inlineContextValue:
        'Context.Provider value is inline {{type}}. Wrap in useMemo to prevent re-renders of all consumers.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXOpeningElement(opening) {
        if (!isContextProviderName(opening.name)) return;

        const valueAttr = getJsxAttribute(opening, 'value');
        if (!valueAttr || !valueAttr.value || valueAttr.value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
          return;
        }

        const expr = valueAttr.value.expression;
        // Ignore spread or empty expressions
        if (!expr || expr.type === AST_NODE_TYPES.SpreadElement) return;

        const unwrapped = unwrapExpression(expr);
        if (isInlineObject(unwrapped)) {
          const type = unwrapped.type === AST_NODE_TYPES.ArrayExpression ? 'array' : 'object';
          context.report({ node: valueAttr, messageId: 'inlineContextValue', data: { type } });
        }
      }
    } as TSESLint.RuleListener;
  }
});
