# Mixed Monorepo Migration Guide

Monorepos that combine React frontends, Node.js services, and shared packages benefit from a staged migration that respects per-package tooling. Use this playbook to introduce Perf Fiscal without disrupting existing workflows.

## Step-by-Step Adoption

1. **Survey package boundaries** – list every workspace (React apps, services, shared libraries) and the `tsconfig` files they rely on.
2. **Bootstrap ESLint at the repo root** – ensure the root contains a flat config (`eslint.config.js`) or classic config that can reference workspace-relative `tsconfig` paths.
3. **Install dependencies once** – add Perf Fiscal to the root devDependencies and ensure each workspace consumes the shared ESLint binary.
4. **Create package overrides** – define per-workspace overrides so React packages use the React configuration (see [React Application Migration Guide](react.md)) and services reuse the Node profile (see [Node.js Service Migration Guide](node-services.md)).
5. **Opt in gradually** – enable linting for a subset of workspaces and expand coverage once teams resolve priority diagnostics.
6. **Share analyzer cache** – configure `ESLINT_CACHE` or a shared `.eslintcache` so repeated runs across packages reuse analysis.
7. **Automate in CI** – run ESLint in parallel for independent packages or use `pnpm -r lint`/`npm run lint --workspaces` to keep runtimes manageable.

## Configuration Snippet

```js
import perfFiscal from 'eslint-plugin-perf-fiscal';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./packages/frontend/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    ...perfFiscal.configs.recommended
  },
  {
    files: ['packages/api/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          './packages/api/tsconfig.json',
          './packages/api/tsconfig.scripts.json'
        ],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      ...perfFiscal.configs.recommended.rules
    }
  }
];
```

## Compatibility Notes

- Supports npm, Yarn, and pnpm workspaces; ensure the ESLint CLI is executed from the monorepo root so relative `tsconfig` paths resolve.
- For Turborepo or Nx pipelines, add Perf Fiscal as a cacheable task and forward the `--cache` flag to reuse analyzer output.
- If some packages are JavaScript-only, use overrides to disable rules requiring type information (e.g., skip cross-file analysis for legacy packages until migrated to TypeScript).
- Keep TS project references up to date; misaligned `references` blocks can cause the TypeScript parser to miss files required for cross-file diagnostics.
