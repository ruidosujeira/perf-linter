# perf-fiscal/prefer-promise-all-settled

Flags `Promise.all` usages that explicitly tolerate failures (through `.catch` or `try/catch` blocks) and suggests switching to `Promise.allSettled` so each task is observed without short-circuiting.

## Why it matters

When you expect some promises to fail, `Promise.all` will reject immediately and may leave other work running. `Promise.allSettled` lets you collect every result, making error handling clearer and preventing partial work loss.

## Invalid

```ts
Promise.all(tasks).catch(handleError);

try {
  await Promise.all(tasks);
} catch (error) {
  log(error);
}
```

## Valid

```ts
await Promise.allSettled(tasks);
Promise.all(tasks).then(onSuccess);
```

## Migration Guidance

Backend and serverless teams can follow the [Node.js Service Migration Guide](../migrations/node-services.md) to enable this rule alongside other async safeguards, with notes on configuring multiple tsconfigs inside a workspace-aware ESLint setup.
