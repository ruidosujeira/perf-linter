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
    }
  ],
  invalid: [
    {
      code: 'useMemo(() => compute(expensive));',
      errors: [{ messageId: 'missingDepsArray' }]
    },
    {
      code: 'useMemo(() => compute(expensive), [{}]);',
      errors: [{ messageId: 'unstableDependency', data: { index: '0' } }]
    },
    {
      code: 'React.useMemo(() => compute(expensive), [[foo]]);',
      errors: [{ messageId: 'unstableDependency', data: { index: '0' } }]
    },
    {
      code: 'useMemo(() => compute(expensive), [() => other()]);',
      errors: [{ messageId: 'unstableDependency', data: { index: '0' } }]
    }
  ]
});
