import pkg from '../package.json';
import preferArraySome from './rules/prefer-array-some';
import noUnstableUseMemoDeps from './rules/no-unstable-usememo-deps';
import noReDosRegex from './rules/no-redos-regex';
import detectUnnecessaryRerenders from './rules/detect-unnecessary-rerenders';
import preferForOf from './rules/prefer-for-of';
import preferObjectHasOwn from './rules/prefer-object-hasown';
import noUnhandledPromises from './rules/no-unhandled-promises';
import preferPromiseAllSettled from './rules/prefer-promise-all-settled';
import noExpensiveComputationsInRender from './rules/no-expensive-computations-in-render';
import noExpensiveSplitReplace from './rules/no-expensive-split-replace';

export const rules = {
  'prefer-array-some': preferArraySome,
  'no-unstable-usememo-deps': noUnstableUseMemoDeps,
  'no-redos-regex': noReDosRegex,
  'detect-unnecessary-rerenders': detectUnnecessaryRerenders,
  'prefer-for-of': preferForOf,
  'prefer-object-hasown': preferObjectHasOwn,
  'no-unhandled-promises': noUnhandledPromises,
  'prefer-promise-all-settled': preferPromiseAllSettled,
  'no-expensive-computations-in-render': noExpensiveComputationsInRender,
  'no-expensive-split-replace': noExpensiveSplitReplace
};

export const configs = {
  recommended: {
    plugins: ['perf-fiscal'],
    rules: {
      'perf-fiscal/prefer-array-some': 'warn',
      'perf-fiscal/no-unstable-usememo-deps': 'warn',
      'perf-fiscal/no-redos-regex': 'warn',
      'perf-fiscal/detect-unnecessary-rerenders': 'warn',
      'perf-fiscal/prefer-for-of': 'warn',
      'perf-fiscal/prefer-object-hasown': 'warn',
      'perf-fiscal/no-unhandled-promises': 'warn',
      'perf-fiscal/prefer-promise-all-settled': 'warn',
      'perf-fiscal/no-expensive-computations-in-render': 'warn',
      'perf-fiscal/no-expensive-split-replace': 'warn'
    }
  },
  'flat/recommended': {
    name: 'perf-fiscal/flat-recommended',
    plugins: {
      'perf-fiscal': {
        rules
      }
    },
    rules: {
      'perf-fiscal/prefer-array-some': 'warn',
      'perf-fiscal/no-unstable-usememo-deps': 'warn',
      'perf-fiscal/no-redos-regex': 'warn',
      'perf-fiscal/detect-unnecessary-rerenders': 'warn',
      'perf-fiscal/prefer-for-of': 'warn',
      'perf-fiscal/prefer-object-hasown': 'warn',
      'perf-fiscal/no-unhandled-promises': 'warn',
      'perf-fiscal/prefer-promise-all-settled': 'warn',
      'perf-fiscal/no-expensive-computations-in-render': 'warn',
      'perf-fiscal/no-expensive-split-replace': 'warn'
    }
  }
};

export const meta = {
  name: 'eslint-plugin-perf-fiscal',
  version: pkg.version
};

export default {
  meta,
  rules,
  configs
};
