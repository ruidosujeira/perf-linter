import fs from 'fs';
import path from 'path';
import rule from '../../src/rules/no-unhandled-promises';
import { createTSRuleTester, createTypedRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();
const fixturesDir = path.resolve(__dirname, '../fixtures');
const typedRuleTester = createTypedRuleTester(fixturesDir);

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
    },
    {
      code: `
        condition ? fetch('/api') : null;
      `,
      errors: [{ messageId: 'unhandledPromise' }]
    },
    {
      code: `
        condition ? doSomething() : fetch('/api');
      `,
      errors: [{ messageId: 'unhandledPromise' }]
    }
  ]
});

typedRuleTester.run('no-unhandled-promises (type-aware)', rule, {
  valid: [
    {
      filename: path.join(fixturesDir, 'no-unhandled-promises/consumer-handled.ts'),
      code: fs.readFileSync(
        path.join(fixturesDir, 'no-unhandled-promises/consumer-handled.ts'),
        'utf8'
      )
    }
  ],
  invalid: [
    {
      filename: path.join(fixturesDir, 'no-unhandled-promises/consumer-unhandled.ts'),
      code: fs.readFileSync(
        path.join(fixturesDir, 'no-unhandled-promises/consumer-unhandled.ts'),
        'utf8'
      ),
      errors: [
        { messageId: 'unhandledPromise', line: 4 },
        { messageId: 'unhandledPromise', line: 5 }
      ]
    },
    {
      filename: path.join(fixturesDir, 'cross-file/consumer.tsx'),
      code: fs.readFileSync(path.join(fixturesDir, 'cross-file/consumer.tsx'), 'utf8'),
      errors: [{ messageId: 'unhandledPromise', line: 21 }]
    }
  ]
});
