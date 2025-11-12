import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import {
  BaseRuleOptions,
  createExplainCollector,
  getThresholds,
  shouldSkipFile
} from '../utils/rule-options';
import {
  FunctionNode,
  getFunctionName,
  isComponentName,
  isFunctionNode,
  isMemoHook,
  isUseEffectCallee
} from '../utils/react-ast-utils';

type Options = [BaseRuleOptions?];
type MessageIds =
  | 'expensiveArrayMethod'
  | 'expensiveArrayMethodDebug'
  | 'expensiveJsonCall'
  | 'expensiveJsonCallDebug';

type ReactContextType = 'component' | 'effect';

const HEAVY_ARRAY_METHODS = new Set(['filter', 'reduce', 'sort']);
const HEAVY_JSON_METHODS = new Set(['stringify', 'parse']);

function isHeavyArrayCall(node: TSESTree.CallExpression): string | null {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return null;
  }

  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const method = node.callee.property.name;
  return HEAVY_ARRAY_METHODS.has(method) ? method : null;
}

function isHeavyJsonCall(node: TSESTree.CallExpression): string | null {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return null;
  }

  if (node.callee.object.type !== AST_NODE_TYPES.Identifier || node.callee.object.name !== 'JSON') {
    return null;
  }

  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const method = node.callee.property.name;
  return HEAVY_JSON_METHODS.has(method) ? method : null;
}

// Heuristics to suppress obvious false positives:
// 1. Heavy array method on a tiny literal array (<= threshold simple elements) is cheap.
// 2. JSON.{parse,stringify} on a very small literal object with only literal properties is cheap.
function isTriviallySmallArray(expr: TSESTree.Expression, maxLen: number): boolean {
  if (expr.type !== AST_NODE_TYPES.ArrayExpression) return false;
  if (expr.elements.length === 0) return true;
  if (expr.elements.length > maxLen) return false;
  return expr.elements.every(el => !!el && el.type !== AST_NODE_TYPES.SpreadElement);
}

function isTriviallySmallObject(
  expr: TSESTree.Expression | null | undefined,
  maxProps: number
): boolean {
  if (!expr) return false;
  if (expr.type !== AST_NODE_TYPES.ObjectExpression) return false;
  const props = expr.properties;
  if (props.length === 0) return true;
  if (props.length > maxProps) return false;
  return props.every(p =>
    p.type === AST_NODE_TYPES.Property &&
    !p.computed &&
    p.key.type === AST_NODE_TYPES.Identifier &&
    p.value.type === AST_NODE_TYPES.Literal
  );
}

