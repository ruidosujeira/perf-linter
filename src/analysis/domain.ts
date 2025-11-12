import type * as ts from 'typescript';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'variable'
  | 'enum'
  | 'interface'
  | 'type'
  | 'namespace'
  | 'unknown';

export type UsageKind = 'call' | 'new' | 'jsx';

export interface Range {
  start: number;
  end: number;
}

export interface UsageRecord {
  kind: UsageKind;
  fileName: string;
  range: Range;
  propName?: string | null;
  argumentText?: string | null;
  isInline?: boolean;
  isIdentifier?: boolean;
}

export interface ImportRecord {
  moduleName: string;
  imported: string | null;
  local: string;
  isTypeOnly: boolean;
  isNamespace: boolean;
  resolvedFileName: string | null;
}

export interface ExportRecord<TSymbol = unknown> {
  fileName?: string;
  exportName: string;
  isDefault: boolean;
  isTypeOnly: boolean;
  symbol: TSymbol;
}

export interface FileSummary<TSymbol = unknown> {
  fileName: string;
  imports: ImportRecord[];
  exports: ExportRecord<TSymbol>[];
}

export interface PropUsageDetail {
  fileName: string;
  range: Range;
  propName: string;
  argumentText: string | null;
  isInline: boolean;
  isIdentifier: boolean;
}

export type ComponentPropKind = 'function' | 'object' | 'other';

export interface ComponentPropMetadata {
  kind: ComponentPropKind;
  isOptional: boolean;
}

export interface SymbolMetadata {
  declaredName: string;
  kind: SymbolKind;
  declarationFile: string | null;
  isComponent: boolean;
  isHook: boolean;
  isAsync: boolean;
  returnsPromise: boolean;
  isMemoizedComponent: boolean;
  componentProps: Record<string, ComponentPropMetadata> | null;
}

export interface ExportBinding {
  fileName: string;
  exportName: string;
  isDefault: boolean;
  isTypeOnly: boolean;
  symbol: ts.Symbol;
}

export const SPREAD_SENTINEL = '<<spread>>' as const;
export const REACT_RETURN_RE = /(?:JSX\.Element|React\.?Element|ReactNode)/;
