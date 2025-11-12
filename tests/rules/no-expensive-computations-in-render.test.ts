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
        function TinyArrayComponent() {
          const filtered = [1,2,3].filter(n => n > 1);
          const serialized = JSON.stringify({ a: 1, b: 2 });
          return <div>{filtered.length}{serialized.length}</div>;
        }
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
        function StrictTinyArray() {
          const filtered = [1,2,3,4,5,6,7].filter(Boolean);
          return <div>{filtered.length}</div>;
        }
      `,
      options: [{ strictness: 'strict' }]
    },
    {
      filename: 'Component.test.tsx',
      code: `
        function TestComponent({ items }: { items: string[] }) {
          const tokens = items.filter(item => item.includes('a'));
          return <List values={tokens} />;
        }
      `,
      options: [{ includeTestFiles: false }]
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
    },
    {
      code: `
        function RelaxedComponent() {
          const filtered = [1,2,3,4].filter(n => n > 2);
          return <div>{filtered.length}</div>;
        }
      `,
      options: [{ strictness: 'relaxed' }],
      errors: [{ messageId: 'expensiveArrayMethod' }]
    }
  ]
});
