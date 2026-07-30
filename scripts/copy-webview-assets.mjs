import { copyFileSync, mkdirSync, watchFile, unwatchFile } from "fs";
import { join } from "path";

const root = process.cwd();
const sourceDir = join(root, "src", "webview", "askWizard");
const outputDir = join(root, "out", "webview", "askWizard");
const watchMode = process.argv.includes("--watch");
const sourceFiles = [
  "index.html",
  "styles.css",
  "handoffDemoAnimations.css",
];

copyAssets();

if (watchMode) {
  for (const file of sourceFiles) {
    const sourcePath = join(sourceDir, file);
    watchFile(sourcePath, { interval: 200 }, () => {
      copyAssets();
    });
  }

  const stop = () => {
    for (const file of sourceFiles) {
      unwatchFile(join(sourceDir, file));
    }
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

function copyAssets() {
  mkdirSync(outputDir, { recursive: true });
  for (const file of sourceFiles) {
    copyFileSync(join(sourceDir, file), join(outputDir, file));
  }
  if (watchMode) {
    console.log("[webview] copied ask wizard assets");
  }
}
