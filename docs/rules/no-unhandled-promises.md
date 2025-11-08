# perf-fiscal/no-unhandled-promises

Warns when a Promise-producing call is made without awaiting it, returning it, or chaining handlers — a common source of hidden rejections and resource leaks.

## Why it matters

If a Promise rejects and nothing observes it, the runtime may log it later or ignore it entirely, leaving bugs in production. Bare `fetch()` or `Promise.resolve()` calls also keep tasks alive without a consumer, potentially creating leaks.

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
