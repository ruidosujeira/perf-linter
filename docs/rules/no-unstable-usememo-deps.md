# perf-fiscal/no-unstable-usememo-deps

Highlights `useMemo` calls whose dependency lists contain inline values or props whose identities change every render, breaking memoization guarantees.

## Why it matters

**Anti-pattern**: Passing objects, arrays, or functions created inline (`[{}]`, `[[]]`, `[() => {}]`) recreates the dependency on each render. Passing props that originate from inline literals in the parent component is equally unstable — the child receives a fresh reference on every render and the memoized computation re-runs, hurting performance.

**Better approach**: Reference stable values (props, state, constants) or hoist the unstable value into its own `useMemo`/`useCallback` upstream.

## Invalid

```tsx
useMemo(() => compute(widget), [{}]);
React.useMemo(() => build(config), [[option]]);
useMemo(() => calculate(), [() => fallback()]);

function Parent() {
	const options = {};
	return <Child options={options} />;
}

function Child({ options }: { options: Record<string, unknown> }) {
        return useMemo(() => normalize(options), [options]);
}
```

## Migration Guidance

Teams adopting this rule alongside other React-focused checks should consult the [React Application Migration Guide](../migrations/react.md) for incremental enablement tips and configuration snippets that preserve existing memoization boundaries.

## Valid

```tsx
const stableOptions = useMemo(() => createOptions(raw), [raw]);
useMemo(() => compute(widget), [widget]);
React.useMemo(() => build(config), deps);

const options = useMemo(() => ({ cache: true }), []);
function Parent() {
	return <Child options={options} />;
}

function Child({ options }: { options: Record<string, unknown> }) {
	return useMemo(() => normalize(options), [options]);
}
```
