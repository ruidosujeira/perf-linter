export interface CrossFileInsights {
  componentChains?: unknown[];
  heaviestImports?: { module: string; count: number }[];
}

export interface EstimatedImpact {
  rendersSaved?: number;
  msReduced?: number;
}

export interface JsonReport {
  totalIssues: number;
  estimatedImpact?: EstimatedImpact;
  crossFileInsights?: CrossFileInsights;
}

export interface IssueLike {
  ruleId: string;
  message: string;
  filePath: string;
  line: number;
  column: number;
}

export interface ReportInput {
  issues: IssueLike[];
  estimatedImpact?: EstimatedImpact;
  crossFileInsights?: CrossFileInsights;
}

export function generateJsonReport(input: ReportInput): JsonReport {
  return {
    totalIssues: input.issues.length,
    estimatedImpact: input.estimatedImpact,
    crossFileInsights: input.crossFileInsights
  };
}
