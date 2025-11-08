# Perf Fiscal – Performance Auditing for JavaScript & React

[![Build](https://img.shields.io/badge/build-tsc%20--p%20tsconfig.build-blue)](#development-setup)
[![Tests](https://img.shields.io/badge/tests-vitest%20run-green)](#development-setup)
[![License](https://img.shields.io/github/license/ruidosujeira/perf-linter.svg)](LICENSE)

Perf Fiscal is an ESLint plugin that behaves like a performance auditor living in your lint pipeline. It spots the hotspots that quietly waste CPU, thrash the GC, or sabotage memoization before they reach production.

- **Optimize common patterns:** Replace heavy array idioms, hoist string work, and prefer efficient primitives.
- **Protect React hooks:** Surface unstable dependencies that invalidate `useMemo`/`useCallback` caches.
- **Avoid production fires:** Flag ReDoS-prone regexes and unhandled async flows that hide failures.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Compatibility](#compatibility)
- [Rule Overview](#rule-overview)
- [Rule Spotlights](#rule-spotlights)
- [Development Setup](#development-setup)
- [Contributing](#contributing)
- [Resources](#resources)
- [Roadmap](#roadmap)

## Installation

```bash
npm install --save-dev eslint eslint-plugin-perf-fiscal
# or
pnpm add -D eslint eslint-plugin-perf-fiscal
```

## Quick Start

**Flat config (ESLint >=8.57):**

```js
import perfFiscal from 'eslint-plugin-perf-fiscal';

export default [
  perfFiscal.configs.recommended
];
```

**Classic `.eslintrc.cjs`:**

```js
module.exports = {
  extends: ['plugin:perf-fiscal/recommended']
};
```

You can also cherry-pick rules:

```js
module.exports = {
  plugins: ['perf-fiscal'],
  rules: {
    'perf-fiscal/no-expensive-split-replace': 'warn',
    'perf-fiscal/prefer-array-some': 'error'
  }
};
```

## Compatibility

- **Node.js:** >=18
- **ESLint:** ^8.57.0 or ^9.0.0
- **TypeScript (dev tooling):** 5.5.x (aligned with @typescript-eslint)
- **React guidance:** Framework-agnostic overall, but `no-unstable-usememo-deps` assumes hooks semantics from React 16.8+

## Rule Overview

| Rule | Detects | Quick Fix | Docs |
| --- | --- | --- | --- |
| `prefer-array-some` | `filter(...).length` checks that walk the entire array | Switch to `Array.prototype.some` | [link](docs/rules/prefer-array-some.md) |
| `prefer-for-of` | Using `map`/`forEach` purely for side effects | Replace with `for...of` | [link](docs/rules/prefer-for-of.md) |
| `prefer-object-hasown` | Legacy `hasOwnProperty.call` patterns | Use `Object.hasOwn` | [link](docs/rules/prefer-object-hasown.md) |
| `no-unstable-usememo-deps` | Inline objects/arrays in dependency arrays | Memoize or hoist dependencies | [link](docs/rules/no-unstable-usememo-deps.md) |
| `no-redos-regex` | RegExes prone to catastrophic backtracking | Rewrite without overlapping quantifiers | [link](docs/rules/no-redos-regex.md) |
| `detect-unnecessary-rerenders` | Inline callbacks passed to memoized children | Hoist logic or wrap in `useCallback` | [link](docs/rules/detect-unnecessary-rerenders.md) |
| `no-unhandled-promises` | Fire-and-forget async work | Await or attach handlers | [link](docs/rules/no-unhandled-promises.md) |
| `prefer-promise-all-settled` | `Promise.all(...).catch(...)` expecting partial failures | Use `Promise.allSettled` | [link](docs/rules/prefer-promise-all-settled.md) |
| `no-expensive-computations-in-render` | Heavy work inside render paths | Memoize with `useMemo` or hoist | [link](docs/rules/no-expensive-computations-in-render.md) |
| `no-expensive-split-replace` | Repeated `split`/`replace` in tight loops | Precompute and reuse results | [link](docs/rules/no-expensive-split-replace.md) |

## Rule Spotlights

### Stop allocating full arrays for existence checks

```ts
// Before: walks the whole list and allocates
const hasAny = users.filter(isActive).length > 0;

// After: short-circuits on the first match
const hasAny = users.some(isActive);
```

### Keep React renders pure

```tsx
// Before: re-creates options every render and busts caches
const Child = ({ items }) => {
  const options = items.filter(isExpensive);
  return <List options={options} />;
};

// After: memoize expensive work once
const Child = ({ items }) => {
  const options = useMemo(() => items.filter(isExpensive), [items]);
  return <List options={options} />;
};
```

### Hoist string work out of hot loops

```ts
// Before: split runs for every iteration
for (const item of items) {
  const segments = item.path.split('/');
  consume(segments);
}

// After: compute once and reuse
const segments = path.split('/');
for (const item of items) {
  consume(segments);
}
```

## Development Setup

```bash
npm install
npm run lint
npm run test
npm run build
```

Lint before submitting to catch style regressions flagged by our own rules.

## Contributing

1. **Pitch the heuristic** – open an issue describing the performance smell and expected false positives.
2. **Implement the rule** – add it under `src/rules/`, export from `src/index.ts`, and document in `docs/rules/<rule-name>.md`.
3. **Cover the edges** – add positive and negative fixtures in `tests/rules/` via the shared RuleTester.
4. **Run the pipeline** – execute `npm run lint`, `npm run test`, and `npm run build` before sending a PR.
5. **Explain the signal** – include motivation, any caveats, and sample lint output in the PR description.

Keeping this loop tight ensures the “auditor” stays trustworthy and low-noise.

## Resources

- [React Docs – `useMemo`](https://react.dev/reference/react/useMemo)
- [MDN – Regular Expression Performance](https://developer.mozilla.org/docs/Web/JavaScript/Guide/Regular_expressions/Performance_considerations)
- [V8 Blog – Fast Array Iteration Patterns](https://v8.dev/blog/elements-kinds)

## Roadmap

- Detect additional slow iteration idioms in hot loops.
- Offer autofixes for safe regex rewrites.
- Expand React diagnostics around `useCallback` and selector memoization.

---

Bring the mindset of a performance engineer into every review. Install Perf Fiscal and keep your code lean.
