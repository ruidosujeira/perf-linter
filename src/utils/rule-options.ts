import { TSESLint } from '@typescript-eslint/utils';

export type Strictness = 'relaxed' | 'balanced' | 'strict';

export interface BaseRuleOptions {
  strictness?: Strictness;
  includeTestFiles?: boolean;
  includeStoryFiles?: boolean;
  debugExplain?: boolean;
}

export interface ExplainStep {
  step: string;
  data?: unknown;
}

export interface ExplainCollector {
  readonly enabled: boolean;
  readonly steps: ExplainStep[];
  push(step: string, data?: unknown): void;
  snapshot(): ExplainStep[] | undefined;
}

export interface ExplainCollectorOptions {
  onSnapshot?(): ExplainStep | ExplainStep[] | undefined;
}

export function createExplainCollector(enabled: boolean, options: ExplainCollectorOptions = {}): ExplainCollector {
  const steps: ExplainStep[] = [];

  return {
    enabled,
    steps,
    push(step: string, data?: unknown): void {
      if (!enabled) {
        return;
      }

      steps.push(data === undefined ? { step } : { step, data });
    },
    snapshot(): ExplainStep[] | undefined {
      if (!enabled) {
        return undefined;
      }

      const snapshot = steps.slice();
      if (options.onSnapshot) {
        const extra = options.onSnapshot();
        if (Array.isArray(extra)) {
          snapshot.push(...extra);
        } else if (extra) {
          snapshot.push(extra);
        }
      }
      return snapshot;
    }
  };
}

export interface Thresholds {
  smallArrayMaxLen: number;
  smallObjectMaxProps: number;
  smallStringMaxLen: number;
  minConfidenceToReport: number;
}

export function getThresholds(strictness: Strictness | undefined): Thresholds {
  switch (strictness) {
    case 'relaxed':
      return {
        smallArrayMaxLen: 3,
        smallObjectMaxProps: 3,
        smallStringMaxLen: 12,
        minConfidenceToReport: 0.85
      };
    case 'strict':
      return {
        smallArrayMaxLen: 8,
        smallObjectMaxProps: 8,
        smallStringMaxLen: 24,
        minConfidenceToReport: 0.6
      };
    case 'balanced':
    default:
      return {
        smallArrayMaxLen: 5,
        smallObjectMaxProps: 5,
        smallStringMaxLen: 16,
        minConfidenceToReport: 0.75
      };
  }
}

export function isTestLikeFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    /(^|\/)tests?\//.test(lower) ||
    /(^|\/)__tests__\//.test(lower) ||
    /\.(test|spec)\.[tj]sx?$/.test(lower)
  );
}

export function isStoryLikeFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return /\.stories\.[tj]sx?$/.test(lower) || /(^|\/)stories?\//.test(lower);
}

export function shouldSkipFile(
  context: TSESLint.RuleContext<string, unknown[]>,
  options: BaseRuleOptions | undefined
): boolean {
  const filename = context.getFilename?.() ?? '<input>';
  if (!filename || filename === '<input>') {
    return false; // RuleTester or unknown filename
  }

  const includeTests = options?.includeTestFiles ?? true;
  const includeStories = options?.includeStoryFiles ?? true;

  if (!includeTests && isTestLikeFilename(filename)) {
    return true;
  }

  if (!includeStories && isStoryLikeFilename(filename)) {
    return true;
  }

  return false;
}
