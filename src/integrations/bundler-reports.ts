import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type SupportedBundler = 'webpack' | 'rollup' | 'vite' | 'unknown';

export interface BundleModuleStat {
  id: string;
  size: number;
}

export interface BundleReport {
  bundler: SupportedBundler;
  modules: BundleModuleStat[];
  totalSize: number;
  sourcePath: string;
}

export interface ModuleDelta {
  id: string;
  baselineSize: number;
  currentSize: number;
  delta: number;
}

export interface BundleTotalDelta {
  baselineSize: number;
  currentSize: number;
  delta: number;
}

export interface BundleDelta {
  bundler: SupportedBundler;
  reportPath: string;
  baselinePath?: string;
  modules: Map<string, ModuleDelta>;
  total: BundleTotalDelta;
}

export interface ModuleThreshold {
  /** Maximum allowed increase in bytes compared to the baseline. */
  maxIncrease?: number;
  /** Maximum allowed size in bytes. */
  maxSize?: number;
}

export interface BundleThresholds {
  /** Thresholds applied to the total bundle size. */
  total?: ModuleThreshold;
  /** Thresholds applied to specific modules. */
  modules?: Record<string, ModuleThreshold>;
  /** Thresholds applied to modules that don't match an explicit pattern. */
  defaultModule?: ModuleThreshold;
}

export interface BundleThresholdBreach {
  scope: 'module' | 'total';
  kind: 'maxIncrease' | 'maxSize';
  limit: number;
  moduleId?: string;
  delta: ModuleDelta | BundleTotalDelta;
}

const cachedReports = new Map<string, BundleReport>();

export const normalizeModuleId = (id: string): string => {
  const withForwardSlashes = id.replace(/\\+/g, '/');
  const withoutLeadingDot = withForwardSlashes.replace(/^\.\/+/, '');
  return withoutLeadingDot.replace(/^\/+/, '');
};

const aggregateModules = (modules: BundleModuleStat[]): BundleModuleStat[] => {
  const aggregated = new Map<string, number>();

  for (const module of modules) {
    if (!module.id) {
      continue;
    }

    const normalizedId = normalizeModuleId(module.id);
    const existing = aggregated.get(normalizedId) ?? 0;
    aggregated.set(normalizedId, existing + module.size);
  }

  return Array.from(aggregated.entries()).map(([id, size]) => ({
    id,
    size
  }));
};

const detectBundler = (data: unknown): SupportedBundler => {
  if (!data || typeof data !== 'object') {
    return 'unknown';
  }

  if (Array.isArray((data as { modules?: unknown }).modules)) {
    return 'webpack';
  }

  if (Array.isArray((data as { chunks?: unknown }).chunks)) {
    return 'vite';
  }

  if (Array.isArray((data as { output?: unknown }).output)) {
    return 'rollup';
  }

  if ('rollupVersion' in (data as Record<string, unknown>)) {
    return 'rollup';
  }

  if ('viteVersion' in (data as Record<string, unknown>)) {
    return 'vite';
  }

  return 'unknown';
};

const parseWebpackModules = (data: Record<string, unknown>): BundleModuleStat[] => {
  if (!Array.isArray(data.modules)) {
    return [];
  }

  return data.modules
    .map(module => {
      if (!module || typeof module !== 'object') {
        return null;
      }

      const typed = module as Record<string, unknown>;
      const id =
        typeof typed.identifier === 'string'
          ? typed.identifier
          : typeof typed.name === 'string'
            ? typed.name
            : typeof typed.id === 'string'
              ? typed.id
              : undefined;
      const sizeValue =
        typeof typed.size === 'number'
          ? typed.size
          : typeof typed.renderedSize === 'number'
            ? typed.renderedSize
            : typeof typed.sizes === 'number'
              ? typed.sizes
              : undefined;

      if (!id || typeof sizeValue !== 'number' || !Number.isFinite(sizeValue)) {
        return null;
      }

      return { id, size: sizeValue };
    })
    .filter((module): module is BundleModuleStat => Boolean(module));
};

