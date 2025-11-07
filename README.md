# Perf Fiscal – Performance Auditing for JavaScript & React

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

## Available Rules

| Rule | Description |
| --- | --- |
| `perf-fiscal/prefer-array-some` | Replace `array.filter(fn).length > 0` with `array.some(fn)` to avoid unnecessary allocations. |
| `perf-fiscal/no-unstable-usememo-deps` | Prevent inline objects, arrays, and functions inside `useMemo` dependency arrays. |
| `perf-fiscal/no-redos-regex` | Warn on regular expressions that are vulnerable to catastrophic backtracking (ReDoS). |

## Development

```bash
npm install
npm run test
npm run build
```

## Roadmap

- Detect slow iteration patterns in hot loops.
- Auto-suggest safe regex rewrites.
- Expand React-focused diagnostics (useCallback, memoized selectors, etc.).

---

Bring the mindset of a performance engineer into every code review. Install Perf Fiscal and keep your applications lean.
