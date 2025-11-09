# perf-fiscal/no-unstable-inline-props

Flags unstable functions, arrays, or objects passed as props to React components when they are created inside the render body without memoization.

## Why it matters

React compares props by reference. Inline functions or object literals recreate new references on every render, forcing memoized children to rerender and breaking `React.memo`/`useMemo` optimizations. Hoisting these values or wrapping them with `useCallback`/`useMemo` keeps references stable and avoids wasted work.

This rule also looks beyond direct attribute assignments. It tracks values created through destructuring, aliasing, and object spread expressions and, when type information is available, uses the TypeScript checker to follow factories and helpers across module boundaries.

## Options

```json
{
	"perf-fiscal/no-unstable-inline-props": ["warn", {
		"ignoreProps": ["className"],
		"checkFunctions": true,
		"checkObjects": true,
		"checkSpreads": true
	}]
}
```

- `ignoreProps` (`string[]`): Prop names that may safely receive inline values.
- `checkFunctions` (`boolean`, default `true`): Report inline or unstable function props.
- `checkObjects` (`boolean`, default `true`): Report inline or unstable object/array props.
- `checkSpreads` (`boolean`, default `true`): Report spreads that introduce unstable props.

## Invalid

```tsx
const Parent = () => (
	<Child
		onClick={() => doSomething()}
		config={{ theme: 'dark' }}
	/>
);

const Parent = () => {
	const handleSubmit = () => dispatch();
	const options = { mode: 'compact' };
	return <Child onSubmit={handleSubmit} options={options} />;
};
const Parent = () => {
	const { onClick } = { onClick: () => {} };
	const props = { onClick };
	return <Child {...props} />;
};
```

## Valid

```tsx
const stableConfig = { theme: 'dark' };

const Parent = () => {
	const handleSubmit = useCallback(() => dispatch(), []);
	const options = useMemo(() => ({ mode: 'compact' }), []);

	return (
		<Child
			onSubmit={handleSubmit}
			options={options}
			config={stableConfig}
		/>
	);
};
const Parent = () => {
	const { onClick } = useMemo(() => ({ onClick: () => {} }), []);
	const stableProps = useMemo(() => ({ onClick }), [onClick]);
	return <Child {...stableProps} />;
};
```
