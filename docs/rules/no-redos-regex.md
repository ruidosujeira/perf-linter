# perf-fiscal/no-redos-regex

Warns about regular expressions that can trigger catastrophic backtracking (ReDoS) and hang or slow down your application under crafted inputs.

## Why it matters

**Anti-pattern**: Nested quantifiers like `(a+)+` or `(.*a)+` allow malicious inputs to explode the backtracking tree, monopolizing CPU.

**Better approach**: Rewrite the pattern to avoid overlapping quantifiers, or rely on pre-vetted libraries/parsers when matching untrusted input.

## Invalid

```ts
const risky = /(a+)+$/;
const another = new RegExp('(.*a)+');
```

## Valid

```ts
const safe = /^(?:[a-z0-9_-]{3,16})$/i;
const flexible = new RegExp(`^${escape(userInput)}$`);
```
