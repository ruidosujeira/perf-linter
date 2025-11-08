import rule from '../../src/rules/detect-unnecessary-rerenders';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('detect-unnecessary-rerenders', rule, {
  valid: [
    {
      code: `
        import React from 'react';
        const Component = ({ items, onClick }: { items: number[]; onClick: () => void }) => {
          return (
            <>
              {items.map(item => (
                <Item key={item} onClick={onClick} />
              ))}
            </>
          );
        };
      `
    },
    {
      code: `
        import React from 'react';
        const Component = ({ items, onClick }: { items: number[]; onClick: (id: number) => void }) => {
          const handleClick = React.useCallback((id: number) => onClick(id), [onClick]);
          return items.map(item => <Item key={item} onClick={handleClick} />);
        };
      `
    },
    {
      code: `
        const Component = ({ items }: { items: number[] }) => {
          return items.map(item => <li key={item} onClick={() => console.log(item)} />);
        };
      `
    }
  ],
  invalid: [
    {
      code: `
        import React from 'react';
        const Component = ({ items, onClick }: { items: number[]; onClick: (id: number) => void }) => {
          return items.map(item => <Item key={item} onClick={() => onClick(item)} />);
        };
      `,
      errors: [
        {
          messageId: 'inlineCallbackProp',
          data: {
            propName: 'onClick'
          }
        }
      ]
    },
    {
      code: `
        import React from 'react';
        const Component = ({ items, onFocus }: { items: number[]; onFocus: (id: number) => void }) => {
          return items.map(item => {
            return <Row key={item} onFocus={function () { onFocus(item); }} />;
          });
        };
      `,
      errors: [
        {
          messageId: 'inlineCallbackProp',
          data: {
            propName: 'onFocus'
          }
        }
      ]
    }
  ]
});
