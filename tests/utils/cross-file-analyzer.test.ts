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
});
