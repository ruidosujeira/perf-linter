import path from 'path';
import { TSESLint } from '@typescript-eslint/utils';

const parserPath = require.resolve('@typescript-eslint/parser');

export const createTSRuleTester = () =>
  new TSESLint.RuleTester({
    parser: parserPath,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true
      }
    }
  });

export const createTypedRuleTester = (fixturesDir: string) =>
  new TSESLint.RuleTester({
    parser: parserPath,
    parserOptions: {
      project: path.join(fixturesDir, 'tsconfig.json'),
      tsconfigRootDir: fixturesDir,
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true
      }
    }
  });
