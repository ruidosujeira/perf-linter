import { TSESLint } from '@typescript-eslint/utils';
import pkg from '../package.json';
import detectUnnecessaryRerenders from './rules/detect-unnecessary-rerenders';
import noExpensiveComputationsInRender from './rules/no-expensive-computations-in-render';
import noExpensiveSplitReplace from './rules/no-expensive-split-replace';
import noReDosRegex from './rules/no-redos-regex';
import noUnhandledPromises from './rules/no-unhandled-promises';
import noUnstableInlineProps from './rules/no-unstable-inline-props';
import noUnstableUseMemoDeps from './rules/no-unstable-usememo-deps';
import noQuadraticComplexity from './rules/no-quadratic-complexity';
import preferArraySome from './rules/prefer-array-some';
import preferForOf from './rules/prefer-for-of';
import preferObjectHasOwn from './rules/prefer-object-hasown';
import preferPromiseAllSettled from './rules/prefer-promise-all-settled';
import noHeavyBundleImports from './rules/no-heavy-bundle-imports';
import noInlineContextValue from './rules/no-inline-context-value';
import vueNoExpensiveComputed from './rules/vue-no-expensive-computed';
import vueNoInefficientWatchers from './rules/vue-no-inefficient-watchers';
import vueOptimizeReactivity from './rules/vue-optimize-reactivity';

const PLUGIN_NAME = 'perf-fiscal';

type PluginRules = Record<string, TSESLint.RuleModule<string, readonly unknown[]>>;

export const rules: PluginRules = {
  // General performance rules
  'prefer-array-some': preferArraySome,
  'prefer-for-of': preferForOf,
  'prefer-object-hasown': preferObjectHasOwn,
  'prefer-promise-all-settled': preferPromiseAllSettled,
  'no-redos-regex': noReDosRegex,
  'no-unhandled-promises': noUnhandledPromises,
  'no-expensive-split-replace': noExpensiveSplitReplace,
  'no-quadratic-complexity': noQuadraticComplexity,
  'no-heavy-bundle-imports': noHeavyBundleImports,
  // React-specific rules
  'no-unstable-usememo-deps': noUnstableUseMemoDeps,
  'detect-unnecessary-rerenders': detectUnnecessaryRerenders,
  'no-expensive-computations-in-render': noExpensiveComputationsInRender,
  'no-unstable-inline-props': noUnstableInlineProps,
  'no-inline-context-value': noInlineContextValue,
  // Vue.js-specific rules
  'vue-no-expensive-computed': vueNoExpensiveComputed,
  'vue-no-inefficient-watchers': vueNoInefficientWatchers,
  'vue-optimize-reactivity': vueOptimizeReactivity
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
  [`${PLUGIN_NAME}/no-unstable-inline-props`]: 'warn',
  [`${PLUGIN_NAME}/no-quadratic-complexity`]: 'warn',
  [`${PLUGIN_NAME}/no-heavy-bundle-imports`]: 'warn',
  [`${PLUGIN_NAME}/no-inline-context-value`]: 'warn'
};

const vueRecommendedRules: TSESLint.FlatConfig.Rules = {
  // Include general rules
  [`${PLUGIN_NAME}/prefer-array-some`]: 'warn',
  [`${PLUGIN_NAME}/no-redos-regex`]: 'warn',
  [`${PLUGIN_NAME}/prefer-for-of`]: 'warn',
  [`${PLUGIN_NAME}/prefer-object-hasown`]: 'warn',
  [`${PLUGIN_NAME}/no-unhandled-promises`]: 'warn',
  [`${PLUGIN_NAME}/prefer-promise-all-settled`]: 'warn',
  [`${PLUGIN_NAME}/no-expensive-split-replace`]: 'warn',
  [`${PLUGIN_NAME}/no-quadratic-complexity`]: 'warn',
  [`${PLUGIN_NAME}/no-heavy-bundle-imports`]: 'warn',
  // Vue-specific rules
  [`${PLUGIN_NAME}/vue-no-expensive-computed`]: 'warn',
  [`${PLUGIN_NAME}/vue-no-inefficient-watchers`]: 'warn',
  [`${PLUGIN_NAME}/vue-optimize-reactivity`]: 'warn'
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

const classicVueConfig: TSESLint.ClassicConfig.Config = {
  plugins: [PLUGIN_NAME],
  rules: vueRecommendedRules
};

const flatVueConfig: TSESLint.FlatConfig.Config = {
  name: `${PLUGIN_NAME}/flat-vue`,
  plugins: {
    [PLUGIN_NAME]: {
      meta,
      rules
    }
  },
  rules: vueRecommendedRules
};

export const configs = {
  recommended: classicRecommendedConfig,
  'flat/recommended': flatRecommendedConfig,
  vue: classicVueConfig,
  'flat/vue': flatVueConfig
};

export default {
  meta,
  rules,
  configs
};
