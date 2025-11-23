# `perf-fiscal/no-heavy-bundle-imports`

Guard against pulling entire multi-hundred kilobyte libraries into hot paths by importing their full entrypoints. The rule inspects every `ImportDeclaration`, detects packages flagged as heavy, and emits a diagnostic before those imports inflate bundles or slow cold starts.

## Why it matters

Libraries such as `lodash` and `moment` expose an all-in-one entrypoint that drags every helper, locale, or polyfill into the consuming bundle. Even with tree-shaking, many build pipelines treat `require('lodash')` or `import moment from 'moment'` as side-effectful, preventing dead-code elimination. Spotting these imports early keeps client bundles lean and serverless cold starts predictable.

## Default behavior

Out of the box the rule flags:

- `lodash` – suggests swapping to `lodash-es` or importing specific helpers (`lodash/map`).
- `moment` – highlights bundle size and encourages lighter alternatives (`date-fns`, `dayjs`) or lazy-loading locales.

Type-only imports are ignored, and packages can opt into named-import whitelisting.

## Options

```ts
{
  packages: [
    {
      name: 'lodash',
      message: 'Custom guidance for your org',
      allowNamed: false,
      suggestSubpath: true
    },
    {
      name: '@org/legacy-sdk',
      allowNamed: true
    }
  ]
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `packages` | `HeavyPkg[]` | See above | Override or extend the built-in watch list. |
| `packages[].message` | `string` | Rule-provided guidance | Custom text appended to the diagnostic. |
| `packages[].allowNamed` | `boolean` | `false` | Skip warnings when only named ESM specifiers are used. Useful when the package ships per-export tree-shaking. |
| `packages[].suggestSubpath` | `boolean` | `false` | Enables an autofix that rewrites `import { map } from 'lodash'` to `import { map } from 'lodash/map'` when it is safe. |

## Examples

### ❌ Problem

```ts
import { map } from 'lodash';
import moment from 'moment';
```

### ✅ Fix

```ts
import map from 'lodash/map';
import { format } from 'date-fns';
```

## When not to use it

Disable or relax the rule in bundles that already enforce strict subpath imports via build tooling, or in Node-only projects where bundle size is irrelevant.

