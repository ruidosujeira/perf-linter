import { ESLintUtils } from '@typescript-eslint/utils';

export const createRule = ESLintUtils.RuleCreator(
  name => `https://github.com/ruidosujeira/perf-linter/tree/main/docs/rules/${name}.md`
);
