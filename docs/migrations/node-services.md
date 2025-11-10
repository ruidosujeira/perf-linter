# Node.js Service Migration Guide

Perf Fiscal helps backend and CLI Node.js projects surface expensive iterations, blocking regexes, and unhandled async flows. Use this checklist to integrate the plugin into existing services.

## Step-by-Step Adoption

1. **Map runtime targets** – collect the tsconfig files that power your service build/test pipelines.
2. **Install dependencies** – `npm install --save-dev eslint eslint-plugin-perf-fiscal @typescript-eslint/parser`.
3. **Wire parser project references** – ensure `parserOptions.project` points to every `tsconfig.json` that includes `.ts` entry points for workers, lambdas, and CLI scripts.
4. **Extend recommended Node baseline** – apply the plugin’s recommended config and optionally layer it with `eslint:recommended` or company presets.
5. **Audit async flows** – run ESLint locally to capture `no-unhandled-promises` and schedule fixes for unawaited database or HTTP calls.
6. **Tighten CI** – add Perf Fiscal to the `lint` stage of your deployment pipeline with `eslint --max-warnings=0`.
7. **Document service conventions** – record which rules are enforced per subsystem (e.g., job queue vs. API) so future teams adhere to the linting profile.

## Configuration Snippet

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.scripts.json'],
    tsconfigRootDir: __dirname
  },
  extends: [
    'plugin:perf-fiscal/recommended'
  ]
};
```

## Compatibility Notes

- Requires Node 18+ to align with the plugin’s runtime dependency versions.
- Compatible with TypeScript `moduleResolution` values of `node` and `nodenext` as long as ESLint is executed from the repository root.
- Works alongside frameworks like NestJS, Fastify, and Express; apply overrides if specific directories are JavaScript-only.
- For serverless deployments, include generated type roots (e.g., `types/aws-lambda`) in your tsconfig so the analyzer can resolve external signatures.