const parseRollupModules = (data: Record<string, unknown>): BundleModuleStat[] => {
  const outputs = Array.isArray(data.output)
    ? data.output
    : data.output
      ? [data.output]
      : [];

  const modules: BundleModuleStat[] = [];

  for (const output of outputs) {
    if (!output || typeof output !== 'object') {
      continue;
    }

    const typedOutput = output as Record<string, unknown>;
    const modulesData = typedOutput.modules;

    if (!modulesData) {
      continue;
    }

    if (Array.isArray(modulesData)) {
      for (const module of modulesData) {
        if (!module || typeof module !== 'object') {
          continue;
        }

        const typedModule = module as Record<string, unknown>;
        const id =
          typeof typedModule.id === 'string'
            ? typedModule.id
            : typeof typedModule.name === 'string'
              ? typedModule.name
              : undefined;
        const sizeValue =
          typeof typedModule.renderedLength === 'number'
            ? typedModule.renderedLength
            : typeof typedModule.renderedSize === 'number'
              ? typedModule.renderedSize
              : typeof typedModule.size === 'number'
                ? typedModule.size
                : undefined;

        if (!id || typeof sizeValue !== 'number' || !Number.isFinite(sizeValue)) {
          continue;
        }

        modules.push({ id, size: sizeValue });
      }

      continue;
    }

    if (typeof modulesData === 'object') {
      for (const [key, value] of Object.entries(modulesData as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') {
          continue;
        }

        const typedValue = value as Record<string, unknown>;
        const sizeValue =
          typeof typedValue.renderedLength === 'number'
            ? typedValue.renderedLength
            : typeof typedValue.renderedSize === 'number'
              ? typedValue.renderedSize
              : typeof typedValue.size === 'number'
                ? typedValue.size
                : typeof typedValue.originalLength === 'number'
                  ? typedValue.originalLength
                  : undefined;

        if (typeof sizeValue !== 'number' || !Number.isFinite(sizeValue)) {
          continue;
        }

        modules.push({ id: key, size: sizeValue });
      }
    }
  }

  return modules;
};

const parseViteModules = (data: Record<string, unknown>): BundleModuleStat[] => {
  if (!Array.isArray(data.chunks)) {
    return [];
  }

  const modules: BundleModuleStat[] = [];

  for (const chunk of data.chunks) {
    if (!chunk || typeof chunk !== 'object') {
      continue;
    }

    const typedChunk = chunk as Record<string, unknown>;
    const modulesData = typedChunk.modules;

    if (!modulesData) {
      continue;
    }

    if (Array.isArray(modulesData)) {
      for (const module of modulesData) {
        if (!module || typeof module !== 'object') {
          continue;
        }

        const typedModule = module as Record<string, unknown>;
        const id =
          typeof typedModule.id === 'string'
            ? typedModule.id
            : typeof typedModule.name === 'string'
              ? typedModule.name
              : typeof typedModule.file === 'string'
                ? typedModule.file
                : undefined;
        const sizeValue =
          typeof typedModule.renderedLength === 'number'
            ? typedModule.renderedLength
            : typeof typedModule.renderedSize === 'number'
              ? typedModule.renderedSize
              : typeof typedModule.size === 'number'
                ? typedModule.size
                : typeof typedModule.originalLength === 'number'
                  ? typedModule.originalLength
                  : undefined;

        if (!id || typeof sizeValue !== 'number' || !Number.isFinite(sizeValue)) {
          continue;
        }

        modules.push({ id, size: sizeValue });
      }

      continue;
    }

    if (typeof modulesData === 'object') {
      for (const [key, value] of Object.entries(modulesData as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') {
          continue;
        }

        const typedValue = value as Record<string, unknown>;
        const sizeValue =
          typeof typedValue.renderedLength === 'number'
            ? typedValue.renderedLength
            : typeof typedValue.renderedSize === 'number'
              ? typedValue.renderedSize
              : typeof typedValue.size === 'number'
                ? typedValue.size
                : typeof typedValue.originalLength === 'number'
                  ? typedValue.originalLength
                  : undefined;

        if (typeof sizeValue !== 'number' || !Number.isFinite(sizeValue)) {
          continue;
        }

        modules.push({ id: key, size: sizeValue });
      }
    }
  }

  return modules;
};

const parseUnknownModules = (data: Record<string, unknown>): BundleModuleStat[] => {
  if (Array.isArray(data.modules)) {
    return parseWebpackModules(data);
  }

  if (Array.isArray(data.chunks)) {
    return parseViteModules(data);
  }

  if (Array.isArray(data.output)) {
    return parseRollupModules(data);
  }

  return [];
};

const parseModules = (data: Record<string, unknown>, bundler: SupportedBundler): BundleModuleStat[] => {
  switch (bundler) {
    case 'webpack':
      return parseWebpackModules(data);
    case 'rollup':
      return parseRollupModules(data);
    case 'vite':
      return parseViteModules(data);
    default:
      return parseUnknownModules(data);
  }
};

