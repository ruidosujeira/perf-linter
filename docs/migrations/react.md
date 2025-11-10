# React Application Migration Guide

Perf Fiscal pairs deeply with React projects by stabilizing props, memoization boundaries, and async flows. Follow these steps to adopt the plugin in an existing React codebase.

## Step-by-Step Adoption

1. **Inventory React entry points** – confirm your project uses a TypeScript configuration that covers all `*.tsx` files rendered by React DOM/Native.
2. **Install dependencies** – add Perf Fiscal and the TypeScript-aware parser: `npm install --save-dev eslint eslint-plugin-perf-fiscal @typescript-eslint/parser`.
3. **Enable project-aware parsing** – update the ESLint config (flat or classic) so `parserOptions.project` includes the tsconfig driving your React build.
4. **Adopt the recommended preset** – extend `perfFiscal.configs.recommended` (flat) or `plugin:perf-fiscal/recommended` (classic) to enable React-focused rules like `no-unstable-inline-props` and `detect-unnecessary-rerenders`.
5. **Triage diagnostics** – start with `--max-warnings=0` in CI to highlight memoization regressions during migration.
6. **Automate safe fixes** – for callbacks flagged by `no-unstable-inline-props`, wrap them in `useCallback` or hoist them above the component.
7. **Roll out gradually** – scope linting to key packages or directories before enforcing repository-wide.

## Configuration Snippet

```js
import perfFiscal from 'eslint-plugin-perf-fiscal';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  perfFiscal.configs.recommended
];
```

## Compatibility Notes

- Works with React 17+ (including React Server Components) as long as TypeScript metadata is available.
- Supports both Vite and CRA projects; ensure the ESLint CLI runs with the same `tsconfig.json` used by your bundler.
- For monorepos with multiple React apps, create per-package ESLint config entries referencing each package-specific `tsconfig.json`.
- React Native projects should include the Metro TypeScript configuration within `parserOptions.project` so cross-file analysis resolves component props correctly.
