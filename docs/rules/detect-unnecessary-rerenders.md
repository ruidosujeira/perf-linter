# perf-fiscal/detect-unnecessary-rerenders

Flags inline callback props created inside list `map` calls that cause memoized children to re-render unnecessarily.

## Why it matters

When a list renders `<Item>` elements inside a `map`, any inline arrow or function expression passed as a prop is recreated on every render. If `Item` is memoized with `React.memo`, those fresh function identities invalidate its memoization and force the component to render again even when the underlying data is unchanged.

## Invalid

```tsx
const Component = ({ items, onClick }) => {
  return items.map(item => <Item key={item.id} onClick={() => onClick(item.id)} />);
};
```

## Valid

```tsx
const Component = ({ items, onClick }) => {
  const handleClick = useCallback((id: string) => onClick(id), [onClick]);
  return items.map(item => <Item key={item.id} onClick={handleClick} />);
};
```

Hoist the callback or wrap it in `useCallback` so that memoized children can leverage referential equality between renders.

## Migration Guidance

Rolling this rule out in existing React surfaces is easier with the [React Application Migration Guide](../migrations/react.md), which outlines staged adoption tactics and configuration examples for memo-heavy components.
