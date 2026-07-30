import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");
    const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;

    await runTests(
      vscodeExecutablePath
        ? {
            extensionDevelopmentPath,
            extensionTestsPath,
            vscodeExecutablePath,
          }
        : {
            extensionDevelopmentPath,
            extensionTestsPath,
          }
    );
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

void main();
