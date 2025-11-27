import { execFileSync } from 'node:child_process';

// Minimal AST shape mirrored from Rust side for forward compatibility
export type RustAstNode = {
  kind: { type: string } | string;
  span: { lo: number; hi: number };
  children: RustAstNode[];
};

type CacheKey = string;

function resolveCoreBinary(): string | null {
  const fromEnv = process.env.PERF_LINTER_CORE;
  if (fromEnv) return fromEnv;
  try {
    const path = require('node:path');
    const fs = require('node:fs');
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
    const st = fs.statSync(candidate);
    if (st && st.isFile()) return candidate;
  } catch {
    // ignore
  }
  return null;
}

// Very small in-memory cache; key uses content hash + filename hint
const cache = new Map<CacheKey, RustAstNode | null>();

function keyOf(source: string, filename?: string): CacheKey {
  // Cheap non-cryptographic hash to avoid pulling crypto as dependency
  let h = 2166136261 >>> 0;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0; // FNV-1a
  }
  return `${h.toString(16)}:${filename ?? ''}`;
}

/**
 * Parse JS/TS (incl. JSX/TSX) via Rust core. If Rust is unavailable or fails,
 * returns null so callers can fallback to the JavaScript parser they already use.
 */
export function parseWithRust(source: string, filename: string = 'input.tsx', timeoutMs = 150): RustAstNode | null {
  const bin = resolveCoreBinary();
  if (!bin) return null;

  const cacheKey = keyOf(source, filename);
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  try {
    const args = ['parse', '--filename', filename];
    const stdout = execFileSync(bin, args, {
      input: source,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB for AST JSON
      encoding: 'utf8'
    });
    const ast = JSON.parse(stdout) as RustAstNode;
    cache.set(cacheKey, ast);
    return ast;
  } catch {
    cache.set(cacheKey, null);
    return null;
  }
}

/**
 * Clears the internal parser cache. Useful for tests.
 */
export function clearRustParserCache(): void {
  cache.clear();
}
