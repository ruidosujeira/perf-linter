import rule from '../../src/rules/no-redos-regex';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-redos-regex', rule, {
  valid: [
    {
      code: 'const pattern = /^(?:[a-z0-9_-]{3,16})$/i;'
    },
    {
      code: 'const dynamic = new RegExp(userInput);'
    }
  ],
  invalid: [
    {
      code: 'const risky = /(a+)+$/;',
      errors: [{ messageId: 'redosRisk' }]
    },
    {
      code: 'const another = new RegExp("(.*a)+");',
      errors: [{ messageId: 'redosRisk' }]
    }
  ]
});
