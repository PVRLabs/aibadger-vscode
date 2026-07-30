import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  BLANK_GOAL_WIRE_PLACEHOLDER,
  buildExtractArgs,
  buildPromptArgs,
  canStartBadgerExecutable,
  createBadgerCliClient,
  EXTRACT_API_ARGS,
  goalTextForWire,
  PROMPT_API_ARGS,
  PROMPT_FOCUS,
  type RunProcess,
  type RunProcessResult,
} from "./cliClient";
import {
  DEFAULT_EXECUTABLE,
  EXECUTABLE_ENV,
  EXECUTABLE_PATH_SETTING,
  resolveBadgerExecutable,
} from "./resolveExecutable";
import type { ExtractRequest, PromptRequest } from "./types";

const STUB_EXECUTABLE = "badger";

const baseRequest: PromptRequest = {
  projectRoot: path.join(path.sep, "ws", "alpha"),
  scope: "internal/scanner",
  request: "Explain how greeting works.",
  focus: "design",
};

const PROMPT1_STDOUT =
  "[PROJECT TOPOLOGY]\nRoot: /ws/alpha\n\n[TASK]\nExplain how greeting works.\n\n[CONSTRAINT]\nFILE:\n";

const PROMPT2_STDOUT =
  "[PROJECT TOPOLOGY]\n\n[TASK]\nExplain how greeting works.\n\n[OUTPUT CONSTRAINT]\nUse context.\n\n[CONTEXT]\n// README.md\nhello\n";

/** Assert relative scope is never on the wire; --root is required. */
function assertRootNoScope(
  args: readonly string[],
  projectRoot: string,
  scope?: string
): void {
  assert.ok(args.includes("--root"), `argv must include --root\n${args.join(" ")}`);
  const rootIdx = args.indexOf("--root");
  assert.strictEqual(args[rootIdx + 1], projectRoot);
  assert.ok(!args.includes("--scope"));
  assert.ok(!args.includes("--project-root"));
  assert.ok(!args.includes("--projectRoot"));
  assert.ok(!args.includes("--cwd"));
  if (scope) {
    assert.ok(
      !args.includes(scope),
      `relative scope must not appear on argv: ${scope}\n${args.join(" ")}`
    );
  }
}

/** Stub CLI that validates real API argv and returns canned stdout. */
function createStubRunProcess(options?: {
  promptStdout?: string;
  extractStdout?: string;
  promptExit?: number;
  extractExit?: number;
  promptStderr?: string;
  extractStderr?: string;
}): {
  runProcess: RunProcess;
  calls: { executable: string; args: string[] }[];
} {
  const calls: { executable: string; args: string[] }[] = [];
  const runProcess: RunProcess = async (executable, args) => {
    calls.push({ executable, args: [...args] });
    const op = args[1]; // api <op>
    if (op === "prompt") {
      return {
        exitCode: options?.promptExit ?? 0,
        stdout: options?.promptStdout ?? PROMPT1_STDOUT,
        stderr: options?.promptStderr ?? "",
      };
    }
    if (op === "extract") {
      return {
        exitCode: options?.extractExit ?? 0,
        stdout: options?.extractStdout ?? PROMPT2_STDOUT,
        stderr: options?.extractStderr ?? "",
      };
    }
    return {
      exitCode: 2,
      stdout: "",
      stderr: `Error: unknown api operation: ${op}\n`,
    };
  };
  return { runProcess, calls };
}

suite("buildPromptArgs", () => {
  test("uses api prompt with --root, fixed design focus, and --input", () => {
    const args = buildPromptArgs("/proj", "/tmp/goal.txt", "design");
    assert.deepStrictEqual(args, [
      "api",
      "prompt",
      "--root",
      "/proj",
      "--focus",
      "design",
      "--input",
      "/tmp/goal.txt",
    ]);
    assert.deepStrictEqual([...PROMPT_API_ARGS], ["api", "prompt"]);
    assert.strictEqual(PROMPT_FOCUS, "design");
  });
});

suite("buildExtractArgs", () => {
  test("uses api extract with --root, focus, --input selectors, and --goal-file", () => {
    const args = buildExtractArgs("/proj", "/tmp/sel.txt", "/tmp/goal.txt", "design");
    assert.deepStrictEqual(args, [
      "api",
      "extract",
      "--root",
      "/proj",
      "--focus",
      "design",
      "--input",
      "/tmp/sel.txt",
      "--goal-file",
      "/tmp/goal.txt",
    ]);
    assert.deepStrictEqual([...EXTRACT_API_ARGS], ["api", "extract"]);
  });
});

