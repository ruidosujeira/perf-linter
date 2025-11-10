import path from 'node:path';
import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/create-rule';
import {
  BundleDelta,
  BundleThresholds,
  computeBundleDelta,
  evaluateBundleThresholds,
  getModuleDelta,
  loadBundleBaseline,
  loadBundleReport
} from '../integrations/bundler-reports';

interface BundleThresholdRuleOptions {
  /** Path to the generated bundle stats file. */
  reportPath: string;
  /** Path to the stored baseline bundle stats. */
  baselinePath: string;
  /** Working directory used to resolve bundle paths. Defaults to process.cwd(). */
  rootDir?: string;
  /** Threshold configuration controlling when warnings are emitted. */
  thresholds?: BundleThresholds;
}

type Options = [BundleThresholdRuleOptions?];

type MessageIds =
  | 'loadError'
  | 'moduleIncrease'
  | 'moduleSize'
  | 'totalIncrease'
  | 'totalSize';

const bundleDeltaCache = new Map<string, BundleDelta | Error>();

const resolvePathsKey = (reportPath: string, baselinePath: string): string =>
  `${reportPath}::${baselinePath}`;

const ensureBundleDelta = (
  reportPath: string,
  baselinePath: string
): BundleDelta | Error => {
  const cacheKey = resolvePathsKey(reportPath, baselinePath);
  const cached = bundleDeltaCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const report = loadBundleReport(reportPath);
    const baseline = loadBundleBaseline(baselinePath);
    const delta = computeBundleDelta(report, baseline);

    bundleDeltaCache.set(cacheKey, delta);
    return delta;
  } catch (error) {
    const resolvedError = error instanceof Error ? error : new Error(String(error));
    bundleDeltaCache.set(cacheKey, resolvedError);
    return resolvedError;
  }
};

export default createRule<Options, MessageIds>({
  name: 'bundle-threshold',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Warn when bundle stats indicate that the analyzed file pushed the bundle beyond configured thresholds.',
      recommended: false
    },
    schema: [
      {
        type: 'object',
        properties: {
          reportPath: {
            type: 'string'
          },
          baselinePath: {
            type: 'string'
          },
          rootDir: {
            type: 'string'
          },
          thresholds: {
            type: 'object',
            additionalProperties: true
          }
        },
        required: ['reportPath', 'baselinePath'],
        additionalProperties: false
      }
    ],
    messages: {
      loadError: 'Unable to load bundle stats: {{error}}',
      moduleIncrease:
        'Bundle size increase for {{moduleId}} is {{delta}} bytes (limit {{limit}}). Baseline {{baselineSize}} bytes → current {{currentSize}} bytes.',
      moduleSize:
        'Bundle size for {{moduleId}} is {{currentSize}} bytes (limit {{limit}}). Baseline {{baselineSize}} bytes.',
      totalIncrease:
        'Overall bundle size increase is {{delta}} bytes (limit {{limit}}). Baseline {{baselineSize}} bytes → current {{currentSize}} bytes.',
      totalSize:
        'Overall bundle size is {{currentSize}} bytes (limit {{limit}}). Baseline {{baselineSize}} bytes.'
    }
  },
  defaultOptions: [{}],
  create(context) {
    const option = context.options[0];

    if (!option) {
      return {};
    }

    const rootDir = option.rootDir ? path.resolve(option.rootDir) : process.cwd();
    const reportPath = path.resolve(rootDir, option.reportPath);
    const baselinePath = path.resolve(rootDir, option.baselinePath);

    const deltaOrError = ensureBundleDelta(reportPath, baselinePath);

    if (deltaOrError instanceof Error) {
      return {
        Program(node: TSESTree.Program) {
          context.report({
            node,
            messageId: 'loadError',
            data: {
              error: deltaOrError.message
            }
          });
        }
      };
    }

    const delta = deltaOrError;
    const thresholds = option.thresholds;
    const breaches = evaluateBundleThresholds(delta, thresholds);
    const totalBreaches = breaches.filter(entry => entry.scope === 'total');

    const filename = context.getFilename();

    return {
      Program(node: TSESTree.Program) {
        const moduleDelta = getModuleDelta(delta, path.relative(rootDir, filename));

        if (!moduleDelta) {
          if (!totalBreaches.length) {
            return;
          }

          for (const breach of totalBreaches) {
            if (breach.kind === 'maxIncrease') {
              context.report({
                node,
                messageId: 'totalIncrease',
                data: {
                  delta: breach.delta.delta.toString(),
                  limit: breach.limit.toString(),
                  baselineSize: breach.delta.baselineSize.toString(),
                  currentSize: breach.delta.currentSize.toString()
                }
              });
            } else {
              context.report({
                node,
                messageId: 'totalSize',
                data: {
                  limit: breach.limit.toString(),
                  baselineSize: breach.delta.baselineSize.toString(),
                  currentSize: breach.delta.currentSize.toString()
                }
              });
            }
          }

          return;
        }

        const moduleBreaches = breaches.filter(
          entry => entry.scope === 'module' && entry.moduleId === moduleDelta.id
        );

        for (const breach of moduleBreaches) {
          if (breach.kind === 'maxIncrease') {
            context.report({
              node,
              messageId: 'moduleIncrease',
              data: {
                moduleId: moduleDelta.id,
                delta: moduleDelta.delta.toString(),
                limit: breach.limit.toString(),
                baselineSize: moduleDelta.baselineSize.toString(),
                currentSize: moduleDelta.currentSize.toString()
              }
            });
          } else {
            context.report({
              node,
              messageId: 'moduleSize',
              data: {
                moduleId: moduleDelta.id,
                limit: breach.limit.toString(),
                baselineSize: moduleDelta.baselineSize.toString(),
                currentSize: moduleDelta.currentSize.toString()
              }
            });
          }
        }

        if (!moduleBreaches.length) {
          for (const breach of totalBreaches) {
            if (breach.kind === 'maxIncrease') {
              context.report({
                node,
                messageId: 'totalIncrease',
                data: {
                  delta: breach.delta.delta.toString(),
                  limit: breach.limit.toString(),
                  baselineSize: breach.delta.baselineSize.toString(),
                  currentSize: breach.delta.currentSize.toString()
                }
              });
            } else {
              context.report({
                node,
                messageId: 'totalSize',
                data: {
                  limit: breach.limit.toString(),
                  baselineSize: breach.delta.baselineSize.toString(),
                  currentSize: breach.delta.currentSize.toString()
                }
              });
            }
          }
        }
      }
    };
  }
});
