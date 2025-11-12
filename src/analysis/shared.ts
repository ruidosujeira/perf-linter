import path from 'path';
import type * as ts from 'typescript';

export function normalizeFileName(fileName: string): string {
  return path.normalize(fileName).replace(/\\/g, '/');
}

export function firstDefined<T>(values: readonly (T | undefined)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function shouldAnalyzeSourceFile(sourceFile: ts.SourceFile): boolean {
  if (sourceFile.isDeclarationFile) {
    return false;
  }

  const normalized = normalizeFileName(sourceFile.fileName);
  if (normalized.includes('/node_modules/')) {
    return false;
  }

  if (normalized.endsWith('.json')) {
    return false;
  }

  return true;
}
