import { TSESLint } from '@typescript-eslint/utils';
import pkg from '../package.json';
import detectUnnecessaryRerenders from './rules/detect-unnecessary-rerenders';
import noExpensiveComputationsInRender from './rules/no-expensive-computations-in-render';
import noExpensiveSplitReplace from './rules/no-expensive-split-replace';
import noReDosRegex from './rules/no-redos-regex';
import noUnhandledPromises from './rules/no-unhandled-promises';
import noUnstableInlineProps from './rules/no-unstable-inline-props';
import noUnstableUseMemoDeps from './rules/no-unstable-usememo-deps';
import preferArraySome from './rules/prefer-array-some';
import preferForOf from './rules/prefer-for-of';
import preferObjectHasOwn from './rules/prefer-object-hasown';
import preferPromiseAllSettled from './rules/prefer-promise-all-settled';

const PLUGIN_NAME = 'perf-fiscal';

type PluginRules = Record<string, TSESLint.RuleModule<string, readonly unknown[]>>;

export const rules: PluginRules = {
  'prefer-array-some': preferArraySome,
  'no-unstable-usememo-deps': noUnstableUseMemoDeps,
  'no-redos-regex': noReDosRegex,
  'detect-unnecessary-rerenders': detectUnnecessaryRerenders,
  'prefer-for-of': preferForOf,
  'prefer-object-hasown': preferObjectHasOwn,
  'no-unhandled-promises': noUnhandledPromises,
  'prefer-promise-all-settled': preferPromiseAllSettled,
  'no-expensive-computations-in-render': noExpensiveComputationsInRender,
  'no-expensive-split-replace': noExpensiveSplitReplace,
  'no-unstable-inline-props': noUnstableInlineProps
};

const recommendedRules: TSESLint.FlatConfig.Rules = {
  [`${PLUGIN_NAME}/prefer-array-some`]: 'warn',
  [`${PLUGIN_NAME}/no-unstable-usememo-deps`]: 'warn',
  [`${PLUGIN_NAME}/no-redos-regex`]: 'warn',
  [`${PLUGIN_NAME}/detect-unnecessary-rerenders`]: 'warn',
  [`${PLUGIN_NAME}/prefer-for-of`]: 'warn',
  [`${PLUGIN_NAME}/prefer-object-hasown`]: 'warn',
  [`${PLUGIN_NAME}/no-unhandled-promises`]: 'warn',
  [`${PLUGIN_NAME}/prefer-promise-all-settled`]: 'warn',
  [`${PLUGIN_NAME}/no-expensive-computations-in-render`]: 'warn',
  [`${PLUGIN_NAME}/no-expensive-split-replace`]: 'warn',
  [`${PLUGIN_NAME}/no-unstable-inline-props`]: 'warn'
};

const classicRecommendedConfig: TSESLint.ClassicConfig.Config = {
  plugins: [PLUGIN_NAME],
  rules: recommendedRules
};

export const meta: TSESLint.FlatConfig.PluginMeta = {
  name: 'eslint-plugin-perf-fiscal',
  version: pkg.version
};

const flatRecommendedConfig: TSESLint.FlatConfig.Config = {
  name: `${PLUGIN_NAME}/flat-recommended`,
  plugins: {
    [PLUGIN_NAME]: {
      meta,
      rules
    }
  },
  rules: recommendedRules
};

export const configs = {
  recommended: classicRecommendedConfig,
  'flat/recommended': flatRecommendedConfig
};

export default {
  meta,
  rules,
  configs
};
