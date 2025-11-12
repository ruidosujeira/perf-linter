import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import {
  BaseRuleOptions,
  createExplainCollector,
  getThresholds,
  shouldSkipFile
} from '../utils/rule-options';

type Options = [BaseRuleOptions?];
type MessageIds =
  | 'expensiveSplitReplaceLoop'
  | 'expensiveSplitReplaceLoopDebug'
  | 'expensiveSplitReplaceIteration'
  | 'expensiveSplitReplaceIterationDebug';

type IterationMethod =
  | 'map'
  | 'forEach'
  | 'filter'
  | 'reduce'
  | 'some'
  | 'every'
  | 'find'
  | 'findIndex'
  | 'flatMap';

const ITERATION_METHODS: ReadonlySet<IterationMethod> = new Set([
  'map',
  'forEach',
  'filter',
  'reduce',
  'some',
  'every',
  'find',
  'findIndex',
  'flatMap'
]);

const TARGET_METHODS = new Set(['split', 'replace', 'replaceAll']);

function isIterationCallback(node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): boolean {
  const parent = node.parent;
  if (!parent || parent.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  const callee = parent.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }

  if (callee.property.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }

  return ITERATION_METHODS.has(callee.property.name as IterationMethod);
}

function isInsideLoop(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | null = node.parent ?? null;

  while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.ForStatement:
      case AST_NODE_TYPES.ForInStatement:
      case AST_NODE_TYPES.ForOfStatement:
      case AST_NODE_TYPES.WhileStatement:
      case AST_NODE_TYPES.DoWhileStatement:
        return true;
      case AST_NODE_TYPES.FunctionDeclaration:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.ArrowFunctionExpression:
          if (current.type === AST_NODE_TYPES.FunctionExpression || current.type === AST_NODE_TYPES.ArrowFunctionExpression) {
            if (isIterationCallback(current)) {
              return false;
            }
          }
        return false;
      default:
        current = current.parent ?? null;
    }
  }

  return false;
}

function getIterationContext(node: TSESTree.Node): IterationMethod | null {
  let current: TSESTree.Node | null = node.parent ?? null;

  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      if (isIterationCallback(current)) {
        const parentCall = current.parent as TSESTree.CallExpression;
        const callee = parentCall.callee as TSESTree.MemberExpression;
        if (callee.property.type === AST_NODE_TYPES.Identifier) {
          return callee.property.name as IterationMethod;
        }
      }
    }

    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      // Reaching a function boundary without finding a callback means no iteration context.
      return null;
    }

    current = current.parent ?? null;
  }

  return null;
}

function getMethodName(node: TSESTree.CallExpression): string | null {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return null;
  }

  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const name = node.callee.property.name;
  return TARGET_METHODS.has(name) ? name : null;
}

function getStaticStringLength(expr: TSESTree.Expression): number | null {
  if (expr.type === AST_NODE_TYPES.Literal && typeof expr.value === 'string') {
    return expr.value.length;
  }

  if (expr.type === AST_NODE_TYPES.TemplateLiteral && expr.expressions.length === 0) {
    // Sum raw lengths of static template parts
    return expr.quasis.reduce((sum, q) => sum + (q.value.cooked?.length ?? 0), 0);
  }

  return null;
}

export default createRule<Options, MessageIds>({
  name: 'no-expensive-split-replace',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage repeated String.split/replace operations in hot paths such as loops and array iteration callbacks.',
      recommended: 'recommended'
    },
    schema: [
      {
        type: 'object',
        properties: {
          strictness: {
            type: 'string',
            enum: ['relaxed', 'balanced', 'strict']
          },
          includeTestFiles: {
            type: 'boolean'
          },
          includeStoryFiles: {
            type: 'boolean'
          },
          debugExplain: {
            type: 'boolean'
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      expensiveSplitReplaceLoop:
        'String.{{method}} runs inside a loop. Hoist the operation or reuse a cached result to avoid repeated allocations.',
      expensiveSplitReplaceLoopDebug:
        'String.{{method}} runs inside a loop. Hoist the operation or reuse a cached result to avoid repeated allocations. [debug: confidence {{confidence}}]',
      expensiveSplitReplaceIteration:
        'String.{{method}} executes within a {{iteration}} callback. Compute it once outside the callback or memoize the value.',
      expensiveSplitReplaceIterationDebug:
        'String.{{method}} executes within a {{iteration}} callback. Compute it once outside the callback or memoize the value. [debug: confidence {{confidence}}]'
    }
  },
  defaultOptions: [{}],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const options = context.options[0] ?? {};
    if (shouldSkipFile(context, options)) {
      return {};
    }

    const thresholds = getThresholds(options.strictness);
    const debug = options.debugExplain === true;

    return {
      CallExpression(node) {
        const methodName = getMethodName(node);
        if (!methodName) {
          return;
        }

        const explain = createExplainCollector(debug);
        explain.push('stringMethodDetected', { method: methodName });

        // Suppress trivial constant target strings (e.g., 'a,b,c'.split(',') inside loops is cheap)
        if (node.callee.type === AST_NODE_TYPES.MemberExpression && node.callee.object.type === AST_NODE_TYPES.Literal) {
          const len = getStaticStringLength(node.callee.object);
          if (len !== null && len <= thresholds.smallStringMaxLen) {
            explain.push('skipTinyLiteral', { length: len });
            return;
          }
        }

        if (isInsideLoop(node)) {
          const confidence = 0.9;
          explain.push('foundLoopContext');
          explain.push('confidence', { value: confidence });
          if (confidence < thresholds.minConfidenceToReport) {
            explain.push('skipLowConfidence', { threshold: thresholds.minConfidenceToReport });
            return;
          }
          context.report({
            node,
            messageId: debug ? 'expensiveSplitReplaceLoopDebug' : 'expensiveSplitReplaceLoop',
            data: {
              method: methodName,
              ...(debug
                ? { confidence: confidence.toFixed(2), trace: explain.snapshot() ?? [] }
                : {})
            }
          });
          return;
        }

        const iteration = getIterationContext(node);
        if (iteration) {
          const confidence = 0.85;
          explain.push('foundIterationContext', { iteration });
          explain.push('confidence', { value: confidence });
          if (confidence < thresholds.minConfidenceToReport) {
            explain.push('skipLowConfidence', { threshold: thresholds.minConfidenceToReport });
            return;
          }
          context.report({
            node,
            messageId: debug ? 'expensiveSplitReplaceIterationDebug' : 'expensiveSplitReplaceIteration',
            data: {
              method: methodName,
              iteration,
              ...(debug
                ? { confidence: confidence.toFixed(2), trace: explain.snapshot() ?? [] }
                : {})
            }
          });
        }
      }
    };
  }
});
