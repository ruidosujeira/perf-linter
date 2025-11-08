import pkg from '../package.json';
import preferArraySome from './rules/prefer-array-some';
import noUnstableUseMemoDeps from './rules/no-unstable-usememo-deps';
import noReDosRegex from './rules/no-redos-regex';
import detectUnnecessaryRerenders from './rules/detect-unnecessary-rerenders';

export const rules = {
  'prefer-array-some': preferArraySome,
  'no-unstable-usememo-deps': noUnstableUseMemoDeps,
  'no-redos-regex': noReDosRegex,
  'detect-unnecessary-rerenders': detectUnnecessaryRerenders
};

export const configs = {
  recommended: {
    plugins: ['perf-fiscal'],
    rules: {
      'perf-fiscal/prefer-array-some': 'warn',
      'perf-fiscal/no-unstable-usememo-deps': 'warn',
      'perf-fiscal/no-redos-regex': 'warn',
      'perf-fiscal/detect-unnecessary-rerenders': 'warn'
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
      'perf-fiscal/detect-unnecessary-rerenders': 'warn'
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
