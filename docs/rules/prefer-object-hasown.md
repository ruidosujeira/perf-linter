# perf-fiscal/prefer-object-hasown

Prefer `Object.hasOwn` when checking own properties instead of legacy `hasOwnProperty` patterns that rely on the prototype chain.

## Why it matters

- `Object.hasOwn` avoids prototype mutation pitfalls where `hasOwnProperty` might be shadowed.
- It is shorter, more idiomatic, and optimised in modern engines.
- Eliminates the need for `.call` boilerplate that allocates functions on hot paths.

## Invalid

```ts
Object.prototype.hasOwnProperty.call(config, 'enabled');
Object.hasOwnProperty.call(config, key);
config.hasOwnProperty(key);
```

## Valid

```ts
Object.hasOwn(config, 'enabled');
const owns = Object.hasOwn(config, key);
```
