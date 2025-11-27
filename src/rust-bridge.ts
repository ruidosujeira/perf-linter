// Thin JS bridge for the Rust core (napi-rs)
// This module is optional. If the native addon is not present, callers should handle nulls.

type NativeAddon = {
  parse_file(source: string): string; // returns JSON string of AST
  traverse_ast(astJson: string): { nodes_visited: number };
};

let native: NativeAddon | null = null;

function tryLoadNative(): NativeAddon | null {
  if (native) return native;

  // Allow explicit path override (useful in CI/local dev)
  const override = process.env.PERF_LINTER_CORE_NAPI;
  if (override) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      native = require(override);
      return native;
    } catch {
      // ignore and continue to other candidates
    }
  }

  // Common locations to probe
  try {
    const path = require('node:path');
    const fs = require('node:fs');
    const candidates: string[] = [];

    // 1) Adjacent to compiled JS (typical bundlers): perf_linter_core.node
    candidates.push(path.resolve(__dirname, 'perf_linter_core.node'));

    // 2) Project root build outputs (node-gyp style)
    candidates.push(path.resolve(__dirname, '..', 'build', 'Release', 'perf_linter_core.node'));
    candidates.push(path.resolve(__dirname, '..', 'build', 'Debug', 'perf_linter_core.node'));

    for (const c of candidates) {
      try {
        const st = fs.statSync(c);
        if (st && st.isFile()) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          native = require(c);
          return native;
        }
      } catch {
        // continue
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export type AstNode = {
  kind: { type: string } | string;
  span: { lo: number; hi: number };
  children: AstNode[];
};

export function parseFile(source: string): AstNode | null {
  const addon = tryLoadNative();
  if (!addon) return null;
  try {
    const json = addon.parse_file(source);
    return JSON.parse(json) as AstNode;
  } catch {
    return null;
  }
}

export function traverseAst(ast: AstNode): { nodesVisited: number } | null {
  const addon = tryLoadNative();
  if (!addon) return null;
  try {
    const stats = addon.traverse_ast(JSON.stringify(ast));
    return { nodesVisited: stats.nodes_visited };
  } catch {
    return null;
  }
}
