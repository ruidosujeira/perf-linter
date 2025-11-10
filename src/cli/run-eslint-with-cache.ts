import { ESLint } from "eslint";
import fileEntryCache from "file-entry-cache";
import { createHash } from "node:crypto";
import { promises as fsPromises, existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import yargsParser from "yargs-parser";

const CONFIG_CACHE_KEY = "__configHash";
const DEFAULT_CACHE_LOCATION = ".eslintcache";
const CACHE_NAMESPACE = "perf-linter-eslint";

interface CliArguments {
  _: Array<string | number>;
  ext?: string[] | string;
  fix?: boolean;
  cache?: boolean;
  cacheLocation?: string;
  config?: string;
  format?: string;
  ignorePath?: string;
  maxWarnings?: number;
  quiet?: boolean;
  resolvePluginsRelativeTo?: string;
  noEslintrc?: boolean;
}

interface WorkerInput {
  files: string[];
  eslintOptions: ESLint.Options;
}

interface WorkerOutput {
  results: ESLint.LintResult[];
}

function parseExtensions(ext: CliArguments["ext"]): string[] {
  if (!ext) {
    return ["ts"];
  }
  const list = Array.isArray(ext) ? ext : String(ext).split(",");
  return list
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.startsWith(".") ? value.slice(1) : value));
}

async function ensureCacheDirectory(location: string): Promise<string> {
  const resolved = path.resolve(process.cwd(), location);
  if (existsSync(resolved)) {
    const stats = statSync(resolved);
    if (stats.isDirectory()) {
      return resolved;
    }
    const alternative = `${resolved}.dir`;
    await fsPromises.mkdir(alternative, { recursive: true });
    return alternative;
  }
  await fsPromises.mkdir(resolved, { recursive: true });
  return resolved;
}

async function collectFiles(patterns: string[], extensions: string[]): Promise<string[]> {
  const { globby } = await import("globby");
  const files = await globby(patterns, {
    absolute: true,
    caseSensitiveMatch: false,
    expandDirectories: {
      extensions,
    },
    gitignore: true,
    onlyFiles: true,
  });
  const unique = new Set<string>();
  for (const file of files) {
    unique.add(path.normalize(file));
  }
  return Array.from(unique);
}

async function filterIgnoredFiles(files: string[], eslintOptions: ESLint.Options): Promise<string[]> {
  if (files.length === 0) {
    return files;
  }
  const eslint = new ESLint(eslintOptions);
  const accepted: string[] = [];
  for (const filePath of files) {
    const isIgnored = await eslint.isPathIgnored(filePath);
    if (!isIgnored) {
      accepted.push(filePath);
    }
  }
  return accepted;
}

function createConfigSignature(options: ESLint.Options, patterns: string[], extensions: string[]): string {
  const normalized = {
    options,
    patterns,
    extensions,
    version: ESLint.version,
  };
  return createHash("sha1").update(JSON.stringify(normalized)).digest("hex");
}

function partitionFiles(files: string[], workers: number): Map<number, string[]> {
  const partitions = new Map<number, string[]>();
  if (files.length === 0) {
    return partitions;
  }
  for (const filePath of files) {
    const hash = createHash("md5").update(filePath).digest();
    const bucket = hash[0] % workers;
    if (!partitions.has(bucket)) {
      partitions.set(bucket, []);
    }
    partitions.get(bucket)?.push(filePath);
  }
  return partitions;
}

