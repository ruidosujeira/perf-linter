# Perf Fiscal – Performance Auditing for JavaScript & React

[![Build](https://img.shields.io/badge/build-tsc%20--p%20tsconfig.build-blue)](#development)
[![Tests](https://img.shields.io/badge/tests-vitest%20run-green)](#development)
[![License](https://img.shields.io/github/license/ruidosujeira/perf-linter.svg)](LICENSE)

Perf Fiscal is an ESLint plugin that acts like a performance auditor living inside your editor. Instead of flagging style nitpicks, it focuses on catching code patterns that burn CPU cycles, invalidate memoization, or open the door to catastrophic backtracking.

## Why Perf Fiscal?

- **Common-Sense Performance:** Replaces wasteful array idioms (like `filter().length > 0`) with efficient alternatives (`some()`).
- **False Optimizations:** Highlights unstable dependencies that break React `useMemo` and `useCallback` caches.
- **Disaster Prevention:** Detects risky regular expressions that could lead to ReDoS incidents.

## Installation

```bash
npm install --save-dev eslint eslint-plugin-perf-fiscal
# or
pnpm add -D eslint eslint-plugin-perf-fiscal
```

## Usage

Add the plugin config to your ESLint setup (flat config example):

```js
import perfFiscal from 'eslint-plugin-perf-fiscal';

export default [
  perfFiscal.configs.recommended
];
```

Or with a classic `.eslintrc.cjs`:

```js
module.exports = {
  extends: ['plugin:perf-fiscal/recommended']
};
```

## Compatibility

- **Node.js:** >=18
- **ESLint:** ^8.57.0 or ^9.0.0
- **TypeScript (dev tooling):** 5.5.x (aligned with @typescript-eslint support window)
- **React guidance:** Rules are framework-agnostic, but `no-unstable-usememo-deps` assumes React 16.8+ hooks semantics.

## Rule Cheatsheet

### `perf-fiscal/prefer-array-some` ([docs](docs/rules/prefer-array-some.md))

- **Anti-pattern** – allocates an intermediate array and iterates fully:

```ts
const hasAny = users.filter(isActive).length > 0;
```

- **Preferred** – short-circuits on the first match without allocations:

```ts
const hasAny = users.some(isActive);
```

### `perf-fiscal/no-unstable-usememo-deps` ([docs](docs/rules/no-unstable-usememo-deps.md))

- **Anti-pattern** – inline dependencies invalidate memoization every render:

```tsx
const memo = useMemo(() => compute(expensive), [{}]);
```

- **Preferred** – hoist or reuse stable references:

```tsx
const stableDeps = useMemo(() => buildDeps(raw), [raw]);
const memo = useMemo(() => compute(expensive), [stableDeps]);
```

### `perf-fiscal/no-redos-regex` ([docs](docs/rules/no-redos-regex.md))

- **Anti-pattern** – nested quantifiers allow catastrophic backtracking:

```ts
const risky = /(a+)+$/;
```

- **Preferred** – rewrite pattern to avoid overlapping quantifiers:

```ts
const safe = /^a+$/;
```

## Development

```bash
npm install
npm run test
npm run build
```

## How to Contribute

1. **Propose the idea** – open an issue describing the performance smell you want to catch and the heuristics you plan to use.
2. **Add the rule** – scaffold under `src/rules/`, export it in `src/index.ts`, and document it in `docs/rules/<rule-name>.md`.
3. **Test thoroughly** – cover positive/negative cases in `tests/rules/` using the shared RuleTester.
4. **Run the pipeline** – execute `npm run lint`, `npm run test`, and `npm run build` before opening a PR.
5. **PR checklist** – include motivation, false-positive analysis, and screenshots or logs of the lint output when possible.

Following this flow keeps the “auditor” trustworthy and avoids noisy diagnostics.

## Related Resources

- [React Docs – `useMemo`](https://react.dev/reference/react/useMemo)
- [MDN – Regular Expression Performance](https://developer.mozilla.org/docs/Web/JavaScript/Guide/Regular_expressions/Performance_considerations)
- [V8 Blog – Fast Array Iteration Patterns](https://v8.dev/blog/elements-kinds)

## Roadmap

- Detect slow iteration patterns in hot loops.
- Auto-suggest safe regex rewrites.
- Expand React-focused diagnostics (useCallback, memoized selectors, etc.).

---

Bring the mindset of a performance engineer into every code review. Install Perf Fiscal and keep your applications lean.
