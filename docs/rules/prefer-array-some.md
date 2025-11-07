# perf-fiscal/prefer-array-some

Detects patterns that eagerly allocate arrays with `.filter()` just to check if any element matches. Suggests `.some()` to short-circuit and avoid unnecessary work.

## Why it matters

**Anti-pattern**: `items.filter(fn).length > 0` walks the entire array, creates a new array, and then discards it.

**Better approach**: `items.some(fn)` stops at the first match, returning a boolean without extra allocations.

## Invalid

```ts
const exists = users.filter(isActive).length > 0;
if (orders.filter(isReady).length === 0) {
  handleEmpty();
}
```

## Valid

```ts
const exists = users.some(isActive);
if (!orders.some(isReady)) {
  handleEmpty();
}
const list = items.filter(expensivePredicate);
console.log(list.length);
```
