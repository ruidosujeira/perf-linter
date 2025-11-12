# perf-fiscal/no-expensive-split-replace

Warns when `String.prototype.split`, `replace`, or `replaceAll` are executed inside tight loops or high-frequency iteration callbacks.

## Why it matters

These string operations allocate new arrays/strings on every call. Running them inside loops, `map`, or `forEach` callbacks can thrash the garbage collector. Hoist the computation, memoize it, or precompute reusable tokens outside of the hot path.

## Invalid

```ts
for (const item of items) {
  const parts = item.path.split('/');
  consume(parts);
}

items.map(item => item.slug.replace(/-/g, ' '));
```

## Valid

```ts
const parts = expensivePath.split('/');
for (const item of items) {
  consume(parts);
}

const cachedTokens = useMemo(() => slug.split('-'), [slug]);
```

## Options

- `strictness` (`"relaxed" | "balanced" | "strict"`, default `"balanced"`): adjusts the minimum confidence and small-string threshold before reporting. Relaxed mode focuses on the most egregious cases; strict mode warns earlier.
- `includeTestFiles` (boolean, default `true`): when `false`, suppresses diagnostics in test-like directories and files.
- `includeStoryFiles` (boolean, default `true`): when `false`, ignores Storybook-style files.
- `debugExplain` (boolean, default `false`): adds a confidence hint to the diagnostic, useful while calibrating strictness.
