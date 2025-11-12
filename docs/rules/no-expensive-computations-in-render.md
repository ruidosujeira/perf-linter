# perf-fiscal/no-expensive-computations-in-render

Warns when expensive computations such as array filtering/sorting or JSON serialization run inside a React render (function component body) or inside `useEffect` callbacks without memoization.

## Why it matters

Expensive work executed during each render frame stalls the main thread. Filtering or sorting props/state arrays in-line can dominate CPU time, and repeated `JSON.stringify`/`JSON.parse` calls allocate large intermediate strings.

Memoize these operations with `useMemo`, hoist them outside the component, or move them to background workers.

## Invalid

```tsx
function Component({ items }: { items: number[] }) {
  const filtered = items.filter(item => item > 10);
  return <List values={filtered} />;
}

function Component({ data }: { data: string }) {
  useEffect(() => {
    const parsed = JSON.parse(data);
    consume(parsed);
  }, []);
  return null;
}
```

## Valid

```tsx
function Component({ items }: { items: number[] }) {
  const filtered = useMemo(() => items.filter(item => item > 10), [items]);
  return <List values={filtered} />;
}

function Component({ data }: { data: string }) {
  useEffect(() => {
    const parsed = JSON.parse(data);
    consume(parsed);
  }, [data]);
  return null;
}
```

## Options

- `strictness` (`"relaxed" | "balanced" | "strict"`, default `"balanced"`): adjusts literal-size heuristics and the confidence threshold before reporting. Relaxed mode only flags the heaviest signals; strict mode widens coverage.
- `includeTestFiles` (boolean, default `true`): when `false`, suppresses diagnostics for test-like paths and extensions.
- `includeStoryFiles` (boolean, default `true`): when `false`, skips files that look like Storybook stories.
- `debugExplain` (boolean, default `false`): appends a confidence hint to the diagnostic message to help tune severity.

## Migration Guidance

To phase this rule into React applications without disrupting delivery, reference the [React Application Migration Guide](../migrations/react.md). Monorepo maintainers can pair those steps with the [Mixed Monorepo Migration Guide](../migrations/monorepo.md) to coordinate workspace-specific overrides.
