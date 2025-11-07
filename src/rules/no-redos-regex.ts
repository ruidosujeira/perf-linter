import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import safeRegex from 'safe-regex';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'redosRisk';

function isSafe(pattern: string): boolean {
  try {
    return safeRegex(pattern);
  } catch {
    return true;
  }
}

function getPatternFromNewExpression(node: TSESTree.NewExpression): string | null {
  const [patternArg] = node.arguments;
  if (!patternArg) {
    return null;
  }

  if (patternArg.type === AST_NODE_TYPES.Literal && typeof patternArg.value === 'string') {
    return patternArg.value;
  }

  return null;
}

export default createRule<Options, MessageIds>({
  name: 'no-redos-regex',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect regular expressions that are vulnerable to catastrophic backtracking (ReDoS).',
  recommended: 'recommended'
    },
    schema: [],
    messages: {
      redosRisk: 'This regular expression is susceptible to catastrophic backtracking (ReDoS). Refactor it to a safer alternative or use a vetted pattern.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    return {
      Literal(node: TSESTree.Literal) {
        if (!('regex' in node) || !node.regex) {
          return;
        }

        const { pattern } = node.regex;
        if (!pattern || isSafe(pattern)) {
          return;
        }

        context.report({
          node,
          messageId: 'redosRisk'
        });
      },
      NewExpression(node: TSESTree.NewExpression) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'RegExp') {
          return;
        }

        const pattern = getPatternFromNewExpression(node);
        if (!pattern || isSafe(pattern)) {
          return;
        }

        context.report({
          node,
          messageId: 'redosRisk'
        });
      }
    };
  }
});
