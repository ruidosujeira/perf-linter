# perf-fiscal/vue-no-inefficient-watchers

Detects inefficient watchers in Vue.js that create unnecessary reactivity overhead or could be replaced with computed properties.

## Why it matters

Watchers are powerful but come with overhead. Creating watchers in loops, nesting reactivity calls, or using deep watching on large objects can significantly impact performance. Additionally, watchers that only derive values without side effects should be computed properties instead.

## Invalid

### Nested watchers

```ts
// ❌ Bad: Watch inside watch creates cascading reactivity
watch(count, () => {
  watch(name, () => {
    console.log('Nested reactivity!');
  });
});
```

### Deep watching large objects

```ts
// ❌ Bad: Deep watching can be expensive
watch(largeObject, () => {
  console.log('Changed');
}, { deep: true });
```

**Better alternatives:**
- Watch specific properties: `watch(() => largeObject.value.specificProp, ...)`
- Use `watchEffect` if you need to track multiple properties
- Use `shallowRef` if deep reactivity is not needed

### Watchers in loops

```ts
// ❌ Bad: Creating multiple watchers in a loop
for (let i = 0; i < 10; i++) {
  watch(count, () => {
    console.log(i);
  });
}
```

### Watcher that should be computed (strict mode)

```ts
// ❌ Bad: Only derives a value without side effects
watch(firstName, (newVal) => {
  return newVal.toUpperCase();
});

// ✅ Good: Use computed instead
const upperFirstName = computed(() => firstName.value.toUpperCase());
```

## Valid

```ts
// ✅ Good: Simple watcher with side effects
watch(count, (newVal, oldVal) => {
  console.log('Count changed:', newVal);
  saveToLocalStorage(newVal);
});

// ✅ Good: watchEffect for tracking multiple reactive sources
watchEffect(() => {
  document.title = `${title.value} - ${subtitle.value}`;
});

// ✅ Good: Watching specific property instead of deep watch
watch(() => user.value.name, (newName) => {
  updateProfile(newName);
});
```

## Options API

This rule also works with Vue Options API:

```ts
// ❌ Bad
export default {
  watch: {
    user: {
      handler(newVal) {
        console.log(newVal);
      },
      deep: true // Expensive on large objects
    }
  }
};

// ✅ Good
export default {
  watch: {
    'user.name'(newVal) {
      updateUserName(newVal);
    }
  }
};
```

## Options

```json
{
  "perf-fiscal/vue-no-inefficient-watchers": ["warn", {
    "strictness": "balanced"
  }]
}
```

- `strictness`: `"relaxed"` | `"balanced"` | `"strict"` (default: `"balanced"`)
  - `relaxed`: Only flags nested watchers and watchers in loops
  - `balanced`: Also flags deep watching
  - `strict`: Additionally suggests using computed for derivative-only watchers

## Migration Guidance

1. Replace nested watchers by extracting logic into separate functions
2. Audit deep watchers and consider watching specific nested properties
3. Move watchers outside of loops - use a single watcher with conditional logic if needed
4. Convert derivative-only watchers to computed properties for better performance
