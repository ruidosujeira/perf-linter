import rule from '../../src/rules/prefer-array-some';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('prefer-array-some', rule, {
  valid: [
    {
      code: 'const hasAny = items.some(predicate);'
    },
    {
      code: 'const filtered = items.filter(predicate); console.log(filtered.length);'
    }
  ],
  invalid: [
    {
      code: 'const hasAny = items.filter(predicate).length > 0;',
      output: 'const hasAny = items.some(predicate);',
      errors: [{ messageId: 'preferSome' }]
    },
    {
      code: 'if (items.filter(predicate).length === 0) { handleEmpty(); }',
      output: 'if (!items.some(predicate)) { handleEmpty(); }',
      errors: [{ messageId: 'preferSome' }]
    },
    {
      code: 'const exists = items.filter(predicate).length !== 0;',
      output: 'const exists = items.some(predicate);',
      errors: [{ messageId: 'preferSome' }]
    }
  ]
});
