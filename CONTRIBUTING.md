# Contributing

Thanks for helping improve Perf Fiscal! This quick guide keeps contributions simple and consistent.

## Getting started

1. Fork the repo and clone your fork.
2. Install dependencies with `npm install`.
3. Use `npm run build` to compile, `npm test` to run the Vitest suite, and `npm run lint` before opening a pull request.

## Development workflow

- Prefer TypeScript for all source changes. Keep public APIs typed and documented.
- Add or update tests next to the affected rule/utility. New analyzer features should include fixtures in `tests/fixtures`.
- Follow the existing commit style (`type: short description`). Squash when possible before merging.
- For significant changes, open an issue first so we can align on scope.

## Pull requests

- Describe the problem and the approach in the PR body. Include screenshots or terminal output when useful.
- Ensure `npm test` passes and that lint warnings are addressed.
- Larger patches may need benchmarking; mention results if you touched hot paths.
- The maintainers will handle release tagging and publishing after merge.
