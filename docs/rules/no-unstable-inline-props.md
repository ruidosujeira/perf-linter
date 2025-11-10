# perf-fiscal/no-unstable-inline-props

Flags unstable functions, arrays, or objects passed as props to React components when they are created inside the render body without memoization.

## Why it matters

React compares props by reference. Inline functions or object literals recreate new references on every render, forcing memoized children to rerender and breaking `React.memo`/`useMemo` optimizations. Hoisting these values or wrapping them with `useCallback`/`useMemo` keeps references stable and avoids wasted work.

This rule also looks beyond direct attribute assignments. It tracks values created through destructuring, aliasing, and object spread expressions and, when type information is available, uses the TypeScript checker to follow factories and helpers across module boundaries. With cross-file analysis enabled, the rule inspects the target component to understand whether it is memoized and which prop kinds it expects, allowing it to skip reports for non-memoized targets by default and to align warnings with the component’s declared prop types.

> **Typed insights require configuration:** Ensure ESLint loads `@typescript-eslint/parser` with `parserOptions.project` and `tsconfigRootDir` so Perf Fiscal can reach the TypeScript program and correlate props across files.

## Options

```json
{
	"perf-fiscal/no-unstable-inline-props": ["warn", {
		"ignoreProps": ["className"],
		"checkFunctions": true,
		"checkObjects": true,
		"checkSpreads": true,
		"relaxForNonMemoized": true
	}]
}
```

- `ignoreProps` (`string[]`): Prop names that may safely receive inline values.
- `checkFunctions` (`boolean`, default `true`): Report inline or unstable function props.
- `checkObjects` (`boolean`, default `true`): Report inline or unstable object/array props.
- `checkSpreads` (`boolean`, default `true`): Report spreads that introduce unstable props.
- `relaxForNonMemoized` (`boolean`, default `true`): When `true`, suppress reports for inline values passed to components that are detected as non-memoized (e.g., plain functional components). Disable this if you want warnings regardless of the target component’s memoization status.

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
