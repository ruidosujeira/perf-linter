import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import rule from '../../src/rules/bundle-threshold';
import { clearBundleReportCache } from '../../src/integrations/bundler-reports';
import { createTSRuleTester } from '../utils/rule-tester';
import { afterAll, beforeAll } from 'vitest';

const ruleTester = createTSRuleTester();

const tmpRoot = mkdtempSync(path.join(tmpdir(), 'bundle-threshold-'));

const writeStatsPair = (
  caseName: string,
  baselineModules: Array<{ identifier: string; size: number }>,
  currentModules: Array<{ identifier: string; size: number }>
) => {
  const caseDir = path.join(tmpRoot, caseName);
  mkdirSync(caseDir, { recursive: true });
  const baselinePath = path.join(caseDir, 'baseline.json');
  const reportPath = path.join(caseDir, 'report.json');

  writeFileSync(baselinePath, JSON.stringify({ modules: baselineModules }, null, 2), 'utf8');
  writeFileSync(reportPath, JSON.stringify({ modules: currentModules }, null, 2), 'utf8');

  return {
    rootDir: tmpRoot,
    baselinePath: path.relative(tmpRoot, baselinePath),
    reportPath: path.relative(tmpRoot, reportPath)
  };
};

beforeAll(() => {
  clearBundleReportCache();
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

const moduleThresholdCase = writeStatsPair(
  'module-threshold',
  [
    { identifier: './src/example.ts', size: 1000 }
  ],
  [
    { identifier: './src/example.ts', size: 1400 }
  ]
);

const totalThresholdCase = writeStatsPair(
  'total-threshold',
  [
    { identifier: './src/first.ts', size: 200 }
  ],
  [
    { identifier: './src/second.ts', size: 800 }
  ]
);

ruleTester.run('bundle-threshold', rule, {
  valid: [
    {
      name: 'below module threshold',
      code: 'const value = 1;',
      filename: path.join(moduleThresholdCase.rootDir, 'src/example.ts'),
      options: [
        {
          rootDir: moduleThresholdCase.rootDir,
          baselinePath: moduleThresholdCase.baselinePath,
          reportPath: moduleThresholdCase.reportPath,
          thresholds: {
            modules: {
              'src/example.ts': { maxIncrease: 500, maxSize: 1600 }
            }
          }
        }
      ]
    }
  ],
  invalid: [
    {
      name: 'module increase breach emits warning',
      code: 'const value = 1;',
      filename: path.join(moduleThresholdCase.rootDir, 'src/example.ts'),
      options: [
        {
          rootDir: moduleThresholdCase.rootDir,
          baselinePath: moduleThresholdCase.baselinePath,
          reportPath: moduleThresholdCase.reportPath,
          thresholds: {
            modules: {
              'src/example.ts': { maxIncrease: 200 }
            }
          }
        }
      ],
      errors: [
        {
          messageId: 'moduleIncrease'
        }
      ]
    },
    {
      name: 'total threshold breach emits warning for unrelated file',
      code: 'const another = 2;',
      filename: path.join(totalThresholdCase.rootDir, 'src/third.ts'),
      options: [
        {
          rootDir: totalThresholdCase.rootDir,
          baselinePath: totalThresholdCase.baselinePath,
          reportPath: totalThresholdCase.reportPath,
          thresholds: {
            total: {
              maxIncrease: 400,
              maxSize: 700
            }
          }
        }
      ],
      errors: [
        {
          messageId: 'totalIncrease'
        },
        {
          messageId: 'totalSize'
        }
      ]
    }
  ]
});
