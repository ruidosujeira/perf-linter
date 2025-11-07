# perf-fiscal/no-unstable-usememo-deps

Highlights `useMemo` calls whose dependency lists contain inline values that change every render, breaking memoization guarantees.

## Why it matters

**Anti-pattern**: Passing objects, arrays, or functions created inline (`[{}]`, `[[]]`, `[() => {}]`) recreates the dependency on each render. The memoized computation re-runs, hurting performance.

**Better approach**: Reference stable values (props, state, constants) or hoist the unstable value into its own `useMemo`/`useCallback` upstream.

## Invalid

```tsx
useMemo(() => compute(widget), [{}]);
React.useMemo(() => build(config), [[option]]);
useMemo(() => calculate(), [() => fallback()]);
```

## Valid

```tsx
const stableOptions = useMemo(() => createOptions(raw), [raw]);
useMemo(() => compute(widget), [widget]);
React.useMemo(() => build(config), deps);
```
