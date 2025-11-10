# perf-fiscal/no-quadratic-complexity

Warns when the same iterable is traversed multiple times in a nested fashion (e.g. `items.forEach` within another `items.forEach`).

## Why it matters

Nested passes over the same collection introduce quadratic time complexity. For modest datasets this may be acceptable, but as the collection grows each extra traversal multiplies the work. Refactor to pre-index data, leverage lookup maps, or restructure logic to avoid repeated full scans.

## Invalid

```ts
items.forEach(item => {
  items.forEach(other => {
    if (item.id === other.id) {
      console.log(item, other);
    }
  });
});

for (const user of users) {
  for (const other of users) {
    compare(user, other);
  }
}
```

## Valid

```ts
const byId = new Map(items.map(item => [item.id, item]));

for (const request of requests) {
  const match = byId.get(request.id);
  if (match) {
    handle(match);
  }
}

items.forEach(item => {
  others.forEach(other => {
    compare(item, other);
  });
});
```
