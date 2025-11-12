# perf-fiscal/no-unhandled-promises

Warns when a Promise-producing call is made without awaiting it, returning it, or chaining handlers — a common source of hidden rejections and resource leaks.

## Why it matters

If a Promise rejects and nothing observes it, the runtime may log it later or ignore it entirely, leaving bugs in production. Bare `fetch()` or `Promise.resolve()` calls also keep tasks alive without a consumer, potentially creating leaks.

When type information is available, the rule follows Promise-returning helpers across module boundaries to warn on indirect async flows. Configure ESLint with `@typescript-eslint/parser` plus `parserOptions.project`/`tsconfigRootDir` so the analyzer can obtain the TypeScript program. The [Typed Analyzer Setup](../typed-analyzer-setup.md) guide covers the required `tsconfig` options and ESLint settings.

## Invalid

```ts
async function load() {
  fetch('/api/data');
}

Promise.resolve(task);
new Promise(res => res());
```

## Valid

```ts
await fetch('/api/data');
return Promise.all(tasks);
fetch('/api/data').then(handle);
```

## Options

- `strictness` (`"relaxed" | "balanced" | "strict"`, default `"balanced"`): controls how aggressively the rule treats ambiguous flows. Strict mode flags `void fetch()` discards and lowers the confidence threshold; relaxed mode focuses on obvious unawaited calls.
- `includeTestFiles` (boolean, default `true`): when `false`, suppresses diagnostics in test-like paths/extensions.
- `includeStoryFiles` (boolean, default `true`): when `false`, skips Storybook-style files.
- `debugExplain` (boolean, default `false`): appends a confidence hint to the diagnostic message.

## Migration Guidance

Service teams can use the [Node.js Service Migration Guide](../migrations/node-services.md) to stage adoption in APIs, workers, and CLIs. Monorepo environments should also review the [Mixed Monorepo Migration Guide](../migrations/monorepo.md) for workspace override patterns that keep backend-specific linting scoped appropriately.