suite("goalTextForWire", () => {
  test("uses placeholder only when blank", () => {
    assert.strictEqual(goalTextForWire(""), BLANK_GOAL_WIRE_PLACEHOLDER);
    assert.strictEqual(goalTextForWire("   "), BLANK_GOAL_WIRE_PLACEHOLDER);
    assert.strictEqual(goalTextForWire("real goal"), "real goal");
  });
});

suite("canStartBadgerExecutable", () => {
  test("returns false only when the process cannot be started", async () => {
    const available = await canStartBadgerExecutable(
      STUB_EXECUTABLE,
      async (executable, args) => {
        assert.strictEqual(executable, STUB_EXECUTABLE);
        assert.deepStrictEqual(args, ["--version"]);
        return {
          exitCode: 0,
          stdout: "badger v0.2.8\n",
          stderr: "",
        };
      }
    );
    const unavailable = await canStartBadgerExecutable(
      STUB_EXECUTABLE,
      async () => ({
        error: { code: "ENOENT", message: "not found" },
      })
    );

    assert.strictEqual(available, true);
    assert.strictEqual(unavailable, false);
  });

  test("treats any started process as present regardless of exit code", async () => {
    const available = await canStartBadgerExecutable(
      STUB_EXECUTABLE,
      async () => ({
        exitCode: 2,
        stdout: "",
        stderr: "unknown flag: --version",
      })
    );

    assert.strictEqual(available, true);
  });
});

suite("resolveBadgerExecutable", () => {
  test("defaults to badger on PATH", () => {
    assert.strictEqual(
      resolveBadgerExecutable(() => undefined, {}),
      DEFAULT_EXECUTABLE
    );
    assert.strictEqual(DEFAULT_EXECUTABLE, "badger");
  });

  test("prefers env over setting", () => {
    const exe = resolveBadgerExecutable(
      (key) =>
        key === EXECUTABLE_PATH_SETTING ? "/from/setting/badger" : undefined,
      { [EXECUTABLE_ENV]: "/from/env/badger" }
    );
    assert.strictEqual(exe, "/from/env/badger");
  });

  test("uses setting when env is unset", () => {
    const exe = resolveBadgerExecutable(
      (key) =>
        key === EXECUTABLE_PATH_SETTING ? "/configured/badger" : undefined,
      {}
    );
    assert.strictEqual(exe, "/configured/badger");
  });

  test("trims whitespace and ignores empty overrides", () => {
    assert.strictEqual(
      resolveBadgerExecutable(() => "  ", { [EXECUTABLE_ENV]: "  " }),
      DEFAULT_EXECUTABLE
    );
  });
});

