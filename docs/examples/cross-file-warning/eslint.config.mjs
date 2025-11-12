import { fileURLToPath } from 'node:url';
import tsParser from '@typescript-eslint/parser';
import plugin from '../../../dist/index.js';

const recommendedRules = plugin.configs?.['flat/recommended']?.rules ?? {};
const projectTsconfig = fileURLToPath(new URL('./tsconfig.json', import.meta.url));

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: projectTsconfig,
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      'perf-fiscal': plugin
    },
    rules: {
      ...recommendedRules,
      'perf-fiscal/detect-unnecessary-rerenders': 'warn',
      'perf-fiscal/no-unhandled-promises': 'warn'
    }
  }
];
