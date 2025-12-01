import rule from '../../src/rules/vue-no-inefficient-watchers';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('vue-no-inefficient-watchers', rule, {
  valid: [
    {
      name: 'Simple watcher with side effects',
      code: `
        import { watch } from 'vue';
        watch(count, (newVal, oldVal) => {
          console.log('Count changed:', newVal);
          saveToLocalStorage(newVal);
        });
      `
    },
    {
      name: 'Options API watcher',
      code: `
        export default {
          watch: {
            count(newVal, oldVal) {
              this.saveCount(newVal);
            }
          }
        };
      `
    },
    {
      name: 'watchEffect with side effects',
      code: `
        import { watchEffect } from 'vue';
        watchEffect(() => {
          document.title = title.value;
        });
      `
    }
  ],
  invalid: [
    {
      name: 'Nested watch inside watcher',
      code: `
        import { watch } from 'vue';
        watch(count, () => {
          watch(name, () => {
            console.log('Nested!');
          });
        });
      `,
      errors: [
        {
          messageId: 'nestedWatch'
        }
      ]
    },
    {
      name: 'Deep watcher warning',
      code: `
        import { watch } from 'vue';
        watch(obj, () => {
          console.log('Changed');
        }, { deep: true });
      `,
      options: [{ strictness: 'balanced' }],
      errors: [
        {
          messageId: 'deepWatchWarning'
        }
      ]
    },
    {
      name: 'Options API deep watcher',
      code: `
        export default {
          watch: {
            user: {
              handler(newVal) {
                console.log(newVal);
              },
              deep: true
            }
          }
        };
      `,
      options: [{ strictness: 'strict' }],
      errors: [
        {
          messageId: 'deepWatchWarning'
        }
      ]
    },
    {
      name: 'Watcher inside loop',
      code: `
        import { watch } from 'vue';
        for (let i = 0; i < 10; i++) {
          watch(count, () => {
            console.log(i);
          });
        }
      `,
      errors: [
        {
          messageId: 'watchInLoop'
        }
      ]
    },
    {
      name: 'Watcher that should be computed (strict mode)',
      code: `
        import { watch } from 'vue';
        watch(firstName, (newVal) => {
          return newVal.toUpperCase();
        });
      `,
      options: [{ strictness: 'strict' }],
      errors: [
        {
          messageId: 'useComputedInstead'
        }
      ]
    }
  ]
});
