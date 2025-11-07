import pkg from '../package.json';
import preferArraySome from './rules/prefer-array-some';
import noUnstableUseMemoDeps from './rules/no-unstable-usememo-deps';
import noReDosRegex from './rules/no-redos-regex';

export const rules = {
  'prefer-array-some': preferArraySome,
  'no-unstable-usememo-deps': noUnstableUseMemoDeps,
  'no-redos-regex': noReDosRegex
};

export const configs = {
  recommended: {
    plugins: ['perf-fiscal'],
    rules: {
      'perf-fiscal/prefer-array-some': 'warn',
      'perf-fiscal/no-unstable-usememo-deps': 'warn',
      'perf-fiscal/no-redos-regex': 'warn'
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
      'perf-fiscal/no-redos-regex': 'warn'
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
