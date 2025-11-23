export interface Position {
  line: number; // 1-based
  column: number; // 1-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface PerformanceHint {
  ruleId: string;
  message: string;
  range: Range;
  severity: 'info' | 'warning' | 'error';
}

export interface Explanation {
  title: string;
  description: string;
  references?: { title: string; url: string }[];
}

export interface PerfFiscalLanguageServer {
  getInlineHints(uri: string): PerformanceHint[];
  explainIssue(uri: string, line: number): Explanation | null;
}

export class NoopLanguageServer implements PerfFiscalLanguageServer {
  getInlineHints(): PerformanceHint[] {
    return [];
  }
  explainIssue(): Explanation | null {
    return null;
  }
}
