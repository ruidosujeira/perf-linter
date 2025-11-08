import rule from '../../src/rules/no-expensive-split-replace';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-expensive-split-replace', rule, {
  valid: [
    {
      code: `
        const text = payload.replace(/\s+/g, ' ');
      `
    },
    {
      code: `
        function normalize(text: string) {
          return text.split(',');
        }
      `
    },
    {
      code: `
        const parts = cached.split(',');
        for (const item of list) {
          use(parts);
        }
      `
    },
    {
      code: `
        data.map(item => {
          const tokens = cache[item.id];
          return tokens.join(',');
        });
      `
    }
  ],
  invalid: [
    {
      code: `
        for (const item of items) {
          const parts = item.path.split('/');
          consume(parts);
        }
      `,
      errors: [{ messageId: 'expensiveSplitReplaceLoop', data: { method: 'split' } }]
    },
    {
      code: `
        while (hasNext()) {
          input = input.replace(/\s+/g, '');
        }
      `,
      errors: [{ messageId: 'expensiveSplitReplaceLoop', data: { method: 'replace' } }]
    },
    {
      code: `
        items.map(item => item.slug.split('-'));
      `,
      errors: [
        {
          messageId: 'expensiveSplitReplaceIteration',
          data: { iteration: 'map', method: 'split' }
        }
      ]
    },
    {
      code: `
        list.forEach(entry => {
          const normalized = entry.value.replaceAll('..', '.');
          push(normalized);
        });
      `,
      errors: [
        {
          messageId: 'expensiveSplitReplaceIteration',
          data: { iteration: 'forEach', method: 'replaceAll' }
        }
      ]
    }
  ]
});
