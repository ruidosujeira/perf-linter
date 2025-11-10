const { parentPort, workerData } = require("node:worker_threads");
const { ESLint } = require("eslint");

async function run() {
  const { files, eslintOptions } = workerData;

  if (!Array.isArray(files) || files.length === 0) {
    parentPort?.postMessage({ results: [] });
    return;
  }

  const eslint = new ESLint(eslintOptions);
  const results = await eslint.lintFiles(files);
  if (eslintOptions.fix) {
    await ESLint.outputFixes(results);
  }

  parentPort?.postMessage({ results });
}

run().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
