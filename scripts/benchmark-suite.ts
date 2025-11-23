/*
  Basic benchmarking scaffold for Perf Fiscal.
  This does not run ESLint programmatically yet; it defines the types and a stubbed runner
  returning structured JSON to be consumed by CI or local scripts.
*/

export interface ProjectTarget {
  name: string;
  path: string;
}

export interface BenchmarkResult {
  project: string;
  filesAnalyzed: number;
  analysisTimeMs: number;
  peakMemoryMB: number;
  totalIssues: number;
}

export interface SuiteReport {
  results: BenchmarkResult[];
}

export async function runBenchmarkSuite(targets: ProjectTarget[]): Promise<SuiteReport> {
  // Placeholder: in a future iteration, spawn ESLint with this plugin and collect metrics.
  const results: BenchmarkResult[] = targets.map(t => ({
    project: t.name,
    filesAnalyzed: 0,
    analysisTimeMs: 0,
    peakMemoryMB: 0,
    totalIssues: 0
  }));
  return { results };
}

if (require.main === module) {
  const exampleTargets: ProjectTarget[] = [
    { name: 'example', path: '.' }
  ];
  runBenchmarkSuite(exampleTargets).then(report => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  });
}
