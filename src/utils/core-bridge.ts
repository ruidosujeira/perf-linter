import { execFileSync } from 'node:child_process';

type RedosResult = { safe: boolean; rewrite?: string | null };

function resolveCoreBinary(): string | null {
  // Allow overriding path via env for CI/local dev
  const fromEnv = process.env.PERF_LINTER_CORE;
  if (fromEnv) return fromEnv;

  // Common relative path when built with `cargo build --release`
  // rust/perf-linter-core/target/release/perf-linter-core
  const path = require('node:path');
  const candidate = path.resolve(__dirname, '..', '..', 'rust', 'perf-linter-core', 'target', 'release', process.platform === 'win32' ? 'perf-linter-core.exe' : 'perf-linter-core');
  try {
    // Quick existence check via fs.statSync
    const fs = require('node:fs');
    const st = fs.statSync(candidate);
    if (st && st.isFile()) return candidate;
  } catch {
    // ignore
  }
  return null;
}

export function checkReDosWithCore(pattern: string, timeoutMs: number = 50): RedosResult | null {
  const bin = resolveCoreBinary();
  if (!bin) return null;
  try {
    const input = JSON.stringify({ pattern });
    const stdout = execFileSync(bin, ['check-redos'], {
      input,
      timeout: timeoutMs,
      maxBuffer: 1024 * 16,
      encoding: 'utf8'
    });
    const parsed = JSON.parse(stdout) as RedosResult;
    return parsed;
  } catch {
    return null;
  }
}
