import fs from 'fs';
import path from 'path';
import rule from '../../src/rules/no-unstable-inline-props';
import { createTSRuleTester, createTypedRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();
const fixturesDir = path.resolve(__dirname, '../fixtures');
const typedRuleTester = createTypedRuleTester(fixturesDir);

ruleTester.run('no-unstable-inline-props', rule, {
  valid: [
    {
      code: `
        const Component = () => <button onClick={() => {}} />;
      `
    },
    {
      code: `
        const handler = () => {};
        const Component = () => <Child onClick={handler} />;
      `
    },
    {
      code: `
        const Component = () => {
          const handle = useCallback(() => {}, []);
          return <Child onClick={handle} />;
        };

        typedRuleTester.run('no-unstable-inline-props (type-aware)', rule, {
          valid: [
            {
              filename: path.join(fixturesDir, 'no-unstable-inline-props/non-memo-inline.tsx'),
              code: fs.readFileSync(
                path.join(fixturesDir, 'no-unstable-inline-props/non-memo-inline.tsx'),
                'utf8'
              )
            },
            {
              filename: path.join(fixturesDir, 'no-unstable-inline-props/non-memo-spread.tsx'),
              code: fs.readFileSync(
                path.join(fixturesDir, 'no-unstable-inline-props/non-memo-spread.tsx'),
                'utf8'
              )
            }
          ],
          invalid: [
            {
              filename: path.join(fixturesDir, 'no-unstable-inline-props/memo-inline.tsx'),
              code: fs.readFileSync(
                path.join(fixturesDir, 'no-unstable-inline-props/memo-inline.tsx'),
                'utf8'
              ),
              errors: [
                {
                  messageId: 'inlineFunctionProp',
                  line: 3
                }
              ]
            },
            {
              filename: path.join(fixturesDir, 'no-unstable-inline-props/non-memo-inline.tsx'),
              code: fs.readFileSync(
                path.join(fixturesDir, 'no-unstable-inline-props/non-memo-inline.tsx'),
                'utf8'
              ),
              options: [{ relaxForNonMemoized: false }],
              errors: [
                {
                  messageId: 'inlineFunctionProp',
                  line: 3
                }
              ]
            }
          ]
        });
      `
    },
    {
      code: `
        const Component = () => {
          const handle = React.useCallback(() => {}, []);
          return <Child onClick={handle} />;
        };
      `
    },
    {
      code: `
        const Component = ({ items }: { items: number[] }) => {
          const options = useMemo(() => ({ items }), [items]);
          return <Child options={options} />;
        };
      `
    },
    {
      code: `
        const Config = () => {
          const options = useMemo(() => ({ id: 1 }), []);
          return <Child options={options} />;
        };
      `
    },
    {
      code: `
        const Component = () => <Child data={{ id: 1 }} />;
      `,
      options: [{ ignoreProps: ['data'] }]
    },
    {
      code: `
        const Component = () => {
          const { onSelect } = useMemo(() => ({ onSelect: () => {} }), []);
          return <Child onSelect={onSelect} />;
        };
      `
    },
    {
      code: `
        const Component = (props: { onClick(): void }) => {
          const stable = useMemo(() => ({ ...props }), [props]);
          return <Child {...stable} />;
        };
      `
    }
  ],
  invalid: [
    {
      code: `
        const Parent = () => <Child onClick={() => {}} />;
      `,
      errors: [
        {
          messageId: 'inlineFunctionProp',
          data: { propName: 'onClick' }
        }
      ]
    },
    {
      code: `
        const Parent = () => <Child config={{ a: 1 }} />;
      `,
      errors: [
        {
          messageId: 'inlineObjectProp',
          data: { propName: 'config' }
        }
      ]
    },
    {
      code: `
        const Parent = () => {
          const handle = () => {};
          const forwarded = handle;
          return <Child onClick={forwarded} />;
        };
      `,
      errors: [
        {
          messageId: 'unstableIdentifierFunctionProp',
          data: { propName: 'onClick', identifier: 'forwarded' }
        }
      ]
    },
    {
      code: `
        const Parent = () => {
          const options = { nested: true };
          return <Child options={options} />;
        };
      `,
      errors: [
        {
          messageId: 'unstableIdentifierObjectProp',
          data: { propName: 'options', identifier: 'options' }
        }
      ]
    },
    {
      code: `
        const Parent = () => {
          function handleClick() {}
          return <Child onClick={handleClick} />;
        };
      `,
      errors: [
        {
          messageId: 'unstableIdentifierFunctionProp',
          data: { propName: 'onClick', identifier: 'handleClick' }
        }
      ]
    },
    {
      code: `
        const Parent = () => {
          const { onClick } = { onClick: () => {} };
          return <Child onClick={onClick} />;
        };
      `,
      errors: [
        {
          messageId: 'unstableIdentifierObjectProp',
          data: { propName: 'onClick', identifier: 'onClick' }
        }
      ]
    },
    {
      code: `
        const Parent = () => {
          const { onClick: handle } = { onClick: () => {} };
          return <Child onClick={handle} />;
        };
      `,
      errors: [
        {
          messageId: 'unstableIdentifierObjectProp',
          data: { propName: 'onClick', identifier: 'handle' }
        }
      ]
    },
    {
      code: `
        const Parent = () => <Child {...{ onClick: () => {} }} />;
      `,
      errors: [
        {
          messageId: 'spreadCreatesUnstableProps',
          data: { expression: '{ onClick: () => {} }' }
        }
      ]
    },
    {
      code: `
        const Parent = () => {
          const props = { onClick: () => {} };
          return <Child {...props} />;
        };
      `,
      errors: [
        {
          messageId: 'spreadCreatesUnstableProps',
          data: { expression: 'props' }
        }
      ]
    }
  ]
});
