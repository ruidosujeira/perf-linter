import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import {
  FunctionNode,
  getFunctionName,
  isComponentName,
  isFunctionNode,
  isMemoHook,
  isUseEffectCallee
} from '../utils/react-ast-utils';

type Options = [];
type MessageIds = 'expensiveArrayMethod' | 'expensiveJsonCall';

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

export default createRule<Options, MessageIds>({
  name: 'no-expensive-computations-in-render',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when expensive computations run inside React render bodies or useEffect callbacks without memoization.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      expensiveArrayMethod:
        'Expensive array method "{{method}}" runs during {{contextType}}. Memoize the result or hoist it outside the render cycle.',
      expensiveJsonCall:
        'JSON.{{method}} executes during {{contextType}}. Cache or memoize heavy serialization/deserialization to avoid blocking renders.'
    }
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
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
          const reactContext = getReactContext(node);
          if (!reactContext || isInsideMemoizedCallback(node)) {
            return;
          }

          context.report({
            node,
            messageId: 'expensiveArrayMethod',
            data: {
              method: arrayMethod,
              contextType: reactContext.kind === 'component' ? 'rendering' : 'useEffect'
            }
          });
          return;
        }

        const jsonMethod = isHeavyJsonCall(node);
        if (jsonMethod) {
          const reactContext = getReactContext(node);
          if (!reactContext || isInsideMemoizedCallback(node)) {
            return;
          }

          context.report({
            node,
            messageId: 'expensiveJsonCall',
            data: {
              method: jsonMethod,
              contextType: reactContext.kind === 'component' ? 'rendering' : 'useEffect'
            }
          });
        }
      }
    };
  }
});
