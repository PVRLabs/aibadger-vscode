/**
 * Process client for the local Badger CLI API (`aibadger/docs/api.md`).
 *
 * ## Protocol (production contract)
 *
 * Prompt 1 (explicit argv, no shell):
 * ```
 * badger api prompt --root <project> --focus design --input <goal-file>
 * ```
 *
 * Prompt 2 / extract:
 * ```
 * badger api extract --root <project> --focus design --input <selector-file> --goal-file <goal-file>
 * ```
 *
 * Input transport:
 * - Caller writes UTF-8 temporary files (`aibadger-<pid>-<hex>.txt`).
 * - Badger only reads; the extension deletes temps after the process exits
 *   (success or failure). Extract uses two files: selectors + goal.
 *
 * Success I/O:
 * - Exit 0, stdout = complete AI-facing prompt text (Prompt 1 or Prompt 2).
 * - stderr may hold non-fatal diagnostics (e.g. partial extract warnings).
 *
 * Failure I/O:
 * - Nonzero exit + stderr message (e.g. missing root/input → exit 1).
 * - No JSON envelope; do not parse TUI text.
 *
 * Wire flags:
 * - `--root` is always the extension-resolved project root.
 * - Relative **scope** stays extension-only (not sent on the Badger wire).
 * - Focus is fixed to `design` for MVP (no focus picker) and is preserved
 *   across Prompt 1 and Prompt 2.
 */

import { spawn } from "child_process";
import { randomBytes } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type {
  BadgerClient,
  BadgerReviewClient,
  ExtractPromptResult,
  ExtractRequest,
  GeneratePromptResult,
  GeneratePromptFailure,
  PromptRequest,
  PromptFocus,
  ReviewCapabilityResult,
  ReviewContextRequest,
  ReviewContinuationRequest,
  ReviewMode,
} from "./types";

/** Fixed MVP focus (no focus picker). Real API supports `code` | `design`. */
export const PROMPT_FOCUS: PromptFocus = "design";

/** Subcommand + operation shared by all prompt invocations. */
export const PROMPT_API_ARGS = ["api", "prompt"] as const;

/** Subcommand + operation for extract / Prompt 2. */
export const EXTRACT_API_ARGS = ["api", "extract"] as const;

export const REVIEW_CONTEXT_API_ARGS = ["api", "review-context"] as const;
export const REVIEW_CONTINUATION_API_ARGS = [
  "api",
  "review-continuation",
] as const;
export const MAX_REVIEW_INPUT_BYTES = 1024 * 1024;

/**
 * Goal files cannot be empty after strip. Used only on the wire when the
 * request text is blank — the Ask flow normally maps blank UI goals to
 * "Surprise me" before calling the client.
 */
export const BLANK_GOAL_WIRE_PLACEHOLDER = ".";

export type RunProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RunProcessError = {
  /** Node system error code when spawn fails (e.g. ENOENT). */
  code?: string;
  message: string;
};

export type RunProcess = (
  executable: string,
  args: readonly string[],
  options?: { signal?: AbortSignal }
) => Promise<RunProcessResult | { error: RunProcessError }>;

export type BadgerCliClientOptions = {
  /**
   * Process executable (e.g. `badger` on PATH, or an absolute path).
   * Invoked with an argument array — never via a shell string.
   */
  executable: string;
  /**
   * Optional arguments before `api prompt|extract ...` (wrappers only).
   * Production default is empty: the executable is the Badger binary itself.
   */
  scriptArgs?: readonly string[];
  /** Override process runner (tests). Default: `child_process.spawn`. */
  runProcess?: RunProcess;
  /** Override temp directory for input files (tests). */
  tmpDir?: string;
  /** Override temporary-file operations (focused lifecycle tests). */
  tempFiles?: {
    writeFile(
      file: string,
      contents: string,
      options: { encoding: "utf8" }
    ): Promise<void>;
    unlink(file: string): Promise<void>;
  };
};

/**
 * Build argv for `api prompt` after `executable` (+ optional `scriptArgs`).
 * Includes `--root` (required by the real API). Does not include relative scope.
 */
