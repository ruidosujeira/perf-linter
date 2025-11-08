import rule from '../../src/rules/prefer-object-hasown';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('prefer-object-hasown', rule, {
  valid: [
    {
      code: 'Object.hasOwn(config, "enabled");'
    },
    {
      code: 'const has = Object.hasOwn(data, key);'
    }
  ],
  invalid: [
    {
      code: 'Object.prototype.hasOwnProperty.call(config, "enabled");',
      output: 'Object.hasOwn(config, "enabled");',
      errors: [{ messageId: 'preferObjectHasOwn' }]
    },
    {
      code: 'Object.hasOwnProperty.call(config, key);',
      output: 'Object.hasOwn(config, key);',
      errors: [{ messageId: 'preferObjectHasOwn' }]
    },
    {
      code: 'config.hasOwnProperty(key);',
      output: 'Object.hasOwn(config, key);',
      errors: [{ messageId: 'preferObjectHasOwn' }]
    }
  ]
});