suite("createBadgerCliClient against stubbed badger API", () => {
  test("writes goal, captures exact Prompt 1 stdout, cleans temp, passes --root", async () => {
    const { runProcess, calls } = createStubRunProcess();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aibadger-cli-"));
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess,
      tmpDir,
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.strictEqual(result.prompt, PROMPT1_STDOUT);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].executable, STUB_EXECUTABLE);
    const args = calls[0].args;
    assert.deepStrictEqual(args.slice(0, 2), ["api", "prompt"]);
    assertRootNoScope(args, baseRequest.projectRoot, baseRequest.scope);
    assert.deepStrictEqual(args.slice(args.indexOf("--focus"), args.indexOf("--focus") + 2), [
      "--focus",
      "design",
    ]);
    assert.strictEqual(args[args.indexOf("--input")], "--input");
    const goalPath = args[args.indexOf("--input") + 1];
    assert.ok(goalPath.startsWith(tmpDir));
    assert.ok(
      /aibadger-goal-\d+-[0-9a-f]+\.txt$/.test(path.basename(goalPath))
    );

    await assert.rejects(() => fs.access(goalPath), /ENOENT/);
    assert.deepStrictEqual(await fs.readdir(tmpDir), []);
    await fs.rmdir(tmpDir);
  });

  test("multiline goal is transported via the input file", async () => {
    const multiline = "Line one.\nLine two.\n\nLine four.";
    let writtenGoal = "";
    const runProcess: RunProcess = async (_exe, args) => {
      const goalPath = args[args.indexOf("--input") + 1];
      writtenGoal = await fs.readFile(goalPath, "utf8");
      return {
        exitCode: 0,
        stdout: PROMPT1_STDOUT,
        stderr: "",
      };
    };

    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess,
    });

    const result = await client.generatePrompt({
      projectRoot: baseRequest.projectRoot,
      request: multiline,
      focus: "design",
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(writtenGoal, multiline);
  });

  test("blank goal uses wire placeholder in the goal file", async () => {
    let writtenGoal = "";
    const runProcess: RunProcess = async (_exe, args) => {
      writtenGoal = await fs.readFile(args[args.indexOf("--input") + 1], "utf8");
      return { exitCode: 0, stdout: PROMPT1_STDOUT, stderr: "" };
    };
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess,
    });

    const result = await client.generatePrompt({
      projectRoot: baseRequest.projectRoot,
      request: "   \n\t  ",
      focus: "design",
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(writtenGoal, BLANK_GOAL_WIRE_PLACEHOLDER);
    // Still uses api prompt, not topology.
    // (runProcess sees full args via the written file path check above)
  });

  test("missing input style failure maps to generationFailed", async () => {
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "Error: reading api input file: open /tmp/gone.txt: no such file\n",
      }),
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.kind, "generationFailed");
    assert.ok(result.message.includes("exit 1"));
    assert.ok(result.message.includes("reading api input file"));
    assert.ok(!result.message.includes(baseRequest.request));
  });

  test("development-only input flag failure maps to unsupportedApi", async () => {
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => ({
        exitCode: 1,
        stdout: "",
        stderr:
          "Error: the following flags are only available in development builds: --input\n",
      }),
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.kind, "unsupportedApi");
    assert.ok(result.message.includes("does not support the required API"));
  });

  test("unavailable executable maps to executableUnavailable", async () => {
    const client = createBadgerCliClient({
      executable: path.join(
        path.sep,
        "nonexistent",
        "aibadger-missing-cli-xyz"
      ),
      // Real spawn so ENOENT is observed.
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.kind, "executableUnavailable");
    assert.ok(result.message.toLowerCase().includes("not found"));
  });

  test("empty stdout on exit 0 is malformedResult", async () => {
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => ({
        exitCode: 0,
        stdout: "  \n\t  ",
        stderr: "",
      }),
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.kind, "malformedResult");
    assert.ok(result.message.toLowerCase().includes("empty"));
  });

  test("unsupported API style stderr maps to unsupportedApi", async () => {
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "Error: unknown api operation: promptx\n",
      }),
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.kind, "unsupportedApi");
    assert.ok(result.message.toLowerCase().includes("does not support"));
  });

  test("temp goal file is deleted even when process fails", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aibadger-cli-fail-"));
    let goalPath = "";
    const runProcess: RunProcess = async (_exe, args) => {
      goalPath = args[args.indexOf("--input") + 1];
      await fs.access(goalPath);
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Error: boom\n",
      } satisfies RunProcessResult;
    };

    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess,
      tmpDir,
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, false);
    assert.ok(goalPath);
    await assert.rejects(() => fs.access(goalPath), /ENOENT/);
    assert.deepStrictEqual(await fs.readdir(tmpDir), []);
    await fs.rmdir(tmpDir);
  });

  test("a thrown process runner becomes a safe failure and still cleans temp", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aibadger-throw-"));
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      tmpDir,
      runProcess: async () => {
        throw new Error("runner exploded");
      },
    });

    const result = await client.generatePrompt(baseRequest);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.kind, "generationFailed");
      assert.ok(result.message.includes("Could not run Badger"));
      assert.ok(result.message.includes("runner exploded"));
    }
    assert.deepStrictEqual(await fs.readdir(tmpDir), []);
    await fs.rmdir(tmpDir);
  });

  test("cleanup failures do not mask a successful operation", async () => {
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => ({
        exitCode: 0,
        stdout: PROMPT1_STDOUT,
        stderr: "",
      }),
      tempFiles: {
        writeFile: async () => undefined,
        unlink: async () => {
          throw new Error("cleanup failed");
        },
      },
    });

    const result = await client.generatePrompt(baseRequest);
    assert.strictEqual(result.ok, true);
  });

  test("argv includes projectRoot as --root but never relative scope", async () => {
    let args: string[] = [];
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async (_e, a) => {
        args = [...a];
        return { exitCode: 0, stdout: PROMPT1_STDOUT, stderr: "" };
      },
    });

    await client.generatePrompt({
      projectRoot: "/secret/root",
      scope: "secret/scope",
      request: "goal text",
      focus: "design",
    });

    assertRootNoScope(args, "/secret/root", "secret/scope");
    assert.ok(!args.includes("secret/scope"));
  });
});

