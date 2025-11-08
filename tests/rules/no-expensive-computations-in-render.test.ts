import rule from '../../src/rules/no-expensive-computations-in-render';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-expensive-computations-in-render', rule, {
  valid: [
    {
      code: `
        const Component = ({ items }: { items: number[] }) => {
          const sorted = useMemo(() => [...items].sort(), [items]);
          return <List values={sorted} />;
        };
      `
    },
    {
      code: `
        function Component({ data }: { data: string }) {
          const parsed = useMemo(() => JSON.parse(data), [data]);
          useEffect(() => {
            consume(parsed);
          }, [parsed]);
          return null;
        }
      `
    },
    {
      code: `
        function Component({ items }: { items: number[] }) {
          const compute = () => items.reduce((acc, item) => acc + item, 0);
          return <span>{compute()}</span>;
        }
      `
    }
  ],
  invalid: [
    {
      code: `
        function Component({ items }: { items: number[] }) {
          const filtered = items.filter(item => item > 10);
          return <List values={filtered} />;
        }
      `,
      errors: [{ messageId: 'expensiveArrayMethod' }]
    },
    {
      code: `
        function Component({ items }: { items: number[] }) {
          const sorted = items.sort();
          return <List values={sorted} />;
        }
      `,
      errors: [{ messageId: 'expensiveArrayMethod' }]
    },
    {
      code: `
        function Component({ data }: { data: string }) {
          useEffect(() => {
            const parsed = JSON.parse(data);
            consume(parsed);
          }, [data]);
          return null;
        }
      `,
      errors: [{ messageId: 'expensiveJsonCall' }]
    }
  ]
});
