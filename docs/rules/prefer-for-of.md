# perf-fiscal/prefer-for-of

Recommend replacing `Array.prototype.map`/`forEach` when they are used purely for side-effects, since the callback allocation and extra iteration machinery add avoidable overhead compared to a plain loop.

## Why it matters

If you call `map` without using its return value or `forEach` for simple side-effects, you pay for callback creation and indirection every time. A `for...of` loop keeps hot code paths simple and easier for JavaScript engines to optimize.

## Invalid

```ts
items.map(item => dispatch(item));
items.forEach(item => doWork(item));
```

## Valid

```ts
const doubled = items.map(item => item * 2);
for (const item of items) {
  dispatch(item);
}
```
