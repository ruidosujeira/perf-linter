# Benchmarking Perf Fiscal Rules

The project ships with a TypeScript benchmark runner that measures how long each rule takes to evaluate across a set of reference sources. Use it to track performance regressions whenever you make analyzer or rule changes.

## Reference Projects

The benchmark harness analyzes the TypeScript fixtures committed to this repository:

- **Source root:** `tests/fixtures`
- **Compiler configuration:** `tests/fixtures/tsconfig.json`

These samples cover cross-file React scenarios, promise handling, memoization heuristics, and other patterns that exercise Perf Fiscal’s cross-file analyzer. If you add new fixtures to stress-test additional behaviors, update this list so future maintainers know which projects influence the timing results.

## Running the Benchmark

```bash
npm run benchmark
```

By default the script executes three iterations per rule and prints a console table summarizing average, minimum, and maximum execution time (in milliseconds).

Pass CLI flags after `--` to customize the run:

- `--iterations=<count>` — overrides the number of iterations per rule.
- `--json` or `--format=json` — emits a JSON payload instead of a table for easy ingestion by other tools.

## Output

Example console output:

```text
┌─────────┬─────────────────────────────────────────────┬──────┬────────┬────────┬────────┐
│ (index) │                    rule                     │ runs │ avgMs  │ minMs  │ maxMs  │
├─────────┼─────────────────────────────────────────────┼──────┼────────┼────────┼────────┤
│    0    │     perf-fiscal/no-expensive-split-replace  │  3   │ 14.12  │ 12.85  │ 15.30  │
│   ...   │                    ...                      │ ...  │  ...   │  ...   │  ...   │
└─────────┴─────────────────────────────────────────────┴──────┴────────┴────────┴────────┘
```

Use these metrics to compare rule performance before and after a change set. When a regression appears, focus on the rules with the highest average time.