function spawnWorker(input: WorkerInput): Promise<WorkerOutput> {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(__dirname, "run-eslint-worker.js");
    const worker = new Worker(workerPath, {
      workerData: input,
    });

    worker.once("message", (message: WorkerOutput & { error?: { message: string; stack?: string } }) => {
      if (message && "error" in message && message.error) {
        reject(new Error(message.error.message));
        return;
      }
      resolve(message);
    });

    worker.once("error", (error) => {
      reject(error);
    });

    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

function summarizeResults(results: ESLint.LintResult[]): {
  errorCount: number;
  warningCount: number;
  fatalErrorCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  usedDeprecatedRules: ESLint.DeprecatedRuleUse[];
} {
  let errorCount = 0;
  let warningCount = 0;
  let fatalErrorCount = 0;
  let fixableErrorCount = 0;
  let fixableWarningCount = 0;
  const usedDeprecatedRules: ESLint.DeprecatedRuleUse[] = [];

  for (const result of results) {
    errorCount += result.errorCount;
    warningCount += result.warningCount;
    fatalErrorCount += result.fatalErrorCount;
    fixableErrorCount += result.fixableErrorCount;
    fixableWarningCount += result.fixableWarningCount;
    usedDeprecatedRules.push(...result.usedDeprecatedRules);
  }

  return {
    errorCount,
    warningCount,
    fatalErrorCount,
    fixableErrorCount,
    fixableWarningCount,
    usedDeprecatedRules,
  };
}

function applyQuietMode(results: ESLint.LintResult[]): ESLint.LintResult[] {
  return results.map((result) => {
    if (result.warningCount === 0) {
      return result;
    }

    const filteredMessages = result.messages.filter((message) => message.severity === 2);
    const filteredSuppressed = result.suppressedMessages.filter((message) => message.severity === 2);

    return {
      ...result,
      messages: filteredMessages,
      suppressedMessages: filteredSuppressed,
      warningCount: 0,
      fixableWarningCount: 0,
    };
  });
}

async function run(): Promise<void> {
  const argv = yargsParser(process.argv.slice(2), {
    array: ["ext"],
    boolean: ["fix", "quiet", "cache", "noEslintrc"],
    configuration: {
      "camel-case-expansion": true,
      "boolean-negation": true,
    },
    default: {
      cache: true,
    },
    number: ["maxWarnings"],
    string: ["cacheLocation", "config", "format", "ignorePath", "resolvePluginsRelativeTo"],
  }) as CliArguments;

  const positional = argv._.map((value) => String(value));
  const patterns = positional.length > 0 ? positional : ["src"];
  const extensions = parseExtensions(argv.ext);
  type ExtendedESLintOptions = ESLint.Options & {
    ignorePath?: string;
    resolvePluginsRelativeTo?: string;
    useEslintrc?: boolean;
    extensions?: string[];
  };
  const eslintOptionsBase: ExtendedESLintOptions = {
    cwd: process.cwd(),
    overrideConfigFile: argv.config,
    resolvePluginsRelativeTo: argv.resolvePluginsRelativeTo,
    useEslintrc: typeof argv.noEslintrc === "boolean" ? !argv.noEslintrc : undefined,
    extensions,
    fix: Boolean(argv.fix),
  };
  if (argv.ignorePath) {
    eslintOptionsBase.ignorePath = path.resolve(process.cwd(), argv.ignorePath);
  }

  const filesFromPatterns = await collectFiles(patterns, extensions);
  const files = await filterIgnoredFiles(filesFromPatterns, {
    ...eslintOptionsBase,
    cache: false,
  });

  if (files.length === 0) {
    console.log("No files matched the provided patterns.");
    return;
  }

  const useCache = argv.cache !== false;
  const cacheLocation = argv.cacheLocation ?? DEFAULT_CACHE_LOCATION;
  const cacheDirectory = await ensureCacheDirectory(cacheLocation);

  let eslintCache = fileEntryCache.create(CACHE_NAMESPACE, cacheDirectory);
  const configSignature = createConfigSignature(eslintOptionsBase, patterns, extensions);
  const storedSignature = eslintCache.cache.getKey(CONFIG_CACHE_KEY) as string | undefined;

  let forceAll = false;
  if (!useCache) {
    forceAll = true;
    eslintCache.destroy();
    eslintCache = fileEntryCache.create(CACHE_NAMESPACE, cacheDirectory);
  } else if (storedSignature !== configSignature) {
    eslintCache.destroy();
    eslintCache = fileEntryCache.create(CACHE_NAMESPACE, cacheDirectory);
    forceAll = true;
  }

  const analysis = eslintCache.analyzeFiles(files);
  for (const missing of analysis.notFoundFiles) {
    eslintCache.removeEntry(missing);
  }

  const filesToLint = forceAll ? files : analysis.changedFiles;

  if (useCache && !forceAll && filesToLint.length === 0) {
    eslintCache.reconcile();
    eslintCache.cache.setKey(CONFIG_CACHE_KEY, configSignature);
    eslintCache.cache.save(true);
    console.log("✅ ESLint cache hit – no changes detected.");
    return;
  }

  const cpuCount = Math.max(1, os.cpus().length);
  const workerCount = Math.min(cpuCount, Math.max(filesToLint.length, 1));
  const partitions = partitionFiles(filesToLint, workerCount);

  const workerInputs: WorkerInput[] = [];
  for (const [bucket, bucketFiles] of partitions) {
    if (bucketFiles.length === 0) {
      continue;
    }
    const cacheFile = path.join(cacheDirectory, `cache-${bucket}.json`);
    workerInputs.push({
      files: bucketFiles,
      eslintOptions: {
        ...eslintOptionsBase,
        cache: useCache,
        cacheLocation: cacheFile,
        fix: Boolean(argv.fix),
      },
    });
  }

  if (workerInputs.length === 0) {
    const cacheFile = path.join(cacheDirectory, "cache-0.json");
    workerInputs.push({
      files: filesToLint,
      eslintOptions: {
        ...eslintOptionsBase,
        cache: useCache,
        cacheLocation: cacheFile,
        fix: Boolean(argv.fix),
      },
    });
  }

  const workerPromises = workerInputs.map((input) => spawnWorker(input));
  let aggregatedResults: ESLint.LintResult[] = [];

  for (const workerPromise of workerPromises) {
    const output = await workerPromise;
    aggregatedResults = aggregatedResults.concat(output.results);
  }

  let finalResults = aggregatedResults;
  if (argv.quiet) {
    finalResults = applyQuietMode(aggregatedResults);
  }

  const summary = summarizeResults(finalResults);

  const formatterEslint = new ESLint({
    ...eslintOptionsBase,
    cache: false,
  });
  const formatter = await formatterEslint.loadFormatter(argv.format);
  const formatterMeta = {
    errorCount: summary.errorCount,
    warningCount: summary.warningCount,
    fixableErrorCount: summary.fixableErrorCount,
    fixableWarningCount: summary.fixableWarningCount,
    usedDeprecatedRules: summary.usedDeprecatedRules,
  } as unknown as ESLint.LintResultData;
  const formattedOutput = await formatter.format(finalResults, formatterMeta);
  if (formattedOutput) {
    process.stdout.write(formattedOutput);
  }

  eslintCache.reconcile();
  eslintCache.cache.setKey(CONFIG_CACHE_KEY, configSignature);
  eslintCache.cache.save(true);

  if (summary.fatalErrorCount > 0 || summary.errorCount > 0) {
    process.exitCode = 1;
    return;
  }

  if (typeof argv.maxWarnings === "number" && summary.warningCount > argv.maxWarnings) {
    console.error(
      `ESLint found ${summary.warningCount} warnings, which exceeds the configured --max-warnings value of ${argv.maxWarnings}.`,
    );
    process.exitCode = 1;
    return;
  }

  const summaryParts = [`${finalResults.length} files linted`];
  if (useCache) {
    summaryParts.push(`${filesToLint.length} executed, ${files.length - filesToLint.length} from cache`);
  }
  if (argv.fix) {
    summaryParts.push("automatic fixes applied");
  }
  console.log(`✅ ESLint completed: ${summaryParts.join("; ")}.`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
