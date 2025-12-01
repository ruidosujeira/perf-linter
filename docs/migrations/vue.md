# Vue.js Application Migration Guide

This guide helps you adopt Perf Fiscal's Vue.js performance rules in existing Vue 3 projects using either the Composition API or Options API.

## Contents

- [Prerequisites](#prerequisites)
- [Stage 1: General Performance Rules](#stage-1-general-performance-rules)
- [Stage 2: Vue-Specific Rules (Relaxed)](#stage-2-vue-specific-rules-relaxed)
- [Stage 3: Full Vue Performance Suite](#stage-3-full-vue-performance-suite)
- [Configuration Examples](#configuration-examples)
- [Common Patterns and Fixes](#common-patterns-and-fixes)

## Prerequisites

1. **Vue 3**: These rules are designed for Vue 3 projects (Composition API or Options API)
2. **TypeScript Parser**: Install `@typescript-eslint/parser` for best results
3. **ESLint 8.57+**: Flat config recommended but classic config also supported

```bash
npm install --save-dev eslint @typescript-eslint/parser eslint-plugin-perf-fiscal
```

## Stage 1: General Performance Rules

Start with framework-agnostic performance rules that benefit any Vue project:

```js
// eslint.config.js (Flat Config)
import perfFiscal from 'eslint-plugin-perf-fiscal';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.js', '**/*.vue'],
    languageOptions: {
      parser: tsParser
    },
    plugins: {
      'perf-fiscal': perfFiscal
    },
    rules: {
      // Safe, universal rules
      'perf-fiscal/prefer-array-some': 'warn',
      'perf-fiscal/prefer-for-of': 'warn',
      'perf-fiscal/no-quadratic-complexity': 'warn',
      'perf-fiscal/no-expensive-split-replace': 'warn',
      'perf-fiscal/no-redos-regex': 'warn'
    }
  }
];
```

### Expected Impact (Stage 1)

- **Low noise**: These rules catch genuine performance issues
- **Quick wins**: Easy to fix, immediate performance benefits
- **No Vue knowledge required**: Works on regular JavaScript/TypeScript code

## Stage 2: Vue-Specific Rules (Relaxed)

Add Vue-specific rules with relaxed strictness to catch obvious issues:

```js
export default [
  {
    files: ['**/*.ts', '**/*.js', '**/*.vue'],
    languageOptions: {
      parser: tsParser
    },
    plugins: {
      'perf-fiscal': perfFiscal
    },
    rules: {
      // Stage 1 rules...
      'perf-fiscal/prefer-array-some': 'warn',
      'perf-fiscal/prefer-for-of': 'warn',

      // Stage 2: Vue-specific (relaxed)
      'perf-fiscal/vue-no-expensive-computed': ['warn', { strictness: 'relaxed' }],
      'perf-fiscal/vue-no-inefficient-watchers': ['warn', { strictness: 'relaxed' }],
      'perf-fiscal/vue-optimize-reactivity': ['warn', { strictness: 'relaxed' }]
    }
  }
];
```

### Expected Impact (Stage 2)

- **Catches critical issues**: Nested reactivity, watchers in loops, reactive primitives
- **Minimal false positives**: Relaxed mode only flags obvious mistakes
- **Team learning**: Helps team understand Vue reactivity patterns

## Stage 3: Full Vue Performance Suite

Enable balanced or strict mode for comprehensive performance optimization:

```js
export default [
  {
    files: ['**/*.vue', '**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue']
      }
    },
    plugins: {
      'perf-fiscal': perfFiscal
    },
    rules: {
      // Use the pre-configured Vue preset
      ...perfFiscal.configs['flat/vue'].rules

      // Or customize individual rules
      // 'perf-fiscal/vue-no-expensive-computed': ['warn', { strictness: 'balanced' }],
      // 'perf-fiscal/vue-no-inefficient-watchers': ['warn', { strictness: 'strict' }],
    }
  }
];
```

### Expected Impact (Stage 3)

- **Comprehensive coverage**: Deep watching, complex computed, large reactive objects
- **Performance-first**: Encourages optimal Vue patterns
- **May require refactoring**: Some existing code may need restructuring

## Configuration Examples

### Vue 3 with Composition API

```js
// eslint.config.js
import perfFiscal from 'eslint-plugin-perf-fiscal';
import tsParser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';

export default [
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        project: ['./tsconfig.json'],
        extraFileExtensions: ['.vue']
      }
    },
    ...perfFiscal.configs['flat/vue']
  },
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json']
      }
    },
    ...perfFiscal.configs['flat/vue']
  }
];
```

### Vue 3 with Options API

The rules work with both APIs! No configuration changes needed:

```js
// Same config as above
export default [
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser
      }
    },
    ...perfFiscal.configs['flat/vue']
  }
];
```

### Classic Config (.eslintrc.js)

```js
module.exports = {
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    project: ['./tsconfig.json'],
    extraFileExtensions: ['.vue']
  },
  extends: [
    'plugin:perf-fiscal/vue'
  ],
  rules: {
    // Override individual rules if needed
    'perf-fiscal/vue-no-expensive-computed': ['warn', { strictness: 'balanced' }]
  }
};
```

## Common Patterns and Fixes

### Expensive Computed Properties

**Problem:**
```ts
// ❌ Bad: Array operations in computed
const filtered = computed(() => items.value.filter(i => i.active));
```

**Solution 1: Accept the cost if list is small**
```ts
// ✅ OK for small arrays (<100 items)
const filtered = computed(() => items.value.filter(i => i.active));
```

**Solution 2: Move to a method if called infrequently**
```ts
// ✅ Good: Use method instead
function getFiltered() {
  return items.value.filter(i => i.active);
}
```

**Solution 3: Memoize with dependency tracking**
```ts
// ✅ Good: Only re-filter when items or filter criteria change
const activeFilter = ref(true);
const filtered = computed(() => {
  if (!activeFilter.value) return items.value;
  return items.value.filter(i => i.active);
});
```

### Inefficient Watchers

**Problem:**
```ts
// ❌ Bad: Deep watching large object
watch(user, () => {
  saveUser(user.value);
}, { deep: true });
```

**Solution 1: Watch specific properties**
```ts
// ✅ Good: Watch only what you need
watch(() => user.value.name, (newName) => {
  saveUserName(newName);
});

watch(() => user.value.email, (newEmail) => {
  saveUserEmail(newEmail);
});
```

**Solution 2: Use watchEffect for multiple dependencies**
```ts
// ✅ Good: Auto-track dependencies
watchEffect(() => {
  // Only runs when user.name or user.email changes
  saveUser({
    name: user.value.name,
    email: user.value.email
  });
});
```

### Reactivity Optimization

**Problem:**
```ts
// ❌ Bad: Using reactive for primitives
const count = reactive(0);
const name = reactive('John');
```

**Solution:**
```ts
// ✅ Good: Use ref for primitives
const count = ref(0);
const name = ref('John');
```

**Problem:**
```ts
// ❌ Bad: Large reactive object
const state = reactive({
  user: { /* 20 properties */ },
  settings: { /* 15 properties */ },
  cache: { /* 30 properties */ }
});
```

**Solution 1: Use shallowReactive**
```ts
// ✅ Good: If you don't need deep reactivity
const state = shallowReactive({
  user: { /* ... */ },
  settings: { /* ... */ },
  cache: { /* ... */ }
});
```

**Solution 2: Split into logical chunks**
```ts
// ✅ Better: Smaller, focused reactive objects
const user = reactive({ /* user properties */ });
const settings = reactive({ /* settings properties */ });
const cache = shallowReactive({ /* cache - no deep tracking needed */ });
```

## Troubleshooting

### Parser Issues with .vue Files

If you get parser errors with `.vue` files:

1. Install `vue-eslint-parser`:
   ```bash
   npm install --save-dev vue-eslint-parser
   ```

2. Update your config:
   ```js
   languageOptions: {
     parser: vueParser,
     parserOptions: {
       parser: tsParser,
       extraFileExtensions: ['.vue']
     }
   }
   ```

### Rules Not Triggering

If Vue rules aren't detecting issues:

1. Ensure files match the pattern in `files: ['**/*.vue', '**/*.ts']`
2. Check that Vue imports are recognized (import from 'vue')
3. Verify parser is correctly configured for `.vue` files

### Too Many Warnings

If you're getting overwhelmed with warnings:

1. Start with `strictness: 'relaxed'`
2. Fix critical issues first (nested reactivity, loops)
3. Gradually increase to `'balanced'` then `'strict'`
4. Use per-file or per-directory overrides for legacy code

## Next Steps

1. **Measure Impact**: Use Vue DevTools Performance tab to measure improvements
2. **Team Training**: Share common patterns and fixes with your team
3. **Gradual Rollout**: Enable strict mode incrementally, component by component
4. **Monitor CI**: Track warning count over time to prevent regressions

## Additional Resources

- [vue-no-expensive-computed](../rules/vue-no-expensive-computed.md)
- [vue-no-inefficient-watchers](../rules/vue-no-inefficient-watchers.md)
- [vue-optimize-reactivity](../rules/vue-optimize-reactivity.md)
- [Vue 3 Performance Guide](https://vuejs.org/guide/best-practices/performance.html)
