export interface AnalyzerMetricSnapshot {
  analyzer: string;
  filesIndexed: number;
  durationMs: number;
  extra?: Record<string, unknown>;
}

export interface PerformanceReport {
  summary: {
    filesAnalyzed: number;
    issuesFound: number;
    autoFixable: number;
    crossFileIssues: number;
  };
  impact: {
    estimatedRendersSaved: number;
    estimatedMsSaved: number;
    bundleSizeImpact: number; // KB
  };
  breakdown: {
    byRule: Record<string, number>;
    bySeverity: Record<'error' | 'warning', number>;
  };
  topIssues: Array<{
    file: string;
    line: number;
    rule: string;
    message: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  crossFileInsights: {
    memoizedComponents: number;
    propDrillingChains: number;
    contextCascades: number;
  };
  // Placeholder type imported from analyzer in the future
  // Keeping as any to avoid coupling for now
  analyzerMetrics: AnalyzerMetricSnapshot[];
}

export function generateHTMLReport(_report: PerformanceReport): string {
  // TODO: Generate rich HTML report with charts and summaries
  // Minimal scaffold returned for now
  return '<!doctype html><html><head><meta charset="utf-8"><title>Perf Fiscal Report</title></head><body><h1>Perf Fiscal Report</h1><p>Use generateJSONReport to obtain raw data. HTML rendering coming soon.</p></body></html>';
}

export function generateMarkdownReport(report: PerformanceReport): string {
  // Minimal markdown summary; can be posted in PR comments
  const total = report.summary.issuesFound;
  return [
    `### Perf Fiscal Report`,
    '',
    `- Files analyzed: ${report.summary.filesAnalyzed}`,
    `- Issues found: ${total} (auto-fixable: ${report.summary.autoFixable})`,
    `- Cross-file issues: ${report.summary.crossFileIssues}`,
    '',
    `#### Top rules`,
    ...Object.entries(report.breakdown.byRule)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rule, count]) => `- ${rule}: ${count}`)
  ].join('\n');
}

export function generateJSONReport(report: PerformanceReport): string {
  return JSON.stringify(report, null, 2);
}
