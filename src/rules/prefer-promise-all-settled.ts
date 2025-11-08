import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'preferAllSettled';

function isPromiseAllCall(node: TSESTree.Expression): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }

  return (
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Promise' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'all'
  );
}

function isCatchCall(node: TSESTree.CallExpression): node is TSESTree.CallExpression & {
  callee: TSESTree.MemberExpression & { object: TSESTree.Expression };
} {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return false;
  }

  return (
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'catch'
  );
}

function findEnclosingTryStatement(ancestors: TSESTree.Node[]): TSESTree.TryStatement | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const candidate = ancestors[index];
    if (candidate.type === AST_NODE_TYPES.TryStatement) {
      return candidate;
    }
  }

  return null;
}

export default createRule<Options, MessageIds>({
  name: 'prefer-promise-all-settled',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Promise.allSettled when you intend to tolerate individual rejections from a batch of Promises.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      preferAllSettled:
        'Promise.all with explicit error handling suggests partial failures are acceptable. Prefer Promise.allSettled to observe every outcome safely.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const reportedNodes = new WeakSet<TSESTree.Node>();

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isCatchCall(node)) {
          return;
        }

        const target = node.callee.object;
        if (!isPromiseAllCall(target)) {
          return;
        }

        if (reportedNodes.has(target)) {
          return;
        }

        reportedNodes.add(target);
        context.report({
          node: target,
          messageId: 'preferAllSettled'
        });
      },
      AwaitExpression(node: TSESTree.AwaitExpression) {
        if (!isPromiseAllCall(node.argument)) {
          return;
        }

        const ancestors = context.getAncestors();
        const tryStatement = findEnclosingTryStatement(ancestors);
        if (!tryStatement || !tryStatement.handler) {
          return;
        }

        if (reportedNodes.has(node.argument)) {
          return;
        }

        reportedNodes.add(node.argument);
        context.report({
          node: node.argument,
          messageId: 'preferAllSettled'
        });
      }
    };
  }
});
