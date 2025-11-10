import path from 'node:path';
import process from 'node:process';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { ESLint } from 'eslint';
import plugin, { rules as pluginRules } from '../src';

interface ReferenceProject {
  readonly name: string;
  readonly cwd: string;
  readonly patterns: readonly string[];
  readonly tsconfig: string;
}

type OutputFormat = 'table' | 'json';

interface BenchmarkOptions {
  readonly iterations: number;
  readonly format: OutputFormat;
}

const RULE_PREFIX = 'perf-fiscal';

const referenceProjects: readonly ReferenceProject[] = [
  {
    name: 'tests/fixtures',
    cwd: path.resolve(__dirname, '../tests/fixtures'),
    patterns: ['**/*.ts', '**/*.tsx'],
    tsconfig: path.resolve(__dirname, '../tests/fixtures/tsconfig.json')
  }
];

function parseOptions(): BenchmarkOptions {
  let iterations = 3;
  let format: OutputFormat = 'table';

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--iterations=')) {
      const value = Number.parseInt(arg.split('=')[1] ?? '', 10);
      if (!Number.isNaN(value) && value > 0) {
        iterations = value;
      }
    } else if (arg === '--json' || arg === '--format=json') {
      format = 'json';
    } else if (arg === '--format=table') {
      format = 'table';
    }
  }

  return { iterations, format };
}

function createESLint(ruleName: string, project: ReferenceProject): ESLint {
  return new ESLint({
    useEslintrc: false,
    cwd: project.cwd,
    cache: false,
    plugins: {
      [RULE_PREFIX]: plugin as unknown as ESLint.Plugin
    },
    overrideConfig: {
      parser: require.resolve('@typescript-eslint/parser'),
      parserOptions: {
        project: [project.tsconfig],
        tsconfigRootDir: project.cwd,
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      plugins: [RULE_PREFIX],
      rules: {
        [`${RULE_PREFIX}/${ruleName}`]: 'warn'
      }
    }
  });
}

async function benchmarkRule(ruleName: string, iterations: number, durationsStore: Map<string, number[]>): Promise<void> {
  if (!durationsStore.has(ruleName)) {
    durationsStore.set(ruleName, []);
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startMark = `${ruleName}-start-${iteration}`;
    const endMark = `${ruleName}-end-${iteration}`;

    performance.mark(startMark);

    for (const project of referenceProjects) {
      const eslint = createESLint(ruleName, project);
      await eslint.lintFiles([...project.patterns]);
    }

    performance.mark(endMark);
    performance.measure(ruleName, startMark, endMark);
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
  }

  // Wait for observer queue to flush before continuing.
  await new Promise((resolve) => setImmediate(resolve));

  const recorded = durationsStore.get(ruleName);
  if (!recorded || recorded.length === 0) {
    throw new Error(`No performance entries recorded for rule ${ruleName}`);
  }
}

function formatTable(results: Map<string, number[]>): void {
  const rows = Array.from(results.entries())
    .map(([ruleName, samples]) => {
      const total = samples.reduce((sum, value) => sum + value, 0);
      const avg = total / samples.length;
      const min = Math.min(...samples);
      const max = Math.max(...samples);

      return {
        rule: `${RULE_PREFIX}/${ruleName}`,
        runs: samples.length,
        avgMs: avg.toFixed(2),
        minMs: min.toFixed(2),
        maxMs: max.toFixed(2)
      };
    })
    .sort((a, b) => Number.parseFloat(b.avgMs) - Number.parseFloat(a.avgMs));

  console.table(rows);
}

function formatJson(results: Map<string, number[]>): void {
  const payload = Array.from(results.entries())
    .map(([ruleName, samples]) => {
      const total = samples.reduce((sum, value) => sum + value, 0);
      const avg = total / samples.length;
      const min = Math.min(...samples);
      const max = Math.max(...samples);

      return {
        rule: `${RULE_PREFIX}/${ruleName}`,
        runs: samples.length,
        averageMs: avg,
        minMs: min,
        maxMs: max
      };
    })
    .sort((a, b) => b.averageMs - a.averageMs);

  console.log(JSON.stringify(payload, null, 2));
}

async function main(): Promise<void> {
  const options = parseOptions();
  const ruleNames = Object.keys(pluginRules);
  const durationsByRule = new Map<string, number[]>();

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const samples = durationsByRule.get(entry.name);
      if (samples) {
        samples.push(entry.duration);
      } else {
        durationsByRule.set(entry.name, [entry.duration]);
      }
    }
  });

  observer.observe({ entryTypes: ['measure'] });

  for (const ruleName of ruleNames) {
    await benchmarkRule(ruleName, options.iterations, durationsByRule);
  }

  observer.disconnect();

  if (options.format === 'json') {
    formatJson(durationsByRule);
  } else {
    formatTable(durationsByRule);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
