import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import { isVueRef, isVueReactive } from '../utils/vue-ast-utils';

type Options = [
  {
    strictness?: 'relaxed' | 'balanced' | 'strict';
  }?
];
type MessageIds =
  | 'reactiveInLoop'
  | 'preferRefForPrimitive'
  | 'unnecessaryReactive'
  | 'largeReactiveObject';

export default createRule<Options, MessageIds>({
  name: 'vue-optimize-reactivity',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Optimize Vue reactivity patterns to avoid unnecessary overhead and performance pitfalls.',
      recommended: 'recommended'
    },
    schema: [
      {
        type: 'object',
        properties: {
          strictness: {
            type: 'string',
            enum: ['relaxed', 'balanced', 'strict'],
            default: 'balanced'
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      reactiveInLoop:
        'Creating reactive objects inside loops causes performance issues. Move reactive creation outside the loop or use shallowReactive.',
      preferRefForPrimitive:
        'Use ref() instead of reactive() for primitive values. reactive() only works with objects and has more overhead.',
      unnecessaryReactive:
        'Using reactive() for a single primitive property. Consider using ref() directly instead.',
      largeReactiveObject:
        'reactive() object has many properties ({{count}}). Consider using shallowReactive() if deep reactivity is not needed, or split into smaller reactive objects.'
    },
    hasSuggestions: true
  },
  defaultOptions: [{ strictness: 'balanced' }],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const [options = {}] = context.options;
    const strictness = options.strictness || 'balanced';

    // Track loop depth
    let loopDepth = 0;

    /**
     * Get property count threshold based on strictness
     */
    function getLargeObjectThreshold(): number {
      switch (strictness) {
        case 'relaxed':
          return 20;
        case 'strict':
          return 5;
        case 'balanced':
        default:
          return 10;
      }
    }

    /**
     * Check if argument is a primitive literal
     */
    function isPrimitiveLiteral(node: TSESTree.Expression): boolean {
      if (node.type === AST_NODE_TYPES.Literal) {
        return typeof node.value !== 'object';
      }
      return false;
    }

    /**
     * Check if argument is a simple object with one property
     */
    function isSinglePropertyObject(node: TSESTree.Expression): boolean {
      if (node.type === AST_NODE_TYPES.ObjectExpression) {
        return node.properties.length === 1;
      }
      return false;
    }

    /**
     * Count properties in an object expression (recursively)
     */
    function countObjectProperties(node: TSESTree.ObjectExpression): number {
      let count = 0;

      for (const prop of node.properties) {
        count++;

        if (prop.type === AST_NODE_TYPES.Property && prop.value.type === AST_NODE_TYPES.ObjectExpression) {
          // Add nested properties
          count += countObjectProperties(prop.value);
        }

        if (prop.type === AST_NODE_TYPES.SpreadElement) {
          // Spread elements make counting uncertain, add conservative estimate
          count += 3;
        }
      }

      return count;
    }

    return {
      // Track loop depth
      'ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement'() {
        loopDepth++;
      },

      'ForStatement:exit, ForInStatement:exit, ForOfStatement:exit, WhileStatement:exit, DoWhileStatement:exit'() {
        loopDepth--;
      },

      CallExpression(node: TSESTree.CallExpression) {
        // Check reactive() calls
        if (isVueReactive(node)) {
          const [arg] = node.arguments;
          if (!arg || arg.type === AST_NODE_TYPES.SpreadElement) {
            return;
          }

          // Check if reactive is created inside a loop
          if (loopDepth > 0) {
            context.report({
              node,
              messageId: 'reactiveInLoop'
            });
            return;
          }

          // Check if using reactive with a primitive (always wrong)
          if (isPrimitiveLiteral(arg)) {
            context.report({
              node,
              messageId: 'preferRefForPrimitive',
              suggest: [
                {
                  messageId: 'preferRefForPrimitive',
                  fix(fixer) {
                    // Suggest replacing reactive with ref
                    const calleeText = context.sourceCode.getText(node.callee);
                    const newCallee = calleeText.replace(/reactive/g, 'ref');
                    return fixer.replaceText(node.callee, newCallee);
                  }
                }
              ]
            });
            return;
          }

          // Check if using reactive for single property object (suggest ref)
          if (strictness === 'strict' && isSinglePropertyObject(arg)) {
            context.report({
              node,
              messageId: 'unnecessaryReactive'
            });
            return;
          }

          // Check if reactive object is too large
          if (arg.type === AST_NODE_TYPES.ObjectExpression) {
            const propCount = countObjectProperties(arg);
            const threshold = getLargeObjectThreshold();

            if (propCount > threshold) {
              context.report({
                node,
                messageId: 'largeReactiveObject',
                data: {
                  count: String(propCount)
                }
              });
            }
          }
        }

        // Check ref() calls
        if (isVueRef(node)) {
          // Check if ref is created inside a loop
          if (loopDepth > 0) {
            context.report({
              node,
              messageId: 'reactiveInLoop'
            });
          }
        }
      }
    };
  }
});
