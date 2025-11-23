export interface LintIssue {
  ruleId: string;
  message: string;
  filePath: string;
  line: number;
  column: number;
  severity: 1 | 2; // 1=warn, 2=error (ESLint convention)
}

export interface LintResults {
  issues: LintIssue[];
}

export function generatePRComment(results: LintResults): string {
  const total = results.issues.length;
  const errors = results.issues.filter(i => i.severity === 2).length;
  const warnings = total - errors;
  const header = `Perf Fiscal Report: ${total} issue(s) — ${errors} error(s), ${warnings} warning(s)`;
  const lines = results.issues
    .slice(0, 50)
    .map(i => `- ${i.filePath}:${i.line}:${i.column} — ${i.ruleId}: ${i.message}`);
  const more = results.issues.length > 50 ? `\n… and ${results.issues.length - 50} more.` : '';
  return [header, '', ...lines].join('\n') + more;
}

export interface Summary {
  totalIssues: number;
  errors: number;
  warnings: number;
}

export interface ResultsSummary {
  summary: Summary;
}

export interface Diff {
  before: ResultsSummary;
  after: ResultsSummary;
  deltaIssues: number;
  deltaErrors: number;
  deltaWarnings: number;
}

export function compareWithBaseline(current: ResultsSummary, baseline: ResultsSummary): Diff {
  const dIssues = current.summary.totalIssues - baseline.summary.totalIssues;
  const dErrors = current.summary.errors - baseline.summary.errors;
  const dWarnings = current.summary.warnings - baseline.summary.warnings;
  return {
    before: baseline,
    after: current,
    deltaIssues: dIssues,
    deltaErrors: dErrors,
    deltaWarnings: dWarnings
  };
}
