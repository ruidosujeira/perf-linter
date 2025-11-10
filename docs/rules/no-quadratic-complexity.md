# perf-fiscal/no-quadratic-complexity

Flags nested loops/iterators and self-recursive functions that are likely to explode to quadratic (or worse) work when fed large collections.

## Why it matters

Each additional pass over a large collection multiplies the work your code performs. Nesting `for` loops or `Array.prototype.forEach` callbacks that both depend on input size quickly lead to O(N²) behaviour and UI jank. Recursive traversals without tight bounds suffer from the same growth.

The rule uses heuristics to avoid noise:

- Loops with a statically bounded trip count (≤ 10 iterations) are treated as safe.
- Iterators over small literal collections (like `[1, 2, 3]`) are also exempt.
- Only direct self-recursion is reported.

## Invalid

```ts
for (let i = 0; i < items.length; i++) {
  for (let j = 0; j < items.length; j++) {
    doHeavyWork(items[i], items[j]);
  }
}

items.forEach(item => {
  data.forEach(inner => process(inner));
});

function traverse(node: TreeNode | null) {
  if (!node) {
    return;
  }

  visit(node);
  traverse(node.left);
}
```

## Valid

```ts
for (let i = 0; i < items.length; i++) {
  doSomething(items[i]);
}

items.forEach(item => {
  const fixed = [1, 2, 3];
  fixed.forEach(count => record(item, count));
});

function renderList(nodes: TreeNode[]) {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.label);
  }
  return result;
}
```
