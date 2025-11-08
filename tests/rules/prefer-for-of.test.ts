import rule from '../../src/rules/prefer-for-of';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('prefer-for-of', rule, {
  valid: [
    {
      code: 'const doubled = items.map(item => item * 2);'
    },
    {
      code: 'for (const item of items) { total += item; }'
    },
    {
      code: 'items.map(item => doSomething(item)).forEach(handler);'
    }
  ],
  invalid: [
    {
      code: 'items.map(item => log(item));',
      errors: [{ messageId: 'preferForOfMap' }]
    },
    {
      code: 'items.forEach(item => console.log(item));',
      errors: [{ messageId: 'preferForOfForEach' }]
    }
  ]
});
