import * as path from "path";
import { glob } from "glob";

export async function run(): Promise<void> {
  // Load mocha via require so CommonJS constructability matches runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MochaCtor = require("mocha") as new (options?: {
    ui?: string;
    color?: boolean;
    timeout?: number;
  }) => {
    addFile(file: string): void;
    run(fn: (failures: number) => void): void;
  };

  const mocha = new MochaCtor({
    ui: "tdd",
    color: true,
    timeout: 10_000,
  });

  const testsRoot = path.resolve(__dirname, ".");
  const files = await glob("**/**.test.js", { cwd: testsRoot });

  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
