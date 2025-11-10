import { TSESLint, TSESTree } from '@typescript-eslint/utils';

const iterationMethods = new Set([
  'forEach',
  'map',
  'flatMap',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every'
]);

type MessageIds = 'quadratic';

type Options = [];

const rule: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage nested iterations over the same iterable to avoid quadratic time complexity.',
      recommended: false
    },
    messages: {
      quadratic: "Nested iteration over '{{source}}' may cause quadratic complexity."
    },
    schema: []
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    const loopStack: string[] = [];
    const trackedSources = new WeakMap<TSESTree.Node, string>();

    const getIterableKey = (
      expression: TSESTree.Expression | TSESTree.LeftHandSideExpression | null
    ): string | null => {
      if (!expression) {
        return null;
      }

      switch (expression.type) {
        case 'Identifier':
        case 'MemberExpression':
        case 'ThisExpression':
          return sourceCode.getText(expression);
        default:
          return null;
      }
    };

    const enterIteration = (
      node: TSESTree.Node,
      expression: TSESTree.Expression | TSESTree.LeftHandSideExpression | null
    ) => {
      const key = getIterableKey(expression);

      if (!key) {
        return;
      }

      if (loopStack.includes(key)) {
        context.report({
          node,
          messageId: 'quadratic',
          data: {
            source: key
          }
        });
      }

      loopStack.push(key);
      trackedSources.set(node, key);
    };

    const exitIteration = (node: TSESTree.Node) => {
      const key = trackedSources.get(node);

      if (!key) {
        return;
      }

      for (let index = loopStack.length - 1; index >= 0; index -= 1) {
        if (loopStack[index] === key) {
          loopStack.splice(index, 1);
          break;
        }
      }
    };

    return {
      ForOfStatement(node) {
        enterIteration(node, node.right);
      },
      'ForOfStatement:exit'(node) {
        exitIteration(node);
      },
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') {
          return;
        }

        const { property } = node.callee;
        let methodName: string | null = null;

        if (property.type === 'Identifier') {
          methodName = property.name;
        } else if (property.type === 'Literal' && typeof property.value === 'string') {
          methodName = property.value;
        }

        if (!methodName || !iterationMethods.has(methodName)) {
          return;
        }

        enterIteration(node, node.callee.object as TSESTree.Expression);
      },
      'CallExpression:exit'(node) {
        exitIteration(node);
      }
    };
  }
};

export default rule;
