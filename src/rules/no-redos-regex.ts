import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import safeRegex from 'safe-regex';
import { createRule } from '../utils/create-rule';
import { checkReDosWithCore } from '../utils/core-bridge';

type Options = [];
type MessageIds = 'redosRisk';

function isSafe(pattern: string): boolean {
  try {
    // Prefer Rust core if available: if core flags unsafe, trust it; otherwise fall back to JS check
    const core = checkReDosWithCore(pattern);
    if (core && core.safe === false) {
      return false;
    }
    return safeRegex(pattern);
  } catch {
    return true;
  }
}

function getSimpleNestedQuantifierRewrite(pattern: string): string | null {
  const match = pattern.match(/^(\^?)(?:\((\w)\+\))\+(\$?)$/);
  if (!match) {
    return null;
  }

  const prefix = match[1] ?? '';
  const char = match[2];
  const suffix = match[3] ?? '';

  if (!char) {
    return null;
  }

  return `${prefix}(${char}+)${suffix}`;
}

function getPatternLiteralFromNewExpression(node: TSESTree.NewExpression): TSESTree.Literal | null {
  const [patternArg] = node.arguments;
  if (!patternArg) {
    return null;
  }

  if (patternArg.type === AST_NODE_TYPES.Literal && typeof patternArg.value === 'string') {
    return patternArg;
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
    fixable: 'code',
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

        // Ask Rust core for a rewrite first; if unavailable, use local heuristic
        const core = checkReDosWithCore(pattern);
        const rewrite = (core && core.rewrite) || getSimpleNestedQuantifierRewrite(pattern);

        context.report({
          node,
          messageId: 'redosRisk',
          fix: rewrite
            ? (fixer: TSESLint.RuleFixer) => {
                const flags = node.regex?.flags ?? '';
                return fixer.replaceText(node, `/${rewrite}/${flags}`);
              }
            : undefined
        });
      },
      NewExpression(node: TSESTree.NewExpression) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'RegExp') {
          return;
        }

        const patternLiteral = getPatternLiteralFromNewExpression(node);
        if (!patternLiteral) {
          return;
        }

        const patternValue = patternLiteral.value;
        if (typeof patternValue !== 'string' || isSafe(patternValue)) {
          return;
        }

        const core = checkReDosWithCore(patternValue);
        const rewrite = (core && core.rewrite) || getSimpleNestedQuantifierRewrite(patternValue);

        context.report({
          node: patternLiteral,
          messageId: 'redosRisk',
          fix: rewrite
            ? (fixer: TSESLint.RuleFixer) => {
                const raw = patternLiteral.raw ?? JSON.stringify(patternValue);
                const preferDouble = raw.startsWith('"');
                const quote = preferDouble ? '"' : "'";
                const escaped = rewrite
                  .replace(/\\/g, '\\\\')
                  .replace(new RegExp(quote, 'g'), `\\${quote}`);
                return fixer.replaceText(patternLiteral, `${quote}${escaped}${quote}`);
              }
            : undefined
        });
      }
    };
  }
});