export const loadBundleReport = (reportPath: string): BundleReport => {
  const resolvedPath = path.resolve(reportPath);
  const cached = cachedReports.get(resolvedPath);

  if (cached) {
    return cached;
  }

  const raw = readFileSync(resolvedPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const bundler = detectBundler(parsed);
  const modules = aggregateModules(parseModules(parsed, bundler));
  const totalSize = modules.reduce((sum, module) => sum + module.size, 0);
  const report: BundleReport = {
    bundler,
    modules,
    totalSize,
    sourcePath: resolvedPath
  };

  cachedReports.set(resolvedPath, report);

  return report;
};

export const loadBundleBaseline = (baselinePath: string): BundleReport | null => {
  const resolvedPath = path.resolve(baselinePath);

  if (!existsSync(resolvedPath)) {
    return null;
  }

  return loadBundleReport(resolvedPath);
};

export const saveBundleBaseline = (baselinePath: string, report: BundleReport): void => {
  const resolvedPath = path.resolve(baselinePath);
  const directory = path.dirname(resolvedPath);

  mkdirSync(directory, { recursive: true });
  const payload = {
    bundler: report.bundler,
    modules: report.modules,
    totalSize: report.totalSize
  };
  writeFileSync(resolvedPath, JSON.stringify(payload, null, 2), 'utf8');
  cachedReports.set(resolvedPath, {
    ...report,
    sourcePath: resolvedPath
  });
};

export const computeBundleDelta = (
  current: BundleReport,
  baseline: BundleReport | null
): BundleDelta => {
  const baselineMap = new Map<string, number>();

  if (baseline) {
    for (const module of baseline.modules) {
      baselineMap.set(normalizeModuleId(module.id), module.size);
    }
  }

  const modules = new Map<string, ModuleDelta>();

  for (const module of current.modules) {
    const id = normalizeModuleId(module.id);
    const baselineSize = baselineMap.get(id) ?? 0;
    const delta = module.size - baselineSize;

    modules.set(id, {
      id,
      baselineSize,
      currentSize: module.size,
      delta
    });

    baselineMap.delete(id);
  }

  for (const [id, baselineSize] of baselineMap.entries()) {
    modules.set(id, {
      id,
      baselineSize,
      currentSize: 0,
      delta: -baselineSize
    });
  }

  const baselineSizeTotal = baseline?.totalSize ?? 0;
  const currentSizeTotal = current.totalSize;

  return {
    bundler: current.bundler,
    reportPath: current.sourcePath,
    baselinePath: baseline?.sourcePath,
    modules,
    total: {
      baselineSize: baselineSizeTotal,
      currentSize: currentSizeTotal,
      delta: currentSizeTotal - baselineSizeTotal
    }
  };
};

const resolveModuleThreshold = (
  moduleId: string,
  thresholds?: BundleThresholds
): ModuleThreshold | undefined => {
  if (!thresholds) {
    return undefined;
  }

  const resolvedId = normalizeModuleId(moduleId);
  const matches: ModuleThreshold[] = [];

  if (thresholds.defaultModule) {
    matches.push(thresholds.defaultModule);
  }

  if (thresholds.modules) {
    for (const [pattern, moduleThreshold] of Object.entries(thresholds.modules)) {
      if (!moduleThreshold) {
        continue;
      }

      const normalizedPattern = normalizeModuleId(pattern);

      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regexBody = pattern.slice(1, -1);
        try {
          const regex = new RegExp(regexBody);
          if (regex.test(resolvedId)) {
            matches.push(moduleThreshold);
          }
        } catch {
          // Ignore invalid regular expressions.
        }
        continue;
      }

      if (resolvedId === normalizedPattern || resolvedId.endsWith(`/${normalizedPattern}`) || resolvedId.includes(normalizedPattern)) {
        matches.push(moduleThreshold);
      }
    }
  }

  if (!matches.length) {
    return undefined;
  }

  return matches.reduce<ModuleThreshold>((accumulator, current) => ({
    ...accumulator,
    ...current
  }));
};

export const evaluateBundleThresholds = (
  delta: BundleDelta,
  thresholds?: BundleThresholds
): BundleThresholdBreach[] => {
  if (!thresholds) {
    return [];
  }

  const breaches: BundleThresholdBreach[] = [];

  if (thresholds.total) {
    const { maxIncrease, maxSize } = thresholds.total;

    if (typeof maxIncrease === 'number' && delta.total.delta > maxIncrease) {
      breaches.push({
        scope: 'total',
        kind: 'maxIncrease',
        limit: maxIncrease,
        delta: delta.total
      });
    }

    if (typeof maxSize === 'number' && delta.total.currentSize > maxSize) {
      breaches.push({
        scope: 'total',
        kind: 'maxSize',
        limit: maxSize,
        delta: delta.total
      });
    }
  }

  for (const moduleDelta of delta.modules.values()) {
    const moduleThreshold = resolveModuleThreshold(moduleDelta.id, thresholds);

    if (!moduleThreshold) {
      continue;
    }

    const { maxIncrease, maxSize } = moduleThreshold;

    if (typeof maxIncrease === 'number' && moduleDelta.delta > maxIncrease) {
      breaches.push({
        scope: 'module',
        kind: 'maxIncrease',
        moduleId: moduleDelta.id,
        limit: maxIncrease,
        delta: moduleDelta
      });
    }

    if (typeof maxSize === 'number' && moduleDelta.currentSize > maxSize) {
      breaches.push({
        scope: 'module',
        kind: 'maxSize',
        moduleId: moduleDelta.id,
        limit: maxSize,
        delta: moduleDelta
      });
    }
  }

  return breaches;
};

export const getModuleDelta = (
  delta: BundleDelta,
  moduleId: string
): ModuleDelta | undefined => {
  const normalized = normalizeModuleId(moduleId);
  return delta.modules.get(normalized) ?? Array.from(delta.modules.values()).find(entry => entry.id.endsWith(`/${normalized}`));
};

export const clearBundleReportCache = (): void => {
  cachedReports.clear();
};
