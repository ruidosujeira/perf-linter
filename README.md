# Perf Fiscal

[Bringing cross-file intelligence to JavaScript and React—performance linting, evolved.]

[![npm version](https://img.shields.io/npm/v/eslint-plugin-perf-fiscal.svg?color=informational)](https://www.npmjs.com/package/eslint-plugin-perf-fiscal)
[![build](https://img.shields.io/badge/build-tsc%20--p%20tsconfig.build-blue)](#development-workflow)
[![license](https://img.shields.io/github/license/ruidosujeira/perf-linter.svg)](LICENSE)
![Cross-File Powered](https://img.shields.io/badge/Cross--File-Analysis-blueviolet?style=flat-square)

[Perf Fiscal](https://github.com/ruidosujeira/perf-linter) is a professional-grade ESLint plugin that audits JavaScript and React applications for recurring performance pitfalls. Powered by a cross-file TypeScript analysis engine, it delivers focused diagnostics that highlight code paths likely to waste CPU, thrash the garbage collector, or invalidate memoization strategies before those issues reach production.

> Prefer Portuguese? Confira a versão traduzida em [`README-pt.md`](README-pt.md).

> 💡 **First in class:** Perf Fiscal is the first performance linting toolkit to correlate multi-file signals in real time, using the TypeScript checker to understand components, props, and async flows across your entire project.

## Table of Contents

- [Key Capabilities](#key-capabilities)
- [Cross-File Intelligence (New)](#cross-file-intelligence-new)
- [Getting Started](#getting-started)
- [Rule Catalog](#rule-catalog)
- [Configuration Highlights](#configuration-highlights)
- [Guided Examples](#guided-examples)
- [Compatibility](#compatibility)
- [Development Workflow](#development-workflow)
- [Contributing](#contributing)
- [License](#license)
- [Stay in the Loop](#stay-in-the-loop)

## Key Capabilities

- 🚦 Detects inefficient collection and iteration patterns that perform unnecessary work.
- 🧠 Guards React memoization by flagging unstable props, dependency arrays, and inline render logic.
- 🛰️ Correlates symbol metadata across files to understand memoization boundaries, prop kinds, and async contracts.
- 🔥 Prevents runtime stalls caused by catastrophic regular-expression backtracking.
- ⚡️ Surfaces unhandled asynchronous flows that silently swallow failures.
- ✨ Provides both classic and flat ESLint configuration presets for rapid adoption.

## Cross-File Intelligence (New)

- 🔍 **Whole-project analyzer:** indexes exports, memo wrappers, and expected prop signatures (prop kinds such as function vs. object vs. literal) for every React component, dramatically reducing false positives.
- 🙌 **Context-aware `no-unstable-inline-props`:** automatically relaxes warnings for non-memoized components and aligns diagnostics with the prop’s declared kind.
- 🛟 **Typed `no-unhandled-promises`:** recognizes Promise-returning helpers imported from other modules instead of relying on name-based heuristics alone.
- 🧱 **Extensible infrastructure:** rules query shared metadata through `getCrossFileAnalyzer`, enabling future performance heuristics that understand the entire project graph.

> **🧬 Perf Fiscal is the only ESLint plugin that tracks memo boundaries, prop kinds, and async flows *across files*—delivering smarter, more precise diagnostics than linters confined to a single file.**

### Cross-File Warning Snapshot

```text
tests/fixtures/cross-file/consumer.tsx:21:7
  21:7  warning  perf-fiscal/no-unhandled-promises  Unhandled Promise: await this call or return/chain it to avoid swallowing rejections.
          • Origin: useDataSource (exported from tests/fixtures/cross-file/components.tsx)
```

That single diagnostic traces the async helper to its source file, proving the analyzer understands memo boundaries and async flows beyond the current module.

## Sample Output

When running `perf-fiscal/no-unstable-inline-props`, you'll see context-aware feedback like:

```text
src/pages/Profile.tsx:12:13: [perf-fiscal/no-unstable-inline-props] Passing inline function to memoized child <Child onSelect={...}/> — wrap in useCallback for stable renders (expected prop kind: function)
```

And for cross-file async flow detection:

```text
src/utils/api.ts:8:5: [perf-fiscal/no-unhandled-promises] Unhandled Promise returned from helper `fetchUserData` (imported from utils/http.ts) — consider awaiting or handling rejections.
```

These examples show how analyzer-backed diagnostics include origin and expected prop-kind, making fixes faster and more confident.

## Getting Started

### Installation

```bash
npm install --save-dev eslint eslint-plugin-perf-fiscal
# or
yarn add --dev eslint eslint-plugin-perf-fiscal
# or
pnpm add -D eslint eslint-plugin-perf-fiscal
```

### Flat Config (ESLint ≥8.57)

```js
import perfFiscal from 'eslint-plugin-perf-fiscal';

const tsParser = await import('@typescript-eslint/parser');

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser.default,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  perfFiscal.configs.recommended
];
```

> **Note:** The cross-file analyzer needs project-aware parser settings (`parserOptions.project` + `tsconfigRootDir`) so that it can ask the TypeScript checker about symbol relationships across files.

### Classic Config (`.eslintrc.*`)

```js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname
  },
  extends: ['plugin:perf-fiscal/recommended']
};
```

### Targeting Specific Rules

```js
module.exports = {
  plugins: ['perf-fiscal'],
  rules: {
    'perf-fiscal/no-expensive-split-replace': 'warn',
    'perf-fiscal/prefer-array-some': 'error',
    'perf-fiscal/no-unstable-inline-props': ['warn', {
      ignoreProps: ['className'],
      checkSpreads: false
    }]
  }
};
```

## Rule Catalog

Each rule ships with in-depth guidance in `docs/rules/<rule-name>.md`.

| Rule | Detects | Recommended Action | Documentation |
| --- | --- | --- | --- |
| `perf-fiscal/detect-unnecessary-rerenders` | 🚦 Inline handlers passed to memoized children | Hoist callbacks or wrap with `useCallback` | [docs/rules/detect-unnecessary-rerenders.md](docs/rules/detect-unnecessary-rerenders.md) |
| `perf-fiscal/no-expensive-computations-in-render` | 🧮 Heavy synchronous work executed during renders | Move logic into `useMemo` or outside the component | [docs/rules/no-expensive-computations-in-render.md](docs/rules/no-expensive-computations-in-render.md) |
| `perf-fiscal/no-expensive-split-replace` | 🔁 Repeated string `split`/`replace` inside hot loops | Pre-compute and reuse results | [docs/rules/no-expensive-split-replace.md](docs/rules/no-expensive-split-replace.md) |
| `perf-fiscal/no-redos-regex` | 🔥 Regular expressions prone to catastrophic backtracking | Rewrite expression or add explicit bounds | [docs/rules/no-redos-regex.md](docs/rules/no-redos-regex.md) |
| `perf-fiscal/no-unhandled-promises` | ⚠️ Ignored Promise rejections | Await or attach `.catch`/`.then` handlers | [docs/rules/no-unhandled-promises.md](docs/rules/no-unhandled-promises.md) |
| `perf-fiscal/no-unstable-inline-props` | ✋ Inline functions/objects and prop spreads that churn references | Hoist or memoize prop values before passing | [docs/rules/no-unstable-inline-props.md](docs/rules/no-unstable-inline-props.md) |
| `perf-fiscal/no-unstable-usememo-deps` | 🧩 Non-stable values in dependency arrays | Memoize dependencies or move them outside the render | [docs/rules/no-unstable-usememo-deps.md](docs/rules/no-unstable-usememo-deps.md) |
| `perf-fiscal/prefer-array-some` | ✅ `filter(...).length` checks used for existence | Replace with `Array.prototype.some` | [docs/rules/prefer-array-some.md](docs/rules/prefer-array-some.md) |
| `perf-fiscal/prefer-for-of` | 🔄 Using `map`/`forEach` purely for side effects | Switch to `for...of` for clarity and speed | [docs/rules/prefer-for-of.md](docs/rules/prefer-for-of.md) |
| `perf-fiscal/prefer-object-hasown` | 🧾 Legacy `hasOwnProperty.call` patterns | Use `Object.hasOwn` | [docs/rules/prefer-object-hasown.md](docs/rules/prefer-object-hasown.md) |
| `perf-fiscal/prefer-promise-all-settled` | 🤝 `Promise.all` expecting partial failures | Migrate to `Promise.allSettled` | [docs/rules/prefer-promise-all-settled.md](docs/rules/prefer-promise-all-settled.md) |

## Configuration Highlights

- 🧰 **Flat vs. classic presets:** Use `perfFiscal.configs.recommended` for flat configs or `plugin:perf-fiscal/recommended` for classic configs.
- 🛰️ **Enable cross-file intelligence:** Configure `@typescript-eslint/parser` with `parserOptions.project` and `tsconfigRootDir` so Perf Fiscal can invoke the TypeScript checker and follow symbols across files.
- 🧭 **Severity control:** Adjust rule severities (`off`, `warn`, `error`) to match your governance model.
- ⚙️ **Rule options:** Some rules expose targeted settings. Review each rule’s documentation for schema definitions. Example:

  ```js
  'perf-fiscal/no-unstable-inline-props': ['warn', {
    ignoreProps: ['className', 'data-testid'],
    checkFunctions: true,
    checkObjects: true,
    checkSpreads: true
  }]
  ```

## Guided Examples

### Stabilize React Callbacks

```tsx
// Before: re-creates callbacks every render
const Parent = () => <Child onSelect={() => dispatch()} />;

// After: keep reference identity stable
const Parent = () => {
  const onSelect = useCallback(() => dispatch(), []);
  return <Child onSelect={onSelect} />;
};
```

### Hoist Heavy String Operations

```ts
// Before: expensive split executed for each item
for (const record of records) {
  const parts = record.path.split('/');
  visit(parts);
}

// After: compute once and reuse
const parts = basePath.split('/');
for (const record of records) {
  visit(parts);
}
```

### Memoize Prop Bags Before Spreading

```tsx
// Before: spread introduces unstable references
const Panel = ({ onSubmit }) => <Form {...{ onSubmit: () => onSubmit() }} />;

// After: memoize the spread payload
const Panel = ({ onSubmit }) => {
  const formProps = useMemo(() => ({ onSubmit: () => onSubmit() }), [onSubmit]);
  return <Form {...formProps} />;
};
```

## Compatibility

- **Node.js:** 18+
- **ESLint:** ^8.57.0 or ^9.x
- **TypeScript:** 5.5.x (development dependency aligned with `@typescript-eslint`)
- **React guidance:** React-specific diagnostics assume React 16.8+ hooks semantics

🧪 Typed RuleTester: our [typed runner](tests/utils/rule-tester.ts) and CI simulate real-world React+TS projects with cross-file usage, so every rule ships with analyzer-backed coverage.

## Development Workflow

```bash
npm install
npm run lint
npm run test
npm run build
```

The `lint` script now executes a custom wrapper (`src/cli/run-eslint-with-cache.ts`) that bootstraps ESLint with a persistent cache and fans work out across the available CPU cores. Repeated runs reuse `.eslintcache/` entries, so only files that changed—or whose configuration hash differs—are re-linted. You can forward standard ESLint flags via npm, for example:

```bash
npm run lint -- --fix --cache-location .cache/eslint
```

Set `--no-cache` to force a cold run, or `--quiet` to suppress warnings once the cache is warm. Ensure the code compiles, tests pass, and linting remains clean before opening a pull request.

## Contributing

1. Open an issue describing the performance heuristic, proposed signal, and acceptable false positives.
2. Implement the rule under `src/rules/`, add coverage in `tests/rules/`, and document behavior in `docs/rules/<rule-name>.md`.
3. Export the rule from `src/index.ts`, update recommended configs if appropriate, and link the documentation.
4. Run the pipeline (`npm run lint`, `npm run test`, `npm run build`).
5. Submit the pull request with a clear explanation of the signal, rationale, and known edge cases.

Need help crafting new rules? Reach out in English or Portuguese—the community is ready to help!

## License

Perf Fiscal is released under the [MIT License](LICENSE).

---

Bring the discipline of a performance engineer to every review. Adopt Perf Fiscal to keep your codebase lean, predictable, and production-ready.

## Stay in the Loop

💬 Want updates? ⭐️ Star and follow [ruidosujeira/perf-linter](https://github.com/ruidosujeira/perf-linter) to get notified when we ship new heuristics.
