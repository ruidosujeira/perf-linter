import fs from 'fs';
import path from 'path';
import rule from '../../src/rules/prefer-array-some';
import { createTSRuleTester, createTypedRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();
const fixturesDir = path.resolve(__dirname, '../fixtures');
const typedFixturesDir = path.resolve(__dirname, '../typed-fixtures/prefer-array-some');
const typedRuleTester = createTypedRuleTester(typedFixturesDir);

ruleTester.run('prefer-array-some', rule, {
  valid: [
    {
      code: 'const hasAny = items.some(predicate);'
    },
    {
      code: 'const filtered = items.filter(predicate); console.log(filtered.length);'
    },
    {
      code: `
        const $items = $('.item');

        if ($items.filter('.active').length > 0) {
          console.log('has active items');
        }
      `
    }
  ],
  invalid: [
    {
      code: 'const hasAny = [1, 2, 3].filter(value => value > 0).length > 0;',
      output: 'const hasAny = [1, 2, 3].some(value => value > 0);',
      errors: [{ messageId: 'preferSome' }]
    },
    {
      code: 'if ([1, 2, 3].filter(value => value > 0).length === 0) { handleEmpty(); }',
      output: 'if (![1, 2, 3].some(value => value > 0)) { handleEmpty(); }',
      errors: [{ messageId: 'preferSome' }]
    },
    {
      code: 'const exists = [1, 2, 3].filter(value => value > 0).length !== 0;',
      output: 'const exists = [1, 2, 3].some(value => value > 0);',
      errors: [{ messageId: 'preferSome' }]
    }
  ]
});

typedRuleTester.run('prefer-array-some (type-aware)', rule, {
  valid: [
    {
      filename: path.join(typedFixturesDir, 'jquery-collection.ts'),
      code: fs.readFileSync(
        path.join(typedFixturesDir, 'jquery-collection.ts'),
        'utf8'
      )
    }
  ],
  invalid: [
    {
      filename: path.join(typedFixturesDir, 'array-usage.ts'),
      code: fs.readFileSync(path.join(typedFixturesDir, 'array-usage.ts'), 'utf8'),
      output: fs.readFileSync(
        path.join(typedFixturesDir, 'array-usage.fixed.ts'),
        'utf8'
      ),
      errors: [{ messageId: 'preferSome', line: 3 }]
    }
  ]
});
