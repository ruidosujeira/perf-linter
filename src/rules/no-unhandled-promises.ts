import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { AnalyzerServices, getCrossFileAnalyzer } from '../analysis/cross-file-analyzer';
import { createRule } from '../utils/create-rule';
import { BaseRuleOptions, createExplainCollector, shouldSkipFile } from '../utils/rule-options';

type Options = [BaseRuleOptions?];

const KNOWN_PROMISE_IDENTIFIERS = new Set(['fetch', 'axios', 'Promise']);
const KNOWN_PROMISE_METHODS = new Set(['resolve', 'reject', 'all', 'race', 'any', 'allSettled']);
const WRAPPER_NODE_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSNonNullExpression
]);

function isAsyncFunctionNode(node: TSESTree.Node | null | undefined): boolean {
  if (!node) {
    return false;
  }

  if (
    (node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    node.async
  ) {
    return true;
  }

  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    const init = node.init;
    if (
      init &&
      (init.type === AST_NODE_TYPES.FunctionExpression || init.type === AST_NODE_TYPES.ArrowFunctionExpression)
    ) {
      return init.async;
    }
  }

  if (node.type === AST_NODE_TYPES.MethodDefinition || node.type === AST_NODE_TYPES.Property) {
    const value = 'value' in node ? node.value : null;
    if (
      value &&
      (value.type === AST_NODE_TYPES.FunctionExpression || value.type === AST_NODE_TYPES.ArrowFunctionExpression)
    ) {
      return value.async;
    }
  }

  return false;
}

function isAsyncIdentifier(
  context: TSESLint.RuleContext<'unhandledPromise', Options>,
  identifier: TSESTree.Identifier
): boolean {
  const sourceCode = context.getSourceCode();
  const manager = sourceCode.scopeManager;

  const fallbackAcquire = (node: TSESTree.Node | null): TSESLint.Scope.Scope | null => {
    if (!manager) {
      return null;
    }

    let current: TSESTree.Node | null = node;
    while (current) {
      const scope = manager.acquire(current);
      if (scope) {
        return scope;
      }
      current = current.parent ?? null;
    }

    return manager.globalScope ?? null;
  };

  let scope: TSESLint.Scope.Scope | null =
    sourceCode.getScope?.(identifier) ?? fallbackAcquire(identifier);

  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      if (variable.defs.some((def: TSESLint.Scope.Definition) => isAsyncFunctionNode(def.node))) {
        return true;
      }
      return false;
    }
    scope = scope.upper ?? null;
  }

  return KNOWN_PROMISE_IDENTIFIERS.has(identifier.name);
}

function isPromiseLikeCall(
  context: TSESLint.RuleContext<'unhandledPromise', Options>,
  node: TSESTree.CallExpression,
  analyzerServices: AnalyzerServices | null
): boolean {
  if (analyzerServices) {
    const tsNode = analyzerServices.getTypeScriptNode(node);
    if (tsNode && ts.isCallExpression(tsNode)) {
      if (analyzerServices.analyzer.isPromiseLikeExpression(tsNode)) {
        return true;
      }
    }
  }

  const callee = node.callee;

  if (callee.type === AST_NODE_TYPES.Identifier) {
    return isAsyncIdentifier(context, callee);
  }

  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed) {
    if (
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.property.type === AST_NODE_TYPES.Identifier
    ) {
      if (callee.object.name === 'Promise' && KNOWN_PROMISE_METHODS.has(callee.property.name)) {
        return true;
      }

      if (KNOWN_PROMISE_IDENTIFIERS.has(callee.object.name)) {
        return true;
      }
    }
  }

  return false;
}

function isPromiseLikeNewExpression(
  node: TSESTree.NewExpression,
  analyzerServices: AnalyzerServices | null
): boolean {
  if (analyzerServices) {
    const tsNode = analyzerServices.getTypeScriptNode(node);
    if (tsNode && ts.isNewExpression(tsNode)) {
      if (analyzerServices.analyzer.isPromiseLikeExpression(tsNode)) {
        return true;
      }
    }
  }

  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'Promise';
}