export function buildPromptArgs(
  projectRoot: string,
  inputFile: string,
  focus: PromptFocus
): string[] {
  return [
    ...PROMPT_API_ARGS,
    "--root",
    projectRoot,
    "--focus",
    focus,
    "--input",
    inputFile,
  ];
}

/**
 * Build extract argv. Includes `--root`. Relative scope is not a wire flag.
 * `--input` = selector file; `--goal-file` = original goal file.
 */
export function buildExtractArgs(
  projectRoot: string,
  selectorFile: string,
  goalFile: string,
  focus: PromptFocus
): string[] {
  return [
    ...EXTRACT_API_ARGS,
    "--root",
    projectRoot,
    "--focus",
    focus,
    "--input",
    selectorFile,
    "--goal-file",
    goalFile,
  ];
}

function appendReviewLimits(
  args: string[],
  maxPayloadBytes?: number,
  maxFileBytes?: number
): void {
  if (maxPayloadBytes !== undefined) {
    args.push("--max-payload-bytes", String(maxPayloadBytes));
  }
  if (maxFileBytes !== undefined) {
    args.push("--max-file-bytes", String(maxFileBytes));
  }
}

export function buildReviewContextArgs(
  repositoryRoot: string,
  mode: ReviewMode,
  options: {
    ref?: string;
    guidanceFile?: string;
    pathsFile?: string;
    maxPayloadBytes?: number;
    maxFileBytes?: number;
    includeTopology?: boolean;
  } = {}
): string[] {
  const args = [
    ...REVIEW_CONTEXT_API_ARGS,
    "--root",
    repositoryRoot,
    "--mode",
    mode,
  ];
  if (options.ref !== undefined) {
    args.push("--ref", options.ref);
  }
  if (options.guidanceFile !== undefined) {
    args.push("--input", options.guidanceFile);
  }
  if (options.pathsFile !== undefined) {
    args.push("--paths-file", options.pathsFile);
  }
  if (options.includeTopology) args.push("--include-topology");
  appendReviewLimits(args, options.maxPayloadBytes, options.maxFileBytes);
  return args;
}

export function buildReviewContinuationArgs(
  repositoryRoot: string,
  selectorFile: string,
  options: { maxPayloadBytes?: number; maxFileBytes?: number } = {}
): string[] {
  const args = [
    ...REVIEW_CONTINUATION_API_ARGS,
    "--root",
    repositoryRoot,
    "--input",
    selectorFile,
  ];
  appendReviewLimits(args, options.maxPayloadBytes, options.maxFileBytes);
  return args;
}

/** Goal text written to temp files; blank UI goals use a wire placeholder. */
export function goalTextForWire(goal: string): string {
  return goal.trim() === "" ? BLANK_GOAL_WIRE_PLACEHOLDER : goal;
}

