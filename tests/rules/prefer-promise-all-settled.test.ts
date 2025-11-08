import rule from '../../src/rules/prefer-promise-all-settled';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('prefer-promise-all-settled', rule, {
  valid: [
    {
      code: `
        async function load(promises: Promise<unknown>[]) {
          await Promise.all(promises);
        }
      `
    },
    {
      code: `
        Promise.all(tasks).then(handleSuccess);
      `
    },
    {
      code: `
        await Promise.allSettled(tasks);
      `
    }
  ],
  invalid: [
    {
      code: `
        Promise.all(tasks).catch(handleError);
      `,
      errors: [{ messageId: 'preferAllSettled' }]
    },
    {
      code: `
        async function load(promises: Promise<unknown>[]) {
          try {
            await Promise.all(promises);
          } catch (error) {
            console.error(error);
          }
        }
      `,
      errors: [{ messageId: 'preferAllSettled' }]
    }
  ]
});
