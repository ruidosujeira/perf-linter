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
