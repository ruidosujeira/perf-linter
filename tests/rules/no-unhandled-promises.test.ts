import rule from '../../src/rules/no-unhandled-promises';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-unhandled-promises', rule, {
  valid: [
    {
      code: `
        async function load() {
          await fetch('/api/data');
        }
      `
    },
    {
      code: `
        const request = fetch('/api/data');
        export { request };
      `
    },
    {
      code: `
        const promise = asyncFn();
        promise.then(handle);
      `
    }
  ],
  invalid: [
    {
      code: `
        async function load() {
          fetch('/api/data');
        }
      `,
      errors: [{ messageId: 'unhandledPromise' }]
    },
    {
      code: `
        const task = async () => {};
        task();
      `,
      errors: [{ messageId: 'unhandledPromise' }]
    },
    {
      code: `
        Promise.resolve(value);
      `,
      errors: [{ messageId: 'unhandledPromise' }]
    },
    {
      code: `
        new Promise(resolve => resolve());
      `,
      errors: [{ messageId: 'unhandledPromise' }]
    }
  ]
});