function isHandledPromise(node: TSESTree.Node, treatVoidAsHandled: boolean): boolean {
  let current: TSESTree.Node = node;
  let parent = node.parent;

  while (parent) {
    if (WRAPPER_NODE_TYPES.has(parent.type as AST_NODE_TYPES)) {
      current = parent;
      parent = parent.parent;
      continue;
    }

    if (parent.type === AST_NODE_TYPES.AwaitExpression) {
      return true;
    }

    if (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'void') {
      if (treatVoidAsHandled) {
        // Explicitly discarded promise using void operator; treat as intentionally handled unless running in strict mode.
        return true;
      }
      current = parent;
      parent = parent.parent;
      continue;
    }

    if (parent.type === AST_NODE_TYPES.ReturnStatement) {
      return true;
    }

    if (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === current) {
      return true;
    }

    if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === current) {
      if (
        parent.property.type === AST_NODE_TYPES.Identifier &&
        ['then', 'catch', 'finally'].includes(parent.property.name)
      ) {
        return true;
      }
      return false;
    }

    if (
      parent.type === AST_NODE_TYPES.CallExpression ||
      parent.type === AST_NODE_TYPES.NewExpression ||
      parent.type === AST_NODE_TYPES.ArrayExpression ||
      parent.type === AST_NODE_TYPES.Property ||
      parent.type === AST_NODE_TYPES.BinaryExpression ||
      parent.type === AST_NODE_TYPES.TemplateLiteral ||
      parent.type === AST_NODE_TYPES.ConditionalExpression
    ) {
      return true;
    }

    if (parent.type === AST_NODE_TYPES.SequenceExpression) {
      current = parent;
      parent = parent.parent;
      continue;
    }

    if (parent.type === AST_NODE_TYPES.ExpressionStatement) {
      return false;
    }

    return true;
  }

  return true;
}

export default createRule<Options, 'unhandledPromise'>({
  name: 'no-unhandled-promises',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow creating Promises without awaiting them or chaining handlers, preventing hidden rejections and resource leaks.',
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
      unhandledPromise:
        'Unhandled Promise: await this call or return/chain it to avoid swallowing rejections.'
    }
  },
  defaultOptions: [{}],
  create(context: TSESLint.RuleContext<'unhandledPromise', Options>) {
    const options = context.options[0] ?? {};
    if (shouldSkipFile(context, options)) {
      return {};
    }

    const treatVoidAsHandled = (options.strictness ?? 'balanced') !== 'strict';
    const analyzerServices = getCrossFileAnalyzer(context);
    const debug = options.debugExplain === true;

    const createDebugCollector = () =>
      createExplainCollector(debug, {
        onSnapshot: () => {
          if (!analyzerServices) {
            return undefined;
          }

          return {
            step: 'analyzerStats',
            data: analyzerServices.analyzer.getStats()
          };
        }
      });

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const explain = createDebugCollector();
        explain.push('inspectCallExpression');

        if (!isPromiseLikeCall(context, node, analyzerServices)) {
          explain.push('skipNonPromiseCall');
          return;
        }

        explain.push('promiseLikeCall');

        if (!isHandledPromise(node, treatVoidAsHandled)) {
          explain.push('reportUnhandled');
          const trace = explain.snapshot() ?? [];
          const baseReport = {
            node,
            messageId: 'unhandledPromise' as const
          };
          if (debug) {
            context.report({
              ...baseReport,
              data: { trace }
            });
          } else {
            context.report(baseReport);
          }
        }
      },
      NewExpression(node: TSESTree.NewExpression) {
        const explain = createDebugCollector();
        explain.push('inspectNewExpression');

        if (!isPromiseLikeNewExpression(node, analyzerServices)) {
          explain.push('skipNonPromiseNew');
          return;
        }

        explain.push('promiseLikeNew');

        if (!isHandledPromise(node, treatVoidAsHandled)) {
          explain.push('reportUnhandled');
          const trace = explain.snapshot() ?? [];
          const baseReport = {
            node,
            messageId: 'unhandledPromise' as const
          };
          if (debug) {
            context.report({
              ...baseReport,
              data: { trace }
            });
          } else {
            context.report(baseReport);
          }
        }
      }
    };
  }
});
