import path from 'path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { CrossFileAnalyzer, UsageRecord } from '../../src/analysis/cross-file-analyzer';

const fixturesDir = path.resolve(__dirname, '../fixtures');
const tsconfigPath = path.join(fixturesDir, 'tsconfig.json');

let analyzer: CrossFileAnalyzer;

function createProgramFromTsconfig(configPath: string): ts.Program {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    const message = typeof config.error.messageText === 'string'
      ? config.error.messageText
      : config.error.messageText.messageText;
    throw new Error(message);
  }

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

beforeAll(() => {
  const program = createProgramFromTsconfig(tsconfigPath);
  analyzer = new CrossFileAnalyzer(program);
});

describe('CrossFileAnalyzer', () => {
  it('collects exports with promise metadata', () => {
    const asyncSourcePath = path.join(fixturesDir, 'no-unhandled-promises/async-source.ts');
    const summary = analyzer.getFileSummary(asyncSourcePath);
    expect(summary).not.toBeNull();

    const fetchExport = summary?.exports.find(record => record.exportName === 'fetchData');
    expect(fetchExport).toBeTruthy();
    expect(fetchExport?.symbol.returnsPromise).toBe(true);
    expect(fetchExport?.symbol.isAsync).toBe(true);

    const promiseExport = summary?.exports.find(record => record.exportName === 'getPromiseManually');
    expect(promiseExport).toBeTruthy();
    expect(promiseExport?.symbol.returnsPromise).toBe(true);
    expect(promiseExport?.symbol.isAsync).toBe(false);
  });

  it('tracks cross-file usages for exported functions', () => {
    const asyncSourcePath = path.join(fixturesDir, 'no-unhandled-promises/async-source.ts');
    const symbol = analyzer.findExportedSymbol(asyncSourcePath, 'fetchData');
    expect(symbol).toBeTruthy();

    const usages = symbol?.getUsages() ?? [];
    const consumerUsage = usages.find(
      usage =>
        usage.kind === 'call' && usage.fileName.endsWith('no-unhandled-promises/consumer-unhandled.ts')
    );
    expect(consumerUsage).toBeTruthy();
  });

  it('identifies React components and their JSX usage across files', () => {
    const componentsPath = path.join(fixturesDir, 'cross-file/components.tsx');
    const summary = analyzer.getFileSummary(componentsPath);
    expect(summary).not.toBeNull();

    const fancyButtonExport = summary?.exports.find(record => record.exportName === 'FancyButton');
    expect(fancyButtonExport).toBeTruthy();
    expect(fancyButtonExport?.symbol.isComponent).toBe(true);

    const usages = fancyButtonExport?.symbol.getUsages() ?? [];
    const jsxUsage = usages.find(
      (usage: UsageRecord) => usage.kind === 'jsx' && usage.fileName.endsWith('cross-file/consumer.tsx')
    );
    expect(jsxUsage).toBeTruthy();
  });

  it('records memoization and prop metadata for components', () => {
    const componentsPath = path.join(fixturesDir, 'cross-file/components.tsx');
    const summary = analyzer.getFileSummary(componentsPath);
    expect(summary).not.toBeNull();

    const fancyButtonExport = summary?.exports.find(record => record.exportName === 'FancyButton');
    expect(fancyButtonExport).toBeTruthy();

    const metadata = fancyButtonExport?.symbol;
    expect(metadata?.isMemoizedComponent).toBe(true);

    const props = metadata?.componentProps;
    expect(props).not.toBeNull();
    if (!props) {
      throw new Error('Expected component prop metadata');
    }

    expect(props).toHaveProperty('onPress');
    expect(props.onPress.kind).toBe('function');
    expect(props.onPress.isOptional).toBe(false);

    const memoExport = summary?.exports.find(record => record.exportName === 'MemoFancyButton');
    expect(memoExport?.symbol.isMemoizedComponent).toBe(true);
  });

  it('collects prop usage details for object literal spreads', () => {
    const componentsPath = path.join(fixturesDir, 'cross-file/components.tsx');
    const fancyButton = analyzer.findExportedSymbol(componentsPath, 'FancyButton');
    expect(fancyButton).not.toBeNull();

    // Trigger usage analysis so prop usages are populated.
    fancyButton?.getUsages();

    const usages = fancyButton?.getPropUsages() ?? [];
    const spreadUsages = usages.filter(usage => usage.fileName.endsWith('cross-file/spread-consumer.tsx'));
    expect(spreadUsages.length).toBeGreaterThan(0);

    const inlineUsage = spreadUsages.find(usage => usage.argumentText?.includes('inline spread handler'));
    expect(inlineUsage?.isInline).toBe(true);
    expect(inlineUsage?.isIdentifier).toBe(false);

    const nestedInlineUsage = spreadUsages.find(usage => usage.argumentText?.includes('nested inline spread'));
    expect(nestedInlineUsage?.isInline).toBe(true);
    expect(nestedInlineUsage?.isIdentifier).toBe(false);

    const identifierUsage = spreadUsages.find(usage => usage.argumentText === 'sharedHandler');
    expect(identifierUsage?.isInline).toBe(false);
    expect(identifierUsage?.isIdentifier).toBe(true);

    const primitiveUsage = spreadUsages.find(usage => usage.argumentText === "'spread label'");
    expect(primitiveUsage?.isInline).toBe(false);
    expect(primitiveUsage?.isIdentifier).toBe(false);

    const nestedIdentifierSpread = spreadUsages.find(
      usage => usage.propName === '<<spread>>' && usage.argumentText === 'forwardedProps'
    );
    expect(nestedIdentifierSpread?.isInline).toBe(false);
    expect(nestedIdentifierSpread?.isIdentifier).toBe(true);
  });

  it('reports lazy indexing stats for module and usage indices', () => {
    const program = createProgramFromTsconfig(tsconfigPath);
    const freshAnalyzer = new CrossFileAnalyzer(program);
    const componentsPath = path.join(fixturesDir, 'cross-file/components.tsx');

    const initialStats = freshAnalyzer.getStats();
    expect(initialStats.moduleIndex.filesIndexed).toBe(0);
    expect(initialStats.usageIndex.filesIndexed).toBe(0);
    expect(initialStats.moduleIndex.isFullyBuilt).toBe(false);
    expect(initialStats.usageIndex.isFullyBuilt).toBe(false);

    const summary = freshAnalyzer.getFileSummary(componentsPath);
    expect(summary).not.toBeNull();

    const afterSummaryStats = freshAnalyzer.getStats();
    expect(afterSummaryStats.moduleIndex.filesIndexed).toBe(1);
    expect(afterSummaryStats.usageIndex.filesIndexed).toBe(0);
    expect(afterSummaryStats.moduleIndex.isFullyBuilt).toBe(false);

    const fancyButton = summary?.exports.find(record => record.exportName === 'FancyButton');
    expect(fancyButton).toBeTruthy();

    fancyButton?.symbol.getUsages();

    const afterUsageStats = freshAnalyzer.getStats();
    expect(afterUsageStats.usageIndex.filesIndexed).toBe(3);
    expect(afterUsageStats.usageIndex.isFullyBuilt).toBe(false);
  expect(afterUsageStats.moduleIndex.filesIndexed).toBeGreaterThan(afterSummaryStats.moduleIndex.filesIndexed);
    expect(afterUsageStats.moduleIndex.isFullyBuilt).toBe(true);

    // Prop usage call should not increase counts beyond already indexed files.
    fancyButton?.symbol.getPropUsages();
    const afterPropStats = freshAnalyzer.getStats();
    expect(afterPropStats.usageIndex.filesIndexed).toBe(afterUsageStats.usageIndex.filesIndexed);
  });
});