export default createRule<Options, MessageIds>({
  name: 'no-expensive-computations-in-render',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when expensive computations run inside React render bodies or useEffect callbacks without memoization.',
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
      expensiveArrayMethod:
        'Expensive array method "{{method}}" runs during {{contextType}}. Memoize the result or hoist it outside the render cycle.',
      expensiveArrayMethodDebug:
        'Expensive array method "{{method}}" runs during {{contextType}}. Memoize the result or hoist it outside the render cycle. [debug: confidence {{confidence}}]',
      expensiveJsonCall:
        'JSON.{{method}} executes during {{contextType}}. Cache or memoize heavy serialization/deserialization to avoid blocking renders.',
      expensiveJsonCallDebug:
        'JSON.{{method}} executes during {{contextType}}. Cache or memoize heavy serialization/deserialization to avoid blocking renders. [debug: confidence {{confidence}}]'
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

    const componentFunctions = new WeakSet<FunctionNode>();
    const effectCallbacks = new WeakSet<FunctionNode>();

    function markComponent(node: FunctionNode): void {
      const name = getFunctionName(node);
      if (isComponentName(name)) {
        componentFunctions.add(node);
      }
    }

    function registerEffectCallback(node: TSESTree.CallExpression): void {
      const [callback] = node.arguments;
      if (!callback) {
        return;
      }

      if (
        callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        callback.type === AST_NODE_TYPES.FunctionExpression
      ) {
        effectCallbacks.add(callback);
      }
    }

    function getReactContext(_node: TSESTree.Node): { kind: ReactContextType; name: string | null } | null {
      const ancestors = context.getAncestors();

      for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const ancestor = ancestors[index];
        if (isFunctionNode(ancestor)) {
          if (componentFunctions.has(ancestor)) {
            return { kind: 'component', name: getFunctionName(ancestor) };
          }

          if (effectCallbacks.has(ancestor)) {
            return { kind: 'effect', name: null };
          }

          return null;
        }
      }

      return null;
    }

    function isInsideMemoizedCallback(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current && current.parent) {
        const parent = current.parent as TSESTree.Node;

        if (isFunctionNode(parent) && parent !== current) {
          if (effectCallbacks.has(parent) || componentFunctions.has(parent)) {
            // Once we reach the owning React function we can stop.
            return false;
          }
        }

        if (parent.type === AST_NODE_TYPES.CallExpression && isMemoHook(parent)) {
          return true;
        }

        current = parent;
      }

      return false;
    }

    return {
      FunctionDeclaration: markComponent,
      FunctionExpression: markComponent,
      ArrowFunctionExpression: markComponent,
      CallExpression(node) {
        if (isUseEffectCallee(node.callee)) {
          registerEffectCallback(node);
        }

        const arrayMethod = isHeavyArrayCall(node);
        if (arrayMethod) {
          const explain = createExplainCollector(debug);
          explain.push('heavyArrayCall', { method: arrayMethod });

          // Suppress if obvious tiny literal array target: [1,2,3].filter(...)
          const target = node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : null;
          if (
            target &&
            target.type === AST_NODE_TYPES.ArrayExpression &&
            isTriviallySmallArray(target, thresholds.smallArrayMaxLen)
          ) {
            explain.push('skipTinyLiteralArray');
            return;
          }

          const reactContext = getReactContext(node);
          if (!reactContext) {
            explain.push('skipMissingContext');
            return;
          }

          if (isInsideMemoizedCallback(node)) {
            explain.push('skipInsideMemo');
            return;
          }

          explain.push('reactContext', { kind: reactContext.kind });

          const confidence = arrayMethod === 'sort' ? 0.95 : 0.85;
          explain.push('confidence', { value: confidence });
          if (confidence < thresholds.minConfidenceToReport) {
            explain.push('skipLowConfidence', { threshold: thresholds.minConfidenceToReport });
            return;
          }

          context.report({
            node,
            messageId: debug ? 'expensiveArrayMethodDebug' : 'expensiveArrayMethod',
            data: {
              method: arrayMethod,
              contextType: reactContext.kind === 'component' ? 'rendering' : 'useEffect',
              ...(debug
                ? { confidence: confidence.toFixed(2), trace: explain.snapshot() ?? [] }
                : {})
            }
          });
          return;
        }

        const jsonMethod = isHeavyJsonCall(node);
        if (jsonMethod) {
          const explain = createExplainCollector(debug);
          explain.push('heavyJsonCall', { method: jsonMethod });

          const reactContext = getReactContext(node);
          if (!reactContext) {
            explain.push('skipMissingContext');
            return;
          }

          if (isInsideMemoizedCallback(node)) {
            explain.push('skipInsideMemo');
            return;
          }

          explain.push('reactContext', { kind: reactContext.kind });

          // Suppress false positive for JSON calls on trivial inline object literal: JSON.stringify({a:1})
          const firstArg = node.arguments[0];
          if (firstArg && firstArg.type !== AST_NODE_TYPES.SpreadElement) {
            if (isTriviallySmallObject(firstArg, thresholds.smallObjectMaxProps)) {
              explain.push('skipTinyObjectLiteral');
              return;
            }
          }

          const confidence = jsonMethod === 'parse' ? 0.85 : 0.8;
          explain.push('confidence', { value: confidence });
          if (confidence < thresholds.minConfidenceToReport) {
            explain.push('skipLowConfidence', { threshold: thresholds.minConfidenceToReport });
            return;
          }

          context.report({
            node,
            messageId: debug ? 'expensiveJsonCallDebug' : 'expensiveJsonCall',
            data: {
              method: jsonMethod,
              contextType: reactContext.kind === 'component' ? 'rendering' : 'useEffect',
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
