# perf-fiscal/vue-no-expensive-computed

Detects inefficient computed properties in Vue.js that perform expensive operations or contain nested reactivity.

## Why it matters

Computed properties in Vue are designed to be lightweight getters that derive values from reactive state. When computed properties contain expensive operations like loops, array iterations, or nested reactive calls, they can significantly harm performance because Vue re-evaluates them whenever their dependencies change.

## Invalid

### Expensive operations in computed

```ts
// ❌ Bad: Loop in computed property
const processedItems = computed(() => {
  const result = [];
  for (let i = 0; i < items.value.length; i++) {
    result.push(items.value[i] * 2);
  }
  return result;
});

// ❌ Bad: Array iteration methods
const activeItems = computed(() => items.value.filter(item => item.active));
```

### Nested reactivity

```ts
// ❌ Bad: Nested computed calls
const result = computed(() => {
  const nested = computed(() => x.value + 1);
  return nested.value * 2;
});
```

### Too complex computed (based on strictness level)

```ts
// ❌ Bad: Too many branches (balanced/strict mode)
const status = computed(() => {
  if (a.value > 0) {
    if (b.value > 0) {
      if (c.value > 0) {
        if (d.value > 0) {
          return 'active';
        }
      }
    }
  }
  return 'inactive';
});
```

## Valid

```ts
// ✅ Good: Simple computed property
const fullName = computed(() => firstName.value + ' ' + lastName.value);

// ✅ Good: Simple arithmetic
const total = computed(() => price.value * quantity.value);

// ✅ Good: Simple conditional
const status = computed(() => count.value > 0 ? 'active' : 'inactive');
```

## Options API

This rule also works with Vue Options API:

```ts
// ❌ Bad
export default {
  computed: {
    sortedItems() {
      return this.items.map(item => item.name); // Expensive operation
    }
  }
};

// ✅ Good
export default {
  computed: {
    itemCount() {
      return this.items.length; // Simple getter
    }
  }
};
```

## Options

```json
{
  "perf-fiscal/vue-no-expensive-computed": ["warn", {
    "strictness": "balanced"
  }]
}
```

- `strictness`: `"relaxed"` | `"balanced"` | `"strict"` (default: `"balanced"`)
  - `relaxed`: Only flags obvious expensive operations
  - `balanced`: Flags expensive operations and moderately complex computed
  - `strict`: Flags any complexity over threshold of 3

## Migration Guidance

For large Vue codebases:

1. Start with `strictness: "relaxed"` to catch the most egregious cases
2. Move expensive computations to methods or move them outside the component
3. Consider using `watchEffect` for side effects instead of computed
4. Break down complex computed properties into smaller, focused ones
