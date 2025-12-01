# perf-fiscal/vue-optimize-reactivity

Optimizes Vue reactivity patterns to avoid unnecessary overhead and performance pitfalls.

## Why it matters

Vue's reactivity system is powerful but can introduce performance overhead if misused. Using `reactive()` with primitives, creating reactive objects in loops, or having overly large reactive objects can all harm performance. Understanding when to use `ref()` vs `reactive()` and how to structure reactive state is crucial for optimal Vue performance.

## Invalid

### Using reactive() with primitives

```ts
// ❌ Bad: reactive() doesn't work with primitives
const count = reactive(42);
const name = reactive('John');

// ✅ Good: Use ref() for primitives
const count = ref(42);
const name = ref('John');
```

### Creating reactive state in loops

```ts
// ❌ Bad: Creates multiple reactive objects
for (let i = 0; i < 10; i++) {
  const state = reactive({ count: i });
}

// ❌ Bad: ref in loop
while (condition) {
  const counter = ref(0);
}

// ✅ Good: Create reactive state outside the loop
const states = reactive(
  Array.from({ length: 10 }, (_, i) => ({ count: i }))
);
```

### Single property reactive object (strict mode)

```ts
// ❌ Bad: Unnecessary overhead for single property
const state = reactive({ count: 0 });

// ✅ Good: Use ref directly
const count = ref(0);
```

### Large reactive objects

```ts
// ❌ Bad: Too many properties for deep reactivity
const state = reactive({
  a: 1, b: 2, c: 3, d: 4, e: 5,
  f: 6, g: 7, h: 8, i: 9, j: 10,
  k: 11, l: 12, m: 13, n: 14, o: 15
});

// ✅ Good: Use shallowReactive if deep reactivity not needed
const state = shallowReactive({
  a: 1, b: 2, c: 3, /* ... */
});

// ✅ Good: Split into smaller reactive objects
const userState = reactive({ name: 'John', age: 30 });
const appState = reactive({ theme: 'dark', locale: 'en' });
const dataState = reactive({ items: [], count: 0 });
```

## Valid

```ts
// ✅ Good: ref for primitives
const count = ref(0);
const name = ref('John');
const isActive = ref(true);

// ✅ Good: reactive for objects
const user = reactive({
  name: 'John',
  age: 30,
  email: 'john@example.com'
});

// ✅ Good: Moderate-sized reactive objects
const formState = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
});
```

## Options

```json
{
  "perf-fiscal/vue-optimize-reactivity": ["warn", {
    "strictness": "balanced"
  }]
}
```

- `strictness`: `"relaxed"` | `"balanced"` | `"strict"` (default: `"balanced"`)
  - `relaxed`: Only flags primitives and loops (threshold: 20 properties)
  - `balanced`: Also flags large objects (threshold: 10 properties)
  - `strict`: Additionally flags single-property objects (threshold: 5 properties)

## Migration Guidance

1. **Audit reactive() usage**: Replace `reactive()` with `ref()` for all primitive values
2. **Review large objects**: Consider using `shallowReactive()` or splitting into smaller objects
3. **Check loops**: Move reactive state creation outside of loops
4. **Use composition**: Break down large reactive objects into logical, smaller pieces

## Performance Tips

- Use `ref()` for primitives and simple values
- Use `reactive()` for objects with related properties (e.g., form state)
- Use `shallowReactive()` for large objects when deep reactivity is not needed
- Use `shallowRef()` for large arrays or objects that you'll replace entirely
- Avoid creating reactive state dynamically in render logic or loops