suite("createBadgerCliClient extractPrompt against stubbed badger API", () => {
  const extractRequest: ExtractRequest = {
    projectRoot: baseRequest.projectRoot,
    scope: "internal/greeting",
    request: "Explain how greeting works.",
    selectors: "FILE:README.md\nPREFIX:cmd/demo/main.go#func main",
    focus: "design",
  };

  test("transports selectors + goal, captures Prompt 2, cleans both temps", async () => {
    let writtenSelectors = "";
    let writtenGoal = "";
    const { runProcess, calls } = createStubRunProcess();
    const wrapping: RunProcess = async (exe, args) => {
      const inputIdx = args.indexOf("--input");
      const goalIdx = args.indexOf("--goal-file");
      writtenSelectors = await fs.readFile(args[inputIdx + 1], "utf8");
      writtenGoal = await fs.readFile(args[goalIdx + 1], "utf8");
      return runProcess(exe, args);
    };

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aibadger-ext-"));
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: wrapping,
      tmpDir,
    });

    const result = await client.extractPrompt(extractRequest);
    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.strictEqual(writtenSelectors, extractRequest.selectors);
    assert.strictEqual(writtenGoal, extractRequest.request);
    assert.strictEqual(result.prompt, PROMPT2_STDOUT);

    assert.strictEqual(calls.length, 1);
    const args = calls[0].args;
    assert.deepStrictEqual(args.slice(0, 2), ["api", "extract"]);
    assertRootNoScope(args, extractRequest.projectRoot, extractRequest.scope);
    assert.deepStrictEqual(args.slice(args.indexOf("--focus"), args.indexOf("--focus") + 2), [
      "--focus",
      "design",
    ]);
    assert.strictEqual(args[args.indexOf("--input")], "--input");
    assert.strictEqual(args[args.indexOf("--goal-file")], "--goal-file");

    assert.deepStrictEqual(await fs.readdir(tmpDir), []);
    await fs.rmdir(tmpDir);
  });

  test("extract failure cleans temps and maps to generationFailed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aibadger-extf-"));
    let selectorPath = "";
    let goalPath = "";
    const runProcess: RunProcess = async (_e, args) => {
      selectorPath = args[args.indexOf("--input") + 1];
      goalPath = args[args.indexOf("--goal-file") + 1];
      await fs.access(selectorPath);
      await fs.access(goalPath);
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Error: no safe files could be extracted\n",
      } satisfies RunProcessResult;
    };

    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess,
      tmpDir,
    });

    const result = await client.extractPrompt({
      ...extractRequest,
      selectors: "FILE:not-found.go",
    });
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.kind, "generationFailed");
    assert.ok(!result.message.includes(extractRequest.selectors));
    assert.ok(!result.message.includes(extractRequest.request));
    await assert.rejects(() => fs.access(selectorPath), /ENOENT/);
    await assert.rejects(() => fs.access(goalPath), /ENOENT/);
    assert.deepStrictEqual(await fs.readdir(tmpDir), []);
    await fs.rmdir(tmpDir);
  });

  test("second input write failure cleans every allocated temp path", async () => {
    const writes: string[] = [];
    const unlinks: string[] = [];
    let processCalls = 0;
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => {
        processCalls += 1;
        return { exitCode: 0, stdout: PROMPT2_STDOUT, stderr: "" };
      },
      tempFiles: {
        writeFile: async (file) => {
          writes.push(file);
          if (writes.length === 2) {
            throw new Error("disk full");
          }
        },
        unlink: async (file) => {
          unlinks.push(file);
        },
      },
    });

    const result = await client.extractPrompt(extractRequest);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.kind, "generationFailed");
      assert.ok(result.message.includes("Could not prepare input"));
      assert.ok(result.message.includes("disk full"));
    }
    assert.strictEqual(processCalls, 0);
    assert.strictEqual(writes.length, 2);
    assert.deepStrictEqual(new Set(unlinks), new Set(writes));
  });

  test("empty extract stdout is malformedResult", async () => {
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => ({
        exitCode: 0,
        stdout: "\n  ",
        stderr: "",
      }),
    });
    const result = await client.extractPrompt(extractRequest);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.kind, "malformedResult");
    }
  });

  test("older CLIs without extract focus map to unsupportedApi", async () => {
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "Error: unknown api flag: --focus\n",
      }),
    });
    const result = await client.extractPrompt(extractRequest);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.kind, "unsupportedApi");
    }
  });

  test("extract argv includes --root and never relative scope", async () => {
    let args: string[] = [];
    const client = createBadgerCliClient({
      executable: STUB_EXECUTABLE,
      runProcess: async (_e, a) => {
        args = [...a];
        return { exitCode: 0, stdout: PROMPT2_STDOUT, stderr: "" };
      },
    });
    await client.extractPrompt({
      projectRoot: "/secret/root",
      scope: "secret/scope",
      request: "goal",
      selectors: "FILE:README.md",
      focus: "design",
    });
    assertRootNoScope(args, "/secret/root", "secret/scope");
  });
});
