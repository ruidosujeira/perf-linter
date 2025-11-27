# Perf Fiscal — Performance lint for codebases at scale

[![npm version](https://img.shields.io/npm/v/eslint-plugin-perf-fiscal.svg?color=informational)](https://www.npmjs.com/package/eslint-plugin-perf-fiscal)
[![build](https://img.shields.io/badge/build-tsc%20--p%20tsconfig.build-blue)](#development)
[![license](https://img.shields.io/github/license/ruidosujeira/perf-linter.svg)](LICENSE)
![Cross-File Powered](https://img.shields.io/badge/Cross--File-Intelligence-blueviolet?style=flat-square)
![Rust Core](https://img.shields.io/badge/Core-Rust-orange?style=flat-square)

Ship fast. Stay fast.

Perf Fiscal is a professional ESLint plugin that brings the discipline of a performance engineer to every code review. It understands your whole codebase (cross-file analysis), speaks React fluently, and leverages a Rust core for speed and accuracy.

Prefer Portuguese? Veja a versão traduzida em [`README-pt.md`](README-pt.md).

## Contents

- [Why Perf Fiscal](#why-perf-fiscal)
- [What’s New](#whats-new)
- [Quick Start](#quick-start)
- [Rust Core Engine](#rust-core-engine)
- [Cross-File Intelligence](#cross-file-intelligence)
- [Configuration](#configuration)
- [Rule Catalog](#rule-catalog)
- [Examples](#examples)
- [Compatibility](#compatibility)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)
- [Stay in the Loop](#stay-in-the-loop)

## Why Perf Fiscal

- Whole-codebase awareness: understands components, props, async flows, and imports across module boundaries.
- React-savvy: protects memo boundaries, dependency arrays, and Context stability with actionable suggestions.
- Performance-first rules: catch heavy loops, quadratic growth, costly string ops, and bundle pitfalls early.
- Supply-aware imports: detect heavy entrypoints and suggest subpath or alternative imports with confidence.
- Rust acceleration: optional Rust core for parsing, indexing, and security checks with safe JS fallbacks.
- Low friction: flat and classic ESLint presets, zero mandatory setup beyond your existing TS config.

## Cross-File Intelligence

- 🔍 Whole-project analyzer: indexes exports, memo wrappers, and expected prop signatures (function | object | array | primitive) for each React component, dramatically reducing false positives.
- 🙌 Context-aware `no-unstable-inline-props`: relaxes warnings for non-memoized components and aligns diagnostics with the prop’s declared kind.
- 🛟 Typed `no-unhandled-promises`: recognizes Promise-returning helpers imported from other modules rather than relying on names.
- 🧱 Extensible infrastructure: rules query shared metadata via `getCrossFileAnalyzer`, enabling heuristics that understand the entire project graph.

Perf Fiscal tracks memo boundaries, prop kinds, and async flows across files—delivering smarter, low-noise diagnostics that scale.

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

## What’s New

- ⚡ Cross-File Metadata Graph (Rust): index your project in parallel and expose component/props/import/export metadata through a fast JSON snapshot.
- 🧩 SWC-based Rust parser: new `parse` CLI for JS/TS/JSX/TSX with a thin TypeScript bridge and graceful fallbacks.
- 🦀 Rust security guardrail: `check-redos` bolsters `no-redos-regex` detection with safe JSON I/O and timeouts.
- 📦 Smarter import hygiene: `no-heavy-bundle-imports` helps avoid pulling monolithic entrypoints; docs updated with rationale and options.
- 🛡️ React stability: `no-inline-context-value` prevents Context churn before it cascades across your app.

See detailed notes in [docs/changelog/0.5.0.md](docs/changelog/0.5.0.md). To opt out of analyzer trace data, keep `debugExplain` set to `false` (default) or disable per rule:

```json
{
  "perf-fiscal/no-unhandled-promises": ["warn", { "debugExplain": false }]
}
```

Found a regression or noisy warning? Use the dedicated [False Positive issue template](https://github.com/ruidosujeira/perf-linter/issues/new?template=false-positive.md) so we can triage quickly.

## Quick Start

> 🧭 **Need typed diagnostics?** Review the [Typed Analyzer Setup](docs/typed-analyzer-setup.md) checklist. In short: (1) create a
> lint-oriented `tsconfig` that includes every file you want to analyze, (2) point `parserOptions.project`/`tsconfigRootDir` to
> that config, and (3) keep `@typescript-eslint/parser` in sync with ESLint. If ESLint reports "Cannot read file
> 'tsconfig...json'" or "parserServices to be generated," double-check the `tsconfigRootDir` guidance in the setup guide.

### Installation

```bash
npm install --save-dev eslint eslint-plugin-perf-fiscal
# or
yarn add --dev eslint eslint-plugin-perf-fiscal
# or
pnpm add -D eslint eslint-plugin-perf-fiscal
```

## Rust Core Engine

Perf Fiscal can optionally leverage a lightweight Rust core for speed and precision. When unavailable, the plugin gracefully falls back to the existing JS implementations.

Build once (local or CI):

```bash
cd rust/perf-linter-core
cargo build --release
```

Optionally point to the binary (if not on the default path):

```bash
export PERF_LINTER_CORE="$(pwd)/target/release/perf-linter-core"
```

Available commands and bridges:

- ReDoS checker: `perf-linter-core check-redos` (STDIN `{ "pattern": string }` → STDOUT `{ "safe": boolean, "rewrite"?: string }`)
- Parser (SWC): `echo "const x=1" | perf-linter-core parse --filename input.tsx`
- Project indexer: `perf-linter-core index /path/to/project > metadata.json`

TypeScript bridges:

- Parser bridge: `src/utils/rust-parser.ts` (`parseWithRust(source, filename)` with cache + timeout)
- Cross-file analyzer bridge: `src/analyzer/cross-file.ts` (`getCrossFileAnalyzer(projectRoot)` with file + memory cache)

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

Note: The cross-file analyzer benefits from project-aware parser settings (`parserOptions.project` + `tsconfigRootDir`) so it can ask the TypeScript checker about symbol relationships across files.

## Migration Guides

Ready to adopt Perf Fiscal in an existing codebase? Choose the guide that matches your architecture:

- [React Application Migration Guide](docs/migrations/react.md) – stage the rollout across React apps and React Native projects while maintaining memo stability.
- [Node.js Service Migration Guide](docs/migrations/node-services.md) – integrate the plugin into backend services, CLIs, and worker processes.
- [Mixed Monorepo Migration Guide](docs/migrations/monorepo.md) – coordinate adoption across workspaces that blend frontends, services, and shared packages.

Each guide includes step-by-step rollout plans, configuration snippets, and compatibility notes tailored to the targeted environment.

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
| `perf-fiscal/no-heavy-bundle-imports` | 📦 Default imports from hefty packages (`lodash`, `moment`, legacy SDKs) | Switch to subpath imports or lighter alternatives | [docs/rules/no-heavy-bundle-imports.md](docs/rules/no-heavy-bundle-imports.md) |
| `perf-fiscal/no-inline-context-value` | 🫧 Inline objects/arrays passed to `Context.Provider value` | Wrap the value in `useMemo` or hoist it outside renders | [docs/rules/no-inline-context-value.md](docs/rules/no-inline-context-value.md) |
| `perf-fiscal/no-quadratic-complexity` | 🧮 Nested loops that scale quadratically | Refactor loops or pre-index collections | [docs/rules/no-quadratic-complexity.md](docs/rules/no-quadratic-complexity.md) |
| `perf-fiscal/no-redos-regex` | 🔥 Regular expressions prone to catastrophic backtracking | Rewrite expression or add explicit bounds | [docs/rules/no-redos-regex.md](docs/rules/no-redos-regex.md) |
| `perf-fiscal/no-unhandled-promises` | ⚠️ Ignored Promise rejections | Await or attach `.catch`/`.then` handlers | [docs/rules/no-unhandled-promises.md](docs/rules/no-unhandled-promises.md) |
| `perf-fiscal/no-unstable-inline-props` | ✋ Inline functions/objects and prop spreads that churn references | Hoist or memoize prop values before passing | [docs/rules/no-unstable-inline-props.md](docs/rules/no-unstable-inline-props.md) |
| `perf-fiscal/no-unstable-usememo-deps` | 🧩 Non-stable values in dependency arrays | Memoize dependencies or move them outside the render | [docs/rules/no-unstable-usememo-deps.md](docs/rules/no-unstable-usememo-deps.md) |
| `perf-fiscal/prefer-array-some` | ✅ `filter(...).length` checks used for existence | Replace with `Array.prototype.some` | [docs/rules/prefer-array-some.md](docs/rules/prefer-array-some.md) |
| `perf-fiscal/prefer-for-of` | 🔄 Using `map`/`forEach` purely for side effects | Switch to `for...of` for clarity and speed | [docs/rules/prefer-for-of.md](docs/rules/prefer-for-of.md) |
| `perf-fiscal/prefer-object-hasown` | 🧾 Legacy `hasOwnProperty.call` patterns | Use `Object.hasOwn` | [docs/rules/prefer-object-hasown.md](docs/rules/prefer-object-hasown.md) |
| `perf-fiscal/prefer-promise-all-settled` | 🤝 `Promise.all` expecting partial failures | Migrate to `Promise.allSettled` | [docs/rules/prefer-promise-all-settled.md](docs/rules/prefer-promise-all-settled.md) |

## Configuration

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
  }],
  'perf-fiscal/no-heavy-bundle-imports': ['warn', {
    packages: [
      { name: 'lodash', suggestSubpath: true },
      { name: '@org/legacy-sdk', allowNamed: true }
    ]
  }]
  ```
- 🧮 **Performance strictness presets:** The high-signal rules now accept shared options—`strictness` (`relaxed` \| `balanced` \| `strict`), `includeTestFiles`, `includeStoryFiles`, and `debugExplain`. Use them to dial noise, skip fixture-heavy folders, or surface confidence hints:

  ```js
  'perf-fiscal/no-expensive-computations-in-render': ['warn', {
    strictness: 'strict',
    includeTestFiles: false,
    debugExplain: true
  }],
  'perf-fiscal/no-expensive-split-replace': ['warn', { strictness: 'relaxed' }],
  'perf-fiscal/no-unhandled-promises': ['error', { strictness: 'balanced' }]
  ```

## Examples

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

### Memoize Context Provider Values

```tsx
// Before: inline object invalidates every consumer on render
return (
  <UserContext.Provider value={{ name, role, refresh: () => refetch() }}>
    <Profile />
  </UserContext.Provider>
);

// After: memoize the value to keep Context stable
const providerValue = useMemo(() => ({ name, role, refresh: () => refetch() }), [name, role, refetch]);
return (
  <UserContext.Provider value={providerValue}>
    <Profile />
  </UserContext.Provider>
);
```

### Avoid Heavy Bundle Entrypoints

```ts
// Before: pulls entire lodash build
import { map } from 'lodash';

// After: import only what is needed
import map from 'lodash/map';
```

### Cross-file analyzer in action

![ESLint recording](docs/examples/cross-file-warning/demo.gif)

The clip above (capture it following [docs/examples/cross-file-warning/README.md](docs/examples/cross-file-warning/README.md)) shows a single ESLint run catching two unstable props and an unhandled async flow. The demo highlights how the analyzer correlates memo wrappers and async helpers across files.

## Compatibility

- **Node.js:** 18+
- **ESLint:** ^8.57.0 or ^9.x
- **TypeScript:** 5.5.x (development dependency aligned with `@typescript-eslint`)
- **React guidance:** React-specific diagnostics assume React 16.8+ hooks semantics

🧪 Typed RuleTester: our [typed runner](tests/utils/rule-tester.ts) and CI simulate real-world React+TS projects with cross-file usage, so every rule ships with analyzer-backed coverage.

## Development

```bash
npm install
npm run lint
npm run test
npm run build
# Optional: profile rule performance before/after changes
npm run benchmark
```

Ensure the code compiles, tests pass, and linting remains clean before opening a pull request.

See [`docs/benchmarking.md`](docs/benchmarking.md) for details about the benchmark harness and reference projects it exercises.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the quickstart workflow and expectations before opening a pull request.

### Join the conversation
- Head to [GitHub Discussions](https://github.com/ruidosujeira/perf-linter/discussions) to ask questions, propose ideas, or respond to the weekly audit summary. Start with the "Community check-in" template so maintainers know how to support you.
- Subscribe to announcements to be pinged when a new audit report drops or when we schedule community syncs.

### Find a first issue
- Browse issues labeled [`good first issue`](https://github.com/ruidosujeira/perf-linter/labels/good%20first%20issue) for bite-sized tasks that build familiarity with the codebase.
- Prefer guidance in Portuguese? Filter by the [`boa primeira contribuição`](https://github.com/ruidosujeira/perf-linter/labels/boa%20primeira%20contribui%C3%A7%C3%A3o) label—each ticket outlines clear steps, acceptance criteria, and mentors willing to help.

### Ship changes confidently
1. Open an issue describing the performance heuristic, proposed signal, and acceptable false positives.
2. Implement the rule under `src/rules/`, add coverage in `tests/rules/`, and document behavior in `docs/rules/<rule-name>.md`.
3. Export the rule from `src/index.ts`, update recommended configs if appropriate, and link the documentation.
4. Run the pipeline (`npm run lint`, `npm run test`, `npm run build`).
5. Submit the pull request with a clear explanation of the signal, rationale, and known edge cases.

### Follow the weekly audit reports
- Every Monday we publish a community audit using the [weekly report template](.github/weekly-audit-report.md). The recap highlights new contributors, priority issues, and discussion outcomes.
- Missed an update? Check the Announcements category in Discussions for the latest summary and ongoing calls to action.

Need help crafting new rules? Reach out in English or Portuguese—the community is ready to help!

## License

Perf Fiscal is released under the [MIT License](LICENSE).

---

Adopt Perf Fiscal to keep your codebase lean, predictable, and production-ready.

## Stay in the Loop

💬 Want updates? ⭐️ Star and follow [ruidosujeira/perf-linter](https://github.com/ruidosujeira/perf-linter) to get notified when we ship new heuristics.
