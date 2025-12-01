import rule from '../../src/rules/vue-no-expensive-computed';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('vue-no-expensive-computed', rule, {
  valid: [
    {
      name: 'Simple computed property with no expensive operations',
      code: `
        import { computed } from 'vue';
        const fullName = computed(() => firstName.value + ' ' + lastName.value);
      `
    },
    {
      name: 'Computed property with simple arithmetic',
      code: `
        import { computed } from 'vue';
        const total = computed(() => price.value * quantity.value);
      `
    },
    {
      name: 'Options API computed with simple logic',
      code: `
        export default {
          computed: {
            fullName() {
              return this.firstName + ' ' + this.lastName;
            }
          }
        };
      `
    },
    {
      name: 'Computed with simple conditional',
      code: `
        import { computed } from 'vue';
        const status = computed(() => count.value > 0 ? 'active' : 'inactive');
      `
    }
  ],
  invalid: [
    {
      name: 'Computed property with expensive loop',
      code: `
        import { computed } from 'vue';
        const processedItems = computed(() => {
          const result = [];
          for (let i = 0; i < items.value.length; i++) {
            result.push(items.value[i] * 2);
          }
          return result;
        });
      `,
      errors: [
        {
          messageId: 'expensiveComputed'
        }
      ]
    },
    {
      name: 'Computed property with filter operation',
      code: `
        import { computed } from 'vue';
        const activeItems = computed(() => items.value.filter(item => item.active));
      `,
      errors: [
        {
          messageId: 'expensiveComputed'
        }
      ]
    },
    {
      name: 'Nested computed calls',
      code: `
        import { computed } from 'vue';
        const result = computed(() => {
          const nested = computed(() => x.value + 1);
          return nested.value * 2;
        });
      `,
      errors: [
        {
          messageId: 'nestedComputed'
        }
      ]
    },
    {
      name: 'Options API computed with expensive operation',
      code: `
        export default {
          computed: {
            sortedItems() {
              return this.items.map(item => item.name);
            }
          }
        };
      `,
      errors: [
        {
          messageId: 'expensiveComputed'
        }
      ]
    },
    {
      name: 'Complex computed with multiple branches',
      code: `
        import { computed } from 'vue';
        const result = computed(() => {
          if (a.value > 0) {
            if (b.value > 0) {
              if (c.value > 0) {
                if (d.value > 0) {
                  if (e.value > 0) {
                    if (f.value > 0) {
                      return 1;
                    }
                  }
                }
              }
            }
          }
          return 0;
        });
      `,
      options: [{ strictness: 'balanced' }],
      errors: [
        {
          messageId: 'complexComputed'
        }
      ]
    }
  ]
});
