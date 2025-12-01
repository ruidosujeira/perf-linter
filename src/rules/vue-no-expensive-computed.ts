import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import {
  isVueComputed,
  isVueOptionsComputed,
  getComputedGetter,
  hasExpensiveOperations,
  hasNestedReactivity
} from '../utils/vue-ast-utils';

type Options = [
  {
    strictness?: 'relaxed' | 'balanced' | 'strict';
  }?
];
type MessageIds = 'expensiveComputed' | 'nestedComputed' | 'complexComputed';

export default createRule<Options, MessageIds>({
  name: 'vue-no-expensive-computed',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Detect inefficient computed properties in Vue.js that perform expensive operations or contain nested reactivity.',
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
      expensiveComputed:
        'Computed property contains expensive operations (loops or array iterations). Consider memoizing the result or moving the computation elsewhere.',
      nestedComputed:
        'Computed property contains nested computed/watch calls. This creates unnecessary reactivity chains and can cause performance issues.',
      complexComputed:
        'Computed property is too complex. Consider breaking it down into smaller computed properties or using a method instead.'
    }
  },
  defaultOptions: [{ strictness: 'balanced' }],
  create(context: TSESLint.RuleContext<MessageIds, Options>) {
    const [options = {}] = context.options;
    const strictness = options.strictness || 'balanced';

    // Track if we're inside an Options API component
    let isInOptionsAPI = false;
    let currentComputedObject: TSESTree.ObjectExpression | null = null;

    /**
     * Count the complexity of a function
     */
    function getComplexity(node: TSESTree.Node): number {
      let complexity = 0;

      function traverse(n: TSESTree.Node): void {
        // Control flow adds complexity
        if (
          n.type === AST_NODE_TYPES.IfStatement ||
          n.type === AST_NODE_TYPES.SwitchCase ||
          n.type === AST_NODE_TYPES.ConditionalExpression ||
          n.type === AST_NODE_TYPES.LogicalExpression
        ) {
          complexity++;
        }

        // Loops add complexity
        if (
          n.type === AST_NODE_TYPES.ForStatement ||
          n.type === AST_NODE_TYPES.ForInStatement ||
          n.type === AST_NODE_TYPES.ForOfStatement ||
          n.type === AST_NODE_TYPES.WhileStatement ||
          n.type === AST_NODE_TYPES.DoWhileStatement
        ) {
          complexity++;
        }

        // Recursively check children
        const keys = Object.keys(n) as (keyof TSESTree.Node)[];
        for (const key of keys) {
          const value = n[key];
          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              value.forEach(item => {
                if (item && typeof item === 'object' && 'type' in item) {
                  traverse(item as TSESTree.Node);
                }
              });
            } else if ('type' in value) {
              traverse(value as TSESTree.Node);
            }
          }
        }
      }

      traverse(node);
      return complexity;
    }

    /**
     * Get complexity threshold based on strictness
     */
    function getComplexityThreshold(): number {
      switch (strictness) {
        case 'relaxed':
          return 10;
        case 'strict':
          return 3;
        case 'balanced':
        default:
          return 5;
      }
    }

    /**
     * Check a computed property for issues
     */
    function checkComputedProperty(
      node: TSESTree.CallExpression | TSESTree.Property,
      reportNode: TSESTree.Node
    ): void {
      const getter = getComputedGetter(node);
      if (!getter) {
        return;
      }

      // Check for nested reactivity
      if (hasNestedReactivity(getter)) {
        context.report({
          node: reportNode,
          messageId: 'nestedComputed'
        });
        return; // Don't report multiple issues for the same computed
      }

      // Check for expensive operations
      if (hasExpensiveOperations(getter)) {
        context.report({
          node: reportNode,
          messageId: 'expensiveComputed'
        });
        return;
      }

      // Check complexity
      const complexity = getComplexity(getter);
      const threshold = getComplexityThreshold();
      if (complexity > threshold) {
        context.report({
          node: reportNode,
          messageId: 'complexComputed'
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

      // Track computed object in Options API
      Property(node: TSESTree.Property) {
        if (isInOptionsAPI && isVueOptionsComputed(node)) {
          currentComputedObject = node.value as TSESTree.ObjectExpression;
        }

        // Check Options API computed properties
        if (currentComputedObject && node.parent === currentComputedObject) {
          checkComputedProperty(node, node);
        }
      },

      'Property:exit'(node: TSESTree.Property) {
        if (currentComputedObject && node.value === currentComputedObject) {
          currentComputedObject = null;
        }
      },

      // Check Composition API computed calls
      CallExpression(node: TSESTree.CallExpression) {
        if (isVueComputed(node)) {
          checkComputedProperty(node, node);
        }
      }
    };
  }
});
