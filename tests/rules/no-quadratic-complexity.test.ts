import rule from '../../src/rules/no-quadratic-complexity';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-quadratic-complexity', rule, {
  valid: [
    {
      code: `
        for (let i = 0; i < items.length; i++) {
          doSomething(items[i]);
        }
      `
    },
    {
      code: `
        items.forEach(item => {
          for (let i = 0; i <= 5; i++) {
            console.log(item, i);
          }
        });
      `
    },
    {
      code: `
        for (const item of list) {
          [1, 2, 3].forEach(count => use(item, count));
        }
      `
    },
    {
      code: `
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 2; j++) {
            record(i, j);
          }
        }
      `
    }
  ],
  invalid: [
    {
      code: `
        for (let i = 0; i < items.length; i++) {
          for (let j = 0; j < items.length; j++) {
            console.log(i, j);
          }
        }
      `,
      errors: [{ messageId: 'nestedLoop' }]
    },
    {
      code: `
        items.forEach(item => {
          others.forEach(other => {
            pairs.push([item, other]);
          });
        });
      `,
      errors: [{ messageId: 'nestedLoop' }]
    },
    {
      code: `
        for (let row of rows) {
          while (row.hasChildren()) {
            row = row.next();
          }
        }
      `,
      errors: [{ messageId: 'nestedLoop' }]
    },
    {
      code: `
        function traverse(node) {
          if (!node) {
            return;
          }
          traverse(node.left);
        }
      `,
      errors: [{ messageId: 'recursiveCall', data: { name: 'traverse' } }]
    }
  ]
});
