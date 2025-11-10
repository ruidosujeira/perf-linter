import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  BundleThresholds,
  clearBundleReportCache,
  computeBundleDelta,
  evaluateBundleThresholds,
  loadBundleBaseline,
  loadBundleReport,
  normalizeModuleId,
  saveBundleBaseline
} from '../../src/integrations/bundler-reports';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const createTempDir = () => mkdtempSync(path.join(tmpdir(), 'perf-linter-'));

const writeJSON = (filePath: string, payload: unknown) => {
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
};

describe('bundler-reports integration', () => {
  let tempDir: string;

  beforeEach(() => {
    clearBundleReportCache();
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('normalizes module identifiers', () => {
    expect(normalizeModuleId('./src/index.ts')).toBe('src/index.ts');
    expect(normalizeModuleId('src\\components/Button.tsx')).toBe('src/components/Button.tsx');
  });

  it('loads and aggregates webpack stats', () => {
    const reportPath = path.join(tempDir, 'webpack.json');
    writeJSON(reportPath, {
      modules: [
        { identifier: './src/index.ts', size: 1000 },
        { identifier: './src/index.ts', size: 200 },
        { identifier: './src/utils.ts', renderedSize: 300 }
      ]
    });

    const report = loadBundleReport(reportPath);
    expect(report.bundler).toBe('webpack');
    expect(report.totalSize).toBe(1500);
    expect(report.modules).toEqual([
      { id: 'src/index.ts', size: 1200 },
      { id: 'src/utils.ts', size: 300 }
    ]);
  });

  it('loads rollup stats', () => {
    const reportPath = path.join(tempDir, 'rollup.json');
    writeJSON(reportPath, {
      rollupVersion: '3.0.0',
      output: [
        {
          fileName: 'index.js',
          modules: {
            'src/index.ts': { renderedLength: 800 },
            'src/utils.ts': { renderedLength: 400 }
          }
        }
      ]
    });

    const report = loadBundleReport(reportPath);
    expect(report.bundler).toBe('rollup');
    expect(report.totalSize).toBe(1200);
    expect(report.modules).toEqual([
      { id: 'src/index.ts', size: 800 },
      { id: 'src/utils.ts', size: 400 }
    ]);
  });

  it('loads vite stats', () => {
    const reportPath = path.join(tempDir, 'vite.json');
    writeJSON(reportPath, {
      chunks: [
        {
          fileName: 'index.js',
          modules: [
            { id: '/src/index.ts', renderedLength: 600 },
            { id: '/src/utils.ts', renderedLength: 200 }
          ]
        }
      ]
    });

    const report = loadBundleReport(reportPath);
    expect(report.bundler).toBe('vite');
    expect(report.totalSize).toBe(800);
    expect(report.modules).toEqual([
      { id: 'src/index.ts', size: 600 },
      { id: 'src/utils.ts', size: 200 }
    ]);
  });

  it('computes delta against a baseline', () => {
    const baselinePath = path.join(tempDir, 'baseline.json');
    const currentPath = path.join(tempDir, 'current.json');

    writeJSON(baselinePath, {
      modules: [
        { identifier: './src/index.ts', size: 1000 },
        { identifier: './src/utils.ts', size: 200 }
      ]
    });

    writeJSON(currentPath, {
      modules: [
        { identifier: './src/index.ts', size: 1300 },
        { identifier: './src/new-module.ts', size: 150 }
      ]
    });

    const baseline = loadBundleReport(baselinePath);
    saveBundleBaseline(baselinePath, baseline);
    const current = loadBundleReport(currentPath);
    const delta = computeBundleDelta(current, loadBundleBaseline(baselinePath));

    expect(delta.total.currentSize).toBe(1450);
    expect(delta.total.baselineSize).toBe(1200);
    expect(delta.total.delta).toBe(250);

    const indexDelta = delta.modules.get('src/index.ts');
    expect(indexDelta).toEqual({
      id: 'src/index.ts',
      baselineSize: 1000,
      currentSize: 1300,
      delta: 300
    });

    const removedModule = delta.modules.get('src/utils.ts');
    expect(removedModule).toEqual({
      id: 'src/utils.ts',
      baselineSize: 200,
      currentSize: 0,
      delta: -200
    });
  });

  it('evaluates thresholds across total and modules', () => {
    const baselinePath = path.join(tempDir, 'baseline.json');
    const currentPath = path.join(tempDir, 'current.json');

    writeJSON(baselinePath, {
      modules: [{ identifier: './src/index.ts', size: 500 }]
    });

    writeJSON(currentPath, {
      modules: [{ identifier: './src/index.ts', size: 900 }]
    });

    const baseline = loadBundleReport(baselinePath);
    const current = loadBundleReport(currentPath);
    const delta = computeBundleDelta(current, baseline);

    const thresholds: BundleThresholds = {
      total: { maxIncrease: 200, maxSize: 600 },
      modules: {
        'src/index.ts': { maxIncrease: 300, maxSize: 800 }
      },
      defaultModule: { maxIncrease: 50 }
    };

    const breaches = evaluateBundleThresholds(delta, thresholds);

    expect(breaches).toEqual([
      {
        scope: 'total',
        kind: 'maxIncrease',
        limit: 200,
        delta: delta.total
      },
      {
        scope: 'total',
        kind: 'maxSize',
        limit: 600,
        delta: delta.total
      },
      {
        scope: 'module',
        kind: 'maxIncrease',
        moduleId: 'src/index.ts',
        limit: 300,
        delta: delta.modules.get('src/index.ts')
      },
      {
        scope: 'module',
        kind: 'maxSize',
        moduleId: 'src/index.ts',
        limit: 800,
        delta: delta.modules.get('src/index.ts')
      }
    ]);
  });
});
