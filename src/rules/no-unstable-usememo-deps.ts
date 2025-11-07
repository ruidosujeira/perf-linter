import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'unstableDependency' | 'missingDepsArray';

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

function isInlineUnstableDependency(element: TSESTree.Expression | TSESTree.PrivateIdentifier): boolean {
  switch (element.type) {
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
      return true;
    default:
      return false;
  }
}

export default createRule<Options, MessageIds>({
  name: 'no-unstable-usememo-deps',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent inline unstable dependencies from invalidating useMemo caches.',
  recommended: 'recommended'
    },
    schema: [],
    messages: {
      unstableDependency:
        'Dependency at position {{index}} is re-created on every render, breaking memoization. Move it outside or use useMemo/useCallback upstream.',
      missingDepsArray: 'useMemo without a dependency array re-runs every render; provide a stable dependency list or remove useMemo.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
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

        for (let index = 0; index < depsArg.elements.length; index += 1) {
          const element = depsArg.elements[index];
          if (!element || element.type === AST_NODE_TYPES.SpreadElement) {
            continue;
          }

          if (isInlineUnstableDependency(element)) {
            context.report({
              node: element,
              messageId: 'unstableDependency',
              data: {
                index: index.toString()
              }
            });
          }
        }
      }
    };
  }
});
