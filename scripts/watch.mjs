import { spawn } from "child_process";

const childSpecs = [
  {
    name: "TypeScript",
    command: process.execPath,
    args: ["./node_modules/typescript/bin/tsc", "-watch", "-p", "./"],
  },
  {
    name: "webview assets",
    command: process.execPath,
    args: ["./scripts/copy-webview-assets.mjs", "--watch"],
  },
];

const children = childSpecs.map((spec) => startChild(spec));

let shuttingDown = false;
let exitCode = 0;
let settledCount = 0;

function startChild(spec) {
  const child = spawn(spec.command, spec.args, {
    stdio: "inherit",
    shell: false,
  });

  const state = {
    name: spec.name,
    child,
    settled: false,
  };

  child.once("error", (err) => {
    if (state.settled) {
      return;
    }
    state.settled = true;
    settledCount += 1;
    console.error(`[watch] failed to start ${state.name}: ${err.message}`);
    beginShutdown(1);
    maybeExit();
  });

  child.once("exit", (code, signal) => {
    if (state.settled) {
      return;
    }
    state.settled = true;
    settledCount += 1;
    if (!shuttingDown) {
      if (signal) {
        console.error(`[watch] ${state.name} exited via ${signal}.`);
      }
      exitCode = typeof code === "number" && code !== 0 ? code : 1;
      beginShutdown(exitCode);
    } else {
      if (typeof code === "number" && code !== 0 && exitCode === 0) {
        exitCode = code;
      }
      if (signal && exitCode === 0) {
        exitCode = 1;
      }
    }
    maybeExit();
  });

  return state;
}

function beginShutdown(code) {
  if (code && code !== 0 && exitCode === 0) {
    exitCode = code;
  }
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const state of children) {
    if (!state.settled) {
      try {
        state.child.kill("SIGTERM");
      } catch (err) {
        console.error(`[watch] failed to stop ${state.name}: ${err.message}`);
      }
    }
  }
}

function maybeExit() {
  if (settledCount === children.length) {
    process.exit(exitCode);
  }
}

process.once("SIGINT", () => beginShutdown(0));
process.once("SIGTERM", () => beginShutdown(0));
