import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PropInfo {
  name: string;
  kind: 'Function' | 'Object' | 'Array' | 'Primitive';
  is_stable: boolean;
  line: number;
}

export interface ExportInfo {
  name: string;
  kind: 'Named' | 'Default';
  line: number;
}

export interface ComponentMeta {
  name: string;
  file_path: string;
  is_memoized: boolean;
  props: PropInfo[];
  exports: ExportInfo[];
  line: number;
}

export interface ImportSpecifierMeta {
  local: string;
  imported?: string;
}

export interface ImportMeta {
  source: string;
  specifiers: ImportSpecifierMeta[];
  line: number;
}

export interface MetadataGraph {
  components: Record<string, ComponentMeta>;
  imports: Record<string, ImportMeta[]>;
  exports: Record<string, ExportInfo[]>;
}

let cachedGraph: MetadataGraph | null = null;
let graphCacheFile: string | null = null;

function resolveCoreBinary(): string | null {
  const fromEnv = process.env.PERF_LINTER_CORE;
  if (fromEnv) return fromEnv;
  const candidate = path.resolve(
    __dirname,
    '..',
    '..',
    'rust',
    'perf-linter-core',
    'target',
    'release',
    process.platform === 'win32' ? 'perf-linter-core.exe' : 'perf-linter-core'
  );
  try {
    const st = fs.statSync(candidate);
    if (st && st.isFile()) return candidate;
  } catch {}
  return null;
}

export function getCrossFileAnalyzer(projectRoot: string): MetadataGraph {
  const cacheFile = path.join(projectRoot, '.perf-linter-cache.json');

  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 1000 / 60;
    if (ageMinutes < 30 && cachedGraph) {
      return cachedGraph;
    }
  }

  const binary = resolveCoreBinary();
  if (binary) {
    try {
      const cmd = `${binary} index ${projectRoot}`;
      const json = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 100 * 1024 * 1024,
        timeout: 60_000
      });
      cachedGraph = JSON.parse(json) as MetadataGraph;
      fs.writeFileSync(cacheFile, json);
      graphCacheFile = cacheFile;
      return cachedGraph;
    } catch {
      // ignore and fall through to fallback
      // eslint-disable-next-line no-console
      console.warn('[perf-linter] Rust indexer unavailable, falling back to JS analyzer');
    }
  }

  // Fallback: empty graph (preserva comportamento atual sem quebrar regras)
  cachedGraph = { components: {}, imports: {}, exports: {} };
  return cachedGraph;
}

export function invalidateCache(): void {
  if (graphCacheFile && fs.existsSync(graphCacheFile)) {
    fs.unlinkSync(graphCacheFile);
  }
  cachedGraph = null;
}
