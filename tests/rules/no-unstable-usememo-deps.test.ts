import rule from '../../src/rules/no-unstable-usememo-deps';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-unstable-usememo-deps', rule, {
  valid: [
    {
      code: 'const result = useMemo(() => compute(expensive), [expensive]);'
    },
    {
      code: 'const deps = [config]; const memo = React.useMemo(() => build(config), deps);'
    },
    {
      code: `
        import { useMemo } from 'react';
        const sharedOptions = {};
        function Dashboard({ data }: { data: string[] }) {
          return useMemo(() => analyze(data, sharedOptions), [data, sharedOptions]);
        }
      `
    },
    {
      code: `
        import React, { useMemo } from 'react';
        function Child({ options }: { options: Record<string, unknown> }) {
          const stableOptions = useMemo(() => options, [options]);
          return stableOptions;
        }
        function Parent() {
          const options = useMemo(() => ({ cache: true }), []);
          return <Child options={options} />;
        }
      `
    }
  ],
  invalid: [
    {
      code: 'useMemo(() => compute(expensive));',
      errors: [{ messageId: 'missingDepsArray' }]
    },
    {
      code: 'useMemo(() => compute(expensive), [{}]);',
      errors: [
        {
          messageId: 'unstableDependencyInline',
          data: { index: '0', expressionKind: 'object literal' }
        }
      ]
    },
    {
      code: 'React.useMemo(() => compute(expensive), [[foo]]);',
      errors: [
        {
          messageId: 'unstableDependencyInline',
          data: { index: '0', expressionKind: 'array literal' }
        }
      ]
    },
    {
      code: 'useMemo(() => compute(expensive), [() => other()]);',
      errors: [
        {
          messageId: 'unstableDependencyInline',
          data: { index: '0', expressionKind: 'arrow function' }
        }
      ]
    },
    {
      code: `
        import { useMemo } from 'react';
        function Component() {
          const options = {};
          return useMemo(() => compute(options), [options]);
        }
      `,
      errors: [
        {
          messageId: 'unstableDependencyLocal',
          data: {
            index: '0',
            name: 'options',
            description: 'an object literal created during render',
            location: 'component Component'
          }
        }
      ]
    },
    {
      code: `
        import React, { useMemo } from 'react';
        function Child({ options }: { options: Record<string, unknown> }) {
          return useMemo(() => process(options), [options]);
        }
        function Parent() {
          const options = {};
          return <Child options={options} />;
        }
      `,
      errors: [
        {
          messageId: 'unstableDependencyProp',
          data: {
            index: '0',
            propName: 'options',
            parentLocation: 'component Parent',
            description: 'an object literal created during render'
          }
        }
      ]
    },
    {
      code: `
        import React, { useMemo } from 'react';
        function Child(props: { options: Record<string, unknown> }) {
          const { options } = props;
          return useMemo(() => process(options), [options]);
        }
        function Parent() {
          const options = {};
          return <Child options={options} />;
        }
      `,
      errors: [
        {
          messageId: 'unstableDependencyProp',
          data: {
            index: '0',
            propName: 'options',
            parentLocation: 'component Parent',
            description: 'an object literal created during render'
          }
        }
      ]
    }
  ]
});
