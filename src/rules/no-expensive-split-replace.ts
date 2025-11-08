import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';

type Options = [];
type MessageIds = 'expensiveSplitReplaceLoop' | 'expensiveSplitReplaceIteration';

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

export default createRule<Options, MessageIds>({
  name: 'no-expensive-split-replace',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage repeated String.split/replace operations in hot paths such as loops and array iteration callbacks.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      expensiveSplitReplaceLoop:
        'String.{{method}} runs inside a loop. Hoist the operation or reuse a cached result to avoid repeated allocations.',
      expensiveSplitReplaceIteration:
        'String.{{method}} executes within a {{iteration}} callback. Compute it once outside the callback or memoize the value.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    return {
      CallExpression(node) {
        const methodName = getMethodName(node);
        if (!methodName) {
          return;
        }

        if (isInsideLoop(node)) {
          context.report({
            node,
            messageId: 'expensiveSplitReplaceLoop',
            data: {
              method: methodName
            }
          });
          return;
        }

        const iteration = getIterationContext(node);
        if (iteration) {
          context.report({
            node,
            messageId: 'expensiveSplitReplaceIteration',
            data: {
              method: methodName,
              iteration
            }
          });
        }
      }
    };
  }
});
