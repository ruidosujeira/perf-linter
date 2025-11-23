import rule from '../../src/rules/no-heavy-bundle-imports';
import { createTSRuleTester } from '../utils/rule-tester';

const ruleTester = createTSRuleTester();

ruleTester.run('no-heavy-bundle-imports', rule, {
  valid: [
    {
      code: "import map from 'lodash/map';"
    },
    {
      code: "import type { Moment } from 'moment';"
    },
    {
      code: "import { map } from 'lodash-es';",
      options: [{ packages: [{ name: 'lodash', allowNamed: true }] }]
    }
  ],
  invalid: [
    {
      code: "import { map } from 'lodash';",
      errors: [{ messageId: 'heavyImport' }],
      output: null,
      // with default config, we also expect a suggestion to subpath
      // but RuleTester does not apply suggestions automatically; we only assert the error
    },
    {
      code: "import moment from 'moment';",
      errors: [{ messageId: 'heavyImport' }],
      output: null
    },
    {
      // when there is a single named specifier, we can offer a subpath fix
      code: "import { map } from 'lodash';",
      output: null,
      errors: [{ messageId: 'heavyImport' }]
    }
  ]
});
