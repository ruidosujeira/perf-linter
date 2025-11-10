import rule from '../../src/rules/no-quadratic-complexity';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-quadratic-complexity', rule, {
  valid: [
    {
      code: `
        items.forEach(item => {
          others.forEach(other => {
            console.log(item, other);
          });
        });
      `
    },
    {
      code: `
        for (const item of items) {
          for (const other of others) {
            console.log(item, other);
          }
        }
      `
    },
    {
      code: `
        const doubled = items.map(item => item * 2);
        moreItems.forEach(other => {
          console.log(other);
        });
      `
    }
  ],
  invalid: [
    {
      code: `
        items.forEach(item => {
          items.forEach(other => {
            console.log(item, other);
          });
        });
      `,
      errors: [{ messageId: 'quadratic', data: { source: 'items' } }]
    },
    {
      code: `
        for (const item of items) {
          for (const other of items) {
            console.log(item, other);
          }
        }
      `,
      errors: [{ messageId: 'quadratic', data: { source: 'items' } }]
    },
    {
      code: `
        items.map(item => {
          return items.some(other => other === item);
        });
      `,
      errors: [{ messageId: 'quadratic', data: { source: 'items' } }]
    }
  ]
});
