import rule from '../../src/rules/no-inline-context-value';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-inline-context-value', rule, {
  valid: [
    {
      filename: 'ctx.tsx',
      code: `
        const Ctx = React.createContext(null);
        export function App(){
          const value = React.useMemo(() => ({ a: 1 }), []);
          return <Ctx.Provider value={value}>{null}</Ctx.Provider>;
        }
      `
    },
    {
      filename: 'ctx.tsx',
      code: `
        const Ctx = React.createContext(null);
        const value = { a: 1 };
        export const App = () => <Ctx.Provider value={value}>{null}</Ctx.Provider>;
      `
    },
    {
      // Not a Provider member expression
      filename: 'x.tsx',
      code: `
        const Provider = (p:any) => null;
        const App = () => <Provider value={{a:1}} />;
      `
    }
  ],
  invalid: [
    {
      filename: 'ctx.tsx',
      code: `
        const Ctx = React.createContext(null);
        export const App = () => <Ctx.Provider value={{ a: 1 }}>{null}</Ctx.Provider>;
      `,
      errors: [{ messageId: 'inlineContextValue' }]
    },
    {
      filename: 'ctx.tsx',
      code: `
        const Ctx = React.createContext(null);
        export const App = () => <Ctx.Provider value={[1,2,3]}>{null}</Ctx.Provider>;
      `,
      errors: [{ messageId: 'inlineContextValue' }]
    }
  ]
});
