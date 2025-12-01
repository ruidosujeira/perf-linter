import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import {
  isVueWatch,
  isVueOptionsWatch,
  getWatchCallback,
  hasNestedReactivity
} from '../utils/vue-ast-utils';

type Options = [
  {
    strictness?: 'relaxed' | 'balanced' | 'strict';
  }?
];
type MessageIds = 'nestedWatch' | 'deepWatchWarning' | 'watchInLoop' | 'useComputedInstead';

export default createRule<Options, MessageIds>({
  name: 'vue-no-inefficient-watchers',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Detect inefficient watchers in Vue.js that create unnecessary reactivity overhead or could be replaced with computed properties.',
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
      nestedWatch:
        'Watcher contains nested watch/computed calls. This creates cascading reactivity chains that can harm performance.',
      deepWatchWarning:
        'Deep watching can be expensive for large objects. Consider watching specific properties instead or using watchEffect.',
      watchInLoop:
        'Creating watchers inside loops creates multiple reactive dependencies and can cause performance issues. Move watcher outside the loop.',
      useComputedInstead:
        'This watcher only derives a value without side effects. Consider using a computed property instead for better performance.'
    }
  },
  defaultOptions: [{ strictness: 'balanced' }],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const [options = {}] = context.options;
    const strictness = options.strictness || 'balanced';

    // Track if we're inside an Options API component
    let isInOptionsAPI = false;
    let currentWatchObject: TSESTree.ObjectExpression | null = null;

    // Track loop depth
    let loopDepth = 0;

    /**
     * Check if watcher has deep option enabled
     */
    function hasDeepOption(node: TSESTree.CallExpression | TSESTree.Property): boolean {
      // Composition API: watch(source, callback, { deep: true })
      if (node.type === AST_NODE_TYPES.CallExpression) {
        const optionsArg = node.arguments[2];
        if (optionsArg && optionsArg.type === AST_NODE_TYPES.ObjectExpression) {
          return optionsArg.properties.some(
            prop =>
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'deep' &&
              prop.value.type === AST_NODE_TYPES.Literal &&
              prop.value.value === true
          );
        }
      }

      // Options API: watch: { myData: { handler() {...}, deep: true } }
      if (node.type === AST_NODE_TYPES.Property && node.value.type === AST_NODE_TYPES.ObjectExpression) {
        return node.value.properties.some(
          prop =>
            prop.type === AST_NODE_TYPES.Property &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            prop.key.name === 'deep' &&
            prop.value.type === AST_NODE_TYPES.Literal &&
            prop.value.value === true
        );
      }

      return false;
    }

    /**
     * Check if watcher only derives a value (no side effects)
     * This is a simplified heuristic - a watcher should be used for side effects
     */
    function isDerivativeOnly(callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean {
      if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
        // Arrow function with implicit return - likely derivative
        return true;
      }

      const statements = callback.body.body;

      // Single return statement suggests derivative computation
      if (statements.length === 1 && statements[0].type === AST_NODE_TYPES.ReturnStatement) {
        return true;
      }

      // If there are no assignments, mutations, or calls (except returns), likely derivative
      let hasSideEffect = false;

      function checkForSideEffects(node: TSESTree.Node): void {
        if (hasSideEffect) return;

        // Assignment expressions are side effects
        if (
          node.type === AST_NODE_TYPES.AssignmentExpression ||
          node.type === AST_NODE_TYPES.UpdateExpression
        ) {
          hasSideEffect = true;
          return;
        }

        // Function calls (except certain safe ones) are potential side effects
        if (node.type === AST_NODE_TYPES.CallExpression) {
          // Allow things like console.log for debugging
          if (
            node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.type === AST_NODE_TYPES.Identifier &&
            node.callee.object.name === 'console'
          ) {
            // console.* is OK
          } else {
            hasSideEffect = true;
            return;
          }
        }

        // Recursively check children
        const keys = Object.keys(node) as (keyof TSESTree.Node)[];
        for (const key of keys) {
          const value = node[key];
          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              value.forEach(item => {
                if (item && typeof item === 'object' && 'type' in item) {
                  checkForSideEffects(item as TSESTree.Node);
                }
              });
            } else if ('type' in value) {
              checkForSideEffects(value as TSESTree.Node);
            }
          }
        }
      }

      checkForSideEffects(callback.body);
      return !hasSideEffect;
    }

    /**
     * Check a watcher for issues
     */
    function checkWatcher(node: TSESTree.CallExpression | TSESTree.Property, reportNode: TSESTree.Node): void {
      const callback = getWatchCallback(node);
      if (!callback) {
        return;
      }

      // Check for nested reactivity
      if (hasNestedReactivity(callback)) {
        context.report({
          node: reportNode,
          messageId: 'nestedWatch'
        });
      }

      // Check for deep watching (warn in balanced/strict mode)
      if (strictness !== 'relaxed' && hasDeepOption(node)) {
        context.report({
          node: reportNode,
          messageId: 'deepWatchWarning'
        });
      }

      // Check if watcher is inside a loop
      if (loopDepth > 0) {
        context.report({
          node: reportNode,
          messageId: 'watchInLoop'
        });
      }

      // Check if this should be a computed instead (strict mode only)
      // Only check for arrow functions and function expressions, not function declarations
      if (
        strictness === 'strict' &&
        (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          callback.type === AST_NODE_TYPES.FunctionExpression) &&
        isDerivativeOnly(callback)
      ) {
        context.report({
          node: reportNode,
          messageId: 'useComputedInstead'
        });
      }
    }

    return {
      // Detect Options API components
      ExportDefaultDeclaration(node: TSESTree.ExportDefaultDeclaration) {
        if (node.declaration.type === AST_NODE_TYPES.ObjectExpression) {
          isInOptionsAPI = true;
        }
      },

      'ExportDefaultDeclaration:exit'() {
        isInOptionsAPI = false;
      },

      // Track watch object in Options API
      Property(node: TSESTree.Property) {
        if (isInOptionsAPI && isVueOptionsWatch(node)) {
          currentWatchObject = node.value as TSESTree.ObjectExpression;
        }

        // Check Options API watchers
        if (currentWatchObject && node.parent === currentWatchObject) {
          checkWatcher(node, node);
        }
      },

      'Property:exit'(node: TSESTree.Property) {
        if (currentWatchObject && node.value === currentWatchObject) {
          currentWatchObject = null;
        }
      },

      // Track loop depth
      'ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement'() {
        loopDepth++;
      },

      'ForStatement:exit, ForInStatement:exit, ForOfStatement:exit, WhileStatement:exit, DoWhileStatement:exit'() {
        loopDepth--;
      },

      // Check Composition API watch calls
      CallExpression(node: TSESTree.CallExpression) {
        if (isVueWatch(node)) {
          checkWatcher(node, node);
        }
      }
    };
  }
});
