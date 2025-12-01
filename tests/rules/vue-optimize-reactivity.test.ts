import rule from '../../src/rules/vue-optimize-reactivity';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('vue-optimize-reactivity', rule, {
  valid: [
    {
      name: 'ref with primitive value',
      code: `
        import { ref } from 'vue';
        const count = ref(0);
      `
    },
    {
      name: 'reactive with object',
      code: `
        import { reactive } from 'vue';
        const state = reactive({
          name: 'John',
          age: 30
        });
      `
    },
    {
      name: 'reactive with moderate-sized object',
      code: `
        import { reactive } from 'vue';
        const state = reactive({
          a: 1,
          b: 2,
          c: 3,
          d: 4,
          e: 5
        });
      `
    }
  ],
  invalid: [
    {
      name: 'reactive with primitive value',
      code: `
        import { reactive } from 'vue';
        const count = reactive(42);
      `,
      errors: [
        {
          messageId: 'preferRefForPrimitive'
        }
      ]
    },
    {
      name: 'reactive with string literal',
      code: `
        import { reactive } from 'vue';
        const name = reactive('John');
      `,
      errors: [
        {
          messageId: 'preferRefForPrimitive'
        }
      ]
    },
    {
      name: 'reactive inside loop',
      code: `
        import { reactive } from 'vue';
        for (let i = 0; i < 10; i++) {
          const state = reactive({ count: i });
        }
      `,
      errors: [
        {
          messageId: 'reactiveInLoop'
        }
      ]
    },
    {
      name: 'ref inside loop',
      code: `
        import { ref } from 'vue';
        while (true) {
          const count = ref(0);
        }
      `,
      errors: [
        {
          messageId: 'reactiveInLoop'
        }
      ]
    },
    {
      name: 'reactive with single property (strict mode)',
      code: `
        import { reactive } from 'vue';
        const state = reactive({ count: 0 });
      `,
      options: [{ strictness: 'strict' }],
      errors: [
        {
          messageId: 'unnecessaryReactive'
        }
      ]
    },
    {
      name: 'reactive with too many properties',
      code: `
        import { reactive } from 'vue';
        const state = reactive({
          a: 1, b: 2, c: 3, d: 4, e: 5,
          f: 6, g: 7, h: 8, i: 9, j: 10,
          k: 11, l: 12
        });
      `,
      options: [{ strictness: 'balanced' }],
      errors: [
        {
          messageId: 'largeReactiveObject'
        }
      ]
    }
  ]
});