/** Default process runner: spawn with piped stdio, no shell. */
export function createSpawnRunProcess(): RunProcess {
  return (executable, args, options) =>
    new Promise((resolve) => {
      const child = spawn(executable, [...args], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        signal: options?.signal,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        resolve({
          error: {
            code: err.code,
            message: err.message,
          },
        });
      });

      child.on("close", (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
}

/**
 * Check only whether the resolved executable can be started.
 *
 * The exit code is intentionally ignored: an older or unexpected binary may
 * reject `--version`, but it is still present. Real API compatibility remains
 * the responsibility of the requested prompt/extract operation.
 */
export async function canStartBadgerExecutable(
  executable: string,
  runProcess: RunProcess = createSpawnRunProcess()
): Promise<boolean> {
  const outcome = await runProcess(executable, ["--version"]);
  return !("error" in outcome);
}

function tempPath(tmpDir: string, label: string): string {
  return path.join(
    tmpDir,
    `aibadger-${label}-${process.pid}-${randomBytes(8).toString("hex")}.txt`
  );
}

/**
 * Concrete `BadgerClient` that invokes the local Badger CLI via explicit argv
 * arrays and caller-managed temporary input files.
 */
export function createBadgerCliClient(
  options: BadgerCliClientOptions
): BadgerClient & BadgerReviewClient {
  const runProcess = options.runProcess ?? createSpawnRunProcess();
  const tmpDir = options.tmpDir ?? os.tmpdir();
  const scriptArgs = options.scriptArgs ?? [];
  const tempFiles = options.tempFiles ?? fs;

  type TempInput = { label: string; contents: string };
  const runOperation = async (
    inputs: readonly TempInput[],
    buildArgs: (paths: readonly string[]) => readonly string[],
    operationOptions: {
      signal?: AbortSignal;
      maxInputBytes?: number;
    } = {}
  ): Promise<GeneratePromptResult> => {
    const { signal, maxInputBytes } = operationOptions;
    if (signal?.aborted) {
      return cancelledResult();
    }
    for (const input of inputs) {
      if (
        maxInputBytes !== undefined &&
        Buffer.byteLength(input.contents, "utf8") > maxInputBytes
      ) {
        return {
          ok: false,
          kind: "generationFailed",
          message: `Could not prepare input: ${input.label} exceeds the 1 MiB limit.`,
        };
      }
    }
    const paths = inputs.map((input) => tempPath(tmpDir, input.label));
    try {
      try {
        for (let index = 0; index < inputs.length; index++) {
          await tempFiles.writeFile(paths[index], inputs[index].contents, {
            encoding: "utf8",
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "failed to write input files";
        return {
          ok: false,
          kind: "generationFailed",
          message: sanitizeDiagnostic(`Could not prepare input: ${message}`),
        };
      }

      let outcome: Awaited<ReturnType<RunProcess>>;
      try {
        outcome = await runProcess(
          options.executable,
          [...scriptArgs, ...buildArgs(paths)],
          { signal }
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "process runner failed";
        return {
          ok: false,
          kind: "generationFailed",
          message: sanitizeDiagnostic(`Could not run Badger: ${message}`),
        };
      }
      if ("error" in outcome) {
        if (signal?.aborted || outcome.error.code === "ABORT_ERR") {
          return cancelledResult();
        }
        return mapSpawnError(outcome.error, options.executable);
      }
      return mapProcessOutcome(outcome);
    } finally {
      await Promise.all(
        paths.map((file) => tempFiles.unlink(file).catch(() => undefined))
      );
    }
  };

  return {
    async generatePrompt(
      request: PromptRequest
    ): Promise<GeneratePromptResult> {
      // Relative scope is extension-only; only projectRoot is on the wire.
      void request.scope;

      return runOperation(
        [{ label: "goal", contents: goalTextForWire(request.request) }],
        ([goalPath]) =>
          buildPromptArgs(request.projectRoot, goalPath, request.focus)
      );
    },

    async extractPrompt(
      request: ExtractRequest
    ): Promise<ExtractPromptResult> {
      // Relative scope is extension-only; only projectRoot is on the wire.
      void request.scope;

      return runOperation(
        [
          { label: "sel", contents: request.selectors },
          { label: "goal", contents: goalTextForWire(request.request) },
        ],
        ([selectorPath, goalPath]) =>
          buildExtractArgs(
            request.projectRoot,
            selectorPath,
            goalPath,
            request.focus
          )
      );
    },

    async reviewCapabilities(): Promise<ReviewCapabilityResult> {
      return probeReviewApiCapabilities(
        options.executable,
        runProcess,
        scriptArgs
      );
    },

    async reviewContext(
      request: ReviewContextRequest
    ): Promise<GeneratePromptResult> {
      const inputs: TempInput[] = [];
      let guidanceIndex: number | undefined;
      let pathsIndex: number | undefined;
      if (request.guidance !== undefined) {
        guidanceIndex = inputs.push({
          label: "review-guidance",
          contents: request.guidance,
        }) - 1;
      }
      if (request.selectedPaths !== undefined) {
        pathsIndex = inputs.push({
          label: "review-paths",
          contents: JSON.stringify(request.selectedPaths),
        }) - 1;
      }
      const result = await runOperation(
        inputs,
        (paths) =>
          buildReviewContextArgs(
            request.repositoryRoot,
            request.mode ?? "default",
            {
              ref: request.ref,
              guidanceFile:
                guidanceIndex === undefined ? undefined : paths[guidanceIndex],
              pathsFile: pathsIndex === undefined ? undefined : paths[pathsIndex],
              maxPayloadBytes: request.maxPayloadBytes,
              maxFileBytes: request.maxFileBytes,
              includeTopology: request.includeTopology,
            }
          ),
        {
          signal: request.signal,
          maxInputBytes: MAX_REVIEW_INPUT_BYTES,
        }
      );
      return redactFailure(result, [
        request.repositoryRoot,
        request.guidance,
        ...(request.selectedPaths ?? []),
      ]);
    },

    async reviewContinuation(
      request: ReviewContinuationRequest
    ): Promise<GeneratePromptResult> {
      const result = await runOperation(
        [{ label: "review-selectors", contents: request.selectors }],
        ([selectorPath]) =>
          buildReviewContinuationArgs(
            request.repositoryRoot,
            selectorPath,
            {
              maxPayloadBytes: request.maxPayloadBytes,
              maxFileBytes: request.maxFileBytes,
            }
          ),
        {
          signal: request.signal,
          maxInputBytes: MAX_REVIEW_INPUT_BYTES,
        }
      );
      return redactFailure(result, [request.repositoryRoot, request.selectors]);
    },
  };
}

function cancelledResult(): GeneratePromptResult {
  return {
    ok: false,
    kind: "cancelled",
    message: "Badger operation was cancelled.",
  };
}

export async function probeReviewApiCapabilities(
  executable: string,
  runProcess: RunProcess = createSpawnRunProcess(),
  scriptArgs: readonly string[] = []
): Promise<ReviewCapabilityResult> {
  let outcome: Awaited<ReturnType<RunProcess>>;
  try {
    outcome = await runProcess(executable, [...scriptArgs, "api", "--help"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "process runner failed";
    return {
      ok: false,
      kind: "generationFailed",
      message: sanitizeDiagnostic(`Could not run Badger: ${message}`),
    };
  }
  if ("error" in outcome) {
    return mapSpawnError(outcome.error, executable);
  }
  if (outcome.exitCode !== 0) {
    const failure = mapProcessOutcome(outcome);
    if (!failure.ok) {
      return failure;
    }
    return {
      ok: false,
      kind: "malformedResult",
      message: "Badger capability check returned an invalid result.",
    };
  }
  const help = `${outcome.stdout}\n${outcome.stderr}`;
  let reviewContext = /\breview-context\b/.test(help);
  let reviewContinuation = /\breview-continuation\b/.test(help);
  let reviewContextTopology = false;
  if (!reviewContext) {
    const contextHelp = await commandHelpText(
      executable,
      [...scriptArgs, ...REVIEW_CONTEXT_API_ARGS, "--help"],
      runProcess
    );
    reviewContext = contextHelp !== undefined;
    reviewContextTopology = contextHelp?.includes("--include-topology") ?? false;
  } else {
    const contextHelp = await commandHelpText(
      executable,
      [...scriptArgs, ...REVIEW_CONTEXT_API_ARGS, "--help"],
      runProcess
    );
    reviewContextTopology = contextHelp?.includes("--include-topology") ?? false;
  }
  if (!reviewContinuation) {
    reviewContinuation = await commandHelpSucceeds(
      executable,
      [...scriptArgs, ...REVIEW_CONTINUATION_API_ARGS, "--help"],
      runProcess
    );
  }
  return {
    ok: true,
    capabilities: {
      reviewContext,
      reviewContinuation,
      reviewContextTopology,
    },
  };
}

async function commandHelpSucceeds(
  executable: string,
  args: readonly string[],
  runProcess: RunProcess
): Promise<boolean> {
  try {
    const outcome = await runProcess(executable, args);
    return !("error" in outcome) && outcome.exitCode === 0;
  } catch {
    return false;
  }
}

async function commandHelpText(
  executable: string,
  args: readonly string[],
  runProcess: RunProcess
): Promise<string | undefined> {
  try {
    const outcome = await runProcess(executable, args);
    if ("error" in outcome || outcome.exitCode !== 0) return undefined;
    return `${outcome.stdout}\n${outcome.stderr}`;
  } catch {
    return undefined;
  }
}

function redactFailure(
  result: GeneratePromptResult,
  sensitiveValues: readonly (string | undefined)[]
): GeneratePromptResult {
  if (result.ok) {
    return result;
  }
  let message = result.message;
  for (const value of sensitiveValues) {
    if (value) {
      message = message.split(value).join("[redacted]");
    }
  }
  return { ...result, message };
}

function mapSpawnError(
  error: RunProcessError,
  executable: string
): GeneratePromptFailure {
  if (error.code === "ENOENT") {
    return {
      ok: false,
      kind: "executableUnavailable",
      message: `Badger executable not found: ${executable}`,
    };
  }
  return {
    ok: false,
    kind: "executableUnavailable",
    message: sanitizeDiagnostic(
      `Could not start Badger (${executable}): ${error.message}`
    ),
  };
}

function mapProcessOutcome(outcome: RunProcessResult): GeneratePromptResult {
  const { exitCode, stdout, stderr } = outcome;
  const trimmedOut = stdout.trim();
  const stderrSummary = summarizeStderr(stderr);

  if (exitCode === 0) {
    if (!trimmedOut) {
      return {
        ok: false,
        kind: "malformedResult",
        message: "Badger returned an empty prompt.",
      };
    }
    // Preserve exact AI-facing text (including trailing newline).
    return { ok: true, prompt: stdout };
  }

  if (looksLikeUnsupportedApi(stderr, exitCode)) {
    return {
      ok: false,
      kind: "unsupportedApi",
      message: sanitizeDiagnostic(
        stderrSummary
          ? `Installed Badger does not support the required API. ${stderrSummary}`
          : "Installed Badger does not support the required API."
      ),
    };
  }

  return {
    ok: false,
    kind: "generationFailed",
    message: sanitizeDiagnostic(
      stderrSummary
        ? `Badger failed (exit ${exitCode}): ${stderrSummary}`
        : `Badger failed with exit code ${exitCode}.`
    ),
  };
}

/**
 * Heuristic for "installed tool lacks required API" vs generic generation
 * failure. Prefer short, non-repository diagnostics only.
 */
function looksLikeUnsupportedApi(stderr: string, exitCode: number): boolean {
  if (exitCode === 0) {
    return false;
  }
  const lower = stderr.toLowerCase();
  return (
    lower.includes("invalid choice") ||
    lower.includes("unknown command") ||
    lower.includes("unrecognized arguments") ||
    lower.includes("unknown api operation") ||
    lower.includes("unknown api flag") ||
    // Older release builds may expose `api` but gate its file-based transport
    // behind development builds. That is an unsupported API capability, not a
    // repository-generation failure.
    (lower.includes("only available in development builds") &&
      (lower.includes("--input") || lower.includes("--goal-file"))) ||
    (lower.includes("invalid") && lower.includes("operation")) ||
    lower.includes("no such command") ||
    // Release builds without `api` often surface as plain unknown command /
    // usage text that still fails the required operations.
    (lower.includes("error:") && lower.includes("unknown api"))
  );
}

function summarizeStderr(stderr: string): string {
  const line = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) {
    return "";
  }
  // Drop argparse/help "usage:" noise; prefer Error: lines from Badger.
  if (line.toLowerCase().startsWith("usage:")) {
    const errorLine = stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^error:/i.test(l));
    return errorLine ?? line;
  }
  return line;
}

/** Cap length and drop non-printable control chars; never embed full prompts. */
function sanitizeDiagnostic(message: string): string {
  let cleaned = "";
  for (const ch of message) {
    const code = ch.charCodeAt(0);
    // Keep tab (9) and common whitespace; drop other C0 controls.
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      continue;
    }
    cleaned += ch;
  }
  const max = 240;
  if (cleaned.length <= max) {
    return cleaned;
  }
  return `${cleaned.slice(0, max - 1)}…`;
}
