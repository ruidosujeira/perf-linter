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
    },
    {
      code: `
        for (let i = 0; i < 10; i++) {
          // Small constant string is cheap
          const parts = 'a,b,c'.split(',');
          consume(parts);
        }
      `
    },
    {
      code: `
        for (let i = 0; i < 5; i++) {
          const parts = 'a,b,c,d,e,f,g,h,i'.split(',');
          consume(parts);
        }
      `,
      options: [{ strictness: 'strict' }]
    },
    {
      filename: 'processor.test.ts',
      code: `
        for (const item of items) {
          const tokens = item.value.split('-');
          consume(tokens);
        }
      `,
      options: [{ includeTestFiles: false }]
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
    },
    {
      code: `
        for (let i = 0; i < 3; i++) {
          const normalized = 'abcdefghijklmn'.split('');
          consume(normalized);
        }
      `,
      options: [{ strictness: 'relaxed' }],
      errors: [
        {
          messageId: 'expensiveSplitReplaceLoop',
          data: { method: 'split' }
        }
      ]
    }
  ]
});
