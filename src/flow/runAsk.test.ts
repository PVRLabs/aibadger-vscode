import * as assert from "assert";
import * as path from "path";
import type {
  BadgerClient,
  ExtractRequest,
  PromptRequest,
} from "../client/types";
import {
  formatMockExtractPrompt,
  formatMockPrompt,
} from "../client/mockClient";
import type { AskWizardResult } from "./askWizard";
import type { AskWizardUiRequest } from "./runAsk";
import {
  ASK_DIALOG_TITLE,
  COPY_REQUESTED_FILES_LABEL,
  COPY_TO_CLIPBOARD_LABEL,
  HANDOFF_GUIDE_URL,
  HANDOFF_HEADLINE,
  HANDOFF_INSTRUCTION,
  HANDOFF_MESSAGE,
  HANDOFF_STEP_INDICATOR,
  DEFAULT_GOAL,
  EXECUTABLE_UNAVAILABLE_WARNING,
  PROMPT1_SUMMARY_NOTE,
  PROMPT1_SUMMARY_TITLE,
  PROMPT2_COPIED_MESSAGE,
  PROMPT_COPIED_MESSAGE,
  REQUEST_INPUT_PROMPT,
  RESOLVE_BADGER_LABEL,
  START_AGAIN_LABEL,
  STEP1_INDICATOR,
  promptCopiedOpenFailedMessage,
  promptCopiedOpenedMessage,
} from "./messages";
import { CHAT_PROVIDERS, providerById } from "./providers";
import { runAsk, type RunAskDeps, type RunAskUi } from "./runAsk";
import { appendTaggedFileReferences } from "./runAsk";
import { hasSelectorLikeContent } from "./selectors";
import type { ResolveScopeDeps, WorkspaceFolderRef } from "../scope/types";

const rootA = path.join(path.sep, "ws", "alpha");
const rootB = path.join(path.sep, "ws", "beta");
const folderA: WorkspaceFolderRef = { name: "alpha", fsPath: rootA };
const folderB: WorkspaceFolderRef = { name: "beta", fsPath: rootB };

type WizardBehavior = {
  /** Goal submitted on step 1; undefined = cancel before prepare. */
  goal?: string;
  /**
   * After prepare succeeds: AI response for step 2.
   * undefined = cancel on step 2; string = submit if selector-like.
   */
  aiResponse?: string | undefined;
  /** Step 1 dropdown: copy + open this provider id. */
  openProviderId?: string;
  /** Simulate Start again then cancel (second prepare with same goal). */
  startAgainOnce?: boolean;
  custom?: (
    options: AskWizardUiRequest
  ) => Promise<AskWizardResult | undefined>;
};

type Harness = {
  deps: RunAskDeps;
  clientCalls: PromptRequest[];
  extractCalls: ExtractRequest[];
  clipboard: string[];
  infos: string[];
  errors: string[];
  openedUrls: string[];
  lastProviderId: string | undefined;
  wizardOpened: number;
  lastWizard: AskWizardUiRequest | undefined;
  /** Summary lines from the last successful prepare (Step 2 orientation). */
  lastPrepareSummaryLines: string[] | undefined;
  setWizard: (behavior: WizardBehavior) => void;
  setOpenExternalResult: (ok: boolean) => void;
};

function createHarness(options: {
  folders?: readonly WorkspaceFolderRef[];
  pick?: (
    folders: readonly WorkspaceFolderRef[]
  ) => Promise<WorkspaceFolderRef | undefined>;
  client?: BadgerClient;
}): Harness {
  const folders = options.folders ?? [folderA];
  const clientCalls: PromptRequest[] = [];
  const extractCalls: ExtractRequest[] = [];
  const clipboard: string[] = [];
  const infos: string[] = [];
  const errors: string[] = [];
  const openedUrls: string[] = [];
  let lastProviderId: string | undefined;
  let openExternalOk = true;
  let wizardOpened = 0;
  let lastWizard: AskWizardUiRequest | undefined;
  let lastPrepareSummaryLines: string[] | undefined;
  let behavior: WizardBehavior = {
    goal: "Explain the scanner.",
    aiResponse: undefined,
  };

  const scope: ResolveScopeDeps = {
    getWorkspaceFolders: () => folders,
    getWorkspaceFolderForPath: (resourcePath: string) => {
      const resolved = path.resolve(resourcePath);
      return folders.find((f) => {
        const root = path.resolve(f.fsPath);
        const rel = path.relative(root, resolved);
        return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
      });
    },
    pickWorkspaceFolder:
      options.pick ??
      (async () => {
        throw new Error("pickWorkspaceFolder should not be called");
      }),
  };

  async function runDefaultWizard(
    req: AskWizardUiRequest
  ): Promise<AskWizardResult | undefined> {
    // undefined = cancel before prepare; "" = blank goal (→ DEFAULT_GOAL) is OK.
    if (behavior.goal === undefined) {
      return undefined;
    }

    const goal = behavior.goal.trim();
    const prepareResult = await req.onPreparePrompt(
      goal,
      behavior.openProviderId
        ? { openProviderId: behavior.openProviderId }
        : undefined
    );
    if (!prepareResult.ok) {
      errors.push(prepareResult.message);
      return undefined;
    }
    // Capture last prepare summary for assertions (not full prompt).
    lastPrepareSummaryLines = prepareResult.summaryLines
      ? [...prepareResult.summaryLines]
      : undefined;

    if (behavior.aiResponse === undefined) {
      return undefined;
    }
    if (behavior.aiResponse.trim() === "") {
      return undefined;
    }

    // Mirror UI gate: copy button only when selector-like content exists.
    if (!hasSelectorLikeContent(behavior.aiResponse)) {
      return undefined;
    }

    const selError = req.validateSelectors(behavior.aiResponse);
    if (selError) {
      errors.push(selError);
      return undefined;
    }

    const copyError = await req.onCopyRequestedFiles(
      goal,
      behavior.aiResponse
    );
    if (copyError) {
      errors.push(copyError);
      return undefined;
    }

    if (behavior.startAgainOnce) {
      // Start again: keep goal, prepare again, then leave (cancel step 2).
      const again = await req.onPreparePrompt(behavior.goal.trim());
      if (!again.ok) {
        errors.push(again.message);
      } else {
        lastPrepareSummaryLines = again.summaryLines
          ? [...again.summaryLines]
          : undefined;
      }
      return { completedCopy: true };
    }

    return { completedCopy: true };
  }

  const ui: RunAskUi = {
    showAskWizard: async (req) => {
      wizardOpened += 1;
      lastWizard = req;
      if (behavior.custom) {
        return behavior.custom(req);
      }
      return runDefaultWizard(req);
    },
    writeClipboard: async (text) => {
      clipboard.push(text);
    },
    showInformationMessage: (message) => {
      infos.push(message);
    },
    showErrorMessage: (message) => {
      errors.push(message);
    },
    openExternal: async (url) => {
      openedUrls.push(url);
      return openExternalOk;
    },
    getLastChatProviderId: () => lastProviderId,
    setLastChatProviderId: (id) => {
      lastProviderId = id;
    },
  };

  const defaultClient: BadgerClient = {
    async generatePrompt(request) {
      clientCalls.push(request);
      return { ok: true, prompt: formatMockPrompt(request) };
    },
    async extractPrompt(request) {
      extractCalls.push(request);
      return { ok: true, prompt: formatMockExtractPrompt(request) };
    },
  };

  return {
    deps: {
      scope,
      ui,
      client: options.client ?? defaultClient,
    },
    clientCalls,
    extractCalls,
    clipboard,
    infos,
    errors,
    openedUrls,
    get lastProviderId() {
      return lastProviderId;
    },
    get wizardOpened() {
      return wizardOpened;
    },
    get lastWizard() {
      return lastWizard;
    },
    get lastPrepareSummaryLines() {
      return lastPrepareSummaryLines;
    },
    setWizard(b) {
      behavior = b;
    },
    setOpenExternalResult(ok) {
      openExternalOk = ok;
    },
  };
}

suite("runAsk shared request flow (unified wizard)", () => {
  test("project entry: one wizard, normalized request, clipboard, toast", async () => {
    const h = createHarness({});
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.wizardOpened, 1);
    assert.ok(h.lastWizard);
    assert.deepStrictEqual(h.clientCalls, [
      {
        projectRoot: rootA,
        request: "Explain the scanner.",
        focus: "design",
      },
    ]);
    assert.strictEqual(h.clipboard.length, 1);
    assert.strictEqual(
      h.clipboard[0],
      formatMockPrompt(h.clientCalls[0])
    );
    assert.deepStrictEqual(h.infos, [PROMPT_COPIED_MESSAGE]);
    assert.deepStrictEqual(h.extractCalls, []);
  });

  test("successful prepare includes topology summary lines (not full prompt)", async () => {
    const h = createHarness({});
    await runAsk({ kind: "project" }, h.deps);

    assert.ok(h.lastPrepareSummaryLines);
    assert.ok(h.lastPrepareSummaryLines!.length > 0);
    const joined = h.lastPrepareSummaryLines!.join("\n");
    assert.ok(joined.includes("Languages:"));
    assert.ok(joined.includes("package"));
    assert.ok(joined.includes("in tree"));
    assert.ok(joined.includes("payload"));
    assert.ok(joined.includes("Project: alpha"));
    // Privacy: full prompt body and task text must not appear in summary lines.
    assert.ok(!joined.includes("[TASK]"));
    assert.ok(!joined.includes("Explain the scanner."));
    assert.ok(!joined.includes(h.clipboard[0]));
    assert.strictEqual(PROMPT1_SUMMARY_TITLE, "Topology only");
    assert.strictEqual(PROMPT1_SUMMARY_NOTE, "No source files included");
  });

  test("scoped prepare includes scope in summary", async () => {
    const h = createHarness({});
    const folderPath = path.join(rootA, "internal", "scanner");
    await runAsk(
      { kind: "folder", resourcePath: folderPath },
      h.deps
    );
    assert.ok(h.lastPrepareSummaryLines);
    const joined = h.lastPrepareSummaryLines!.join("\n");
    assert.ok(joined.includes("Scope: internal/scanner"));
  });

  test("folder entry passes scope through preparePrompt", async () => {
    const h = createHarness({});
    const folderPath = path.join(rootA, "internal", "scanner");
    await runAsk(
      { kind: "folder", resourcePath: folderPath },
      h.deps
    );

    assert.deepStrictEqual(h.clientCalls, [
      {
        projectRoot: rootA,
        scope: "internal/scanner",
        request: "Explain the scanner.",
        focus: "design",
      },
    ]);
  });

  test("file entry passes file scope through preparePrompt", async () => {
    const h = createHarness({});
    const filePath = path.join(rootA, "cmd", "main.go");
    await runAsk({ kind: "file", resourcePath: filePath }, h.deps);

    assert.deepStrictEqual(h.clientCalls, [
      {
        projectRoot: rootA,
        scope: "cmd/main.go",
        request: "Explain the scanner.",
        focus: "design",
      },
    ]);
  });

  test("selected files become quoted tagged references in the CLI goal", async () => {
    const h = createHarness({});
    const first = path.join(rootA, "src", "main file.ts");
    const second = path.join(rootA, "src", "types.ts");
    await runAsk(
      {
        kind: "file",
        resourcePath: first,
        selectedResourcePaths: [first, second, first],
      },
      h.deps
    );

    assert.deepStrictEqual(h.clientCalls, [
      {
        projectRoot: rootA,
        request:
          'Explain the scanner.\n\n@"src/main file.ts"\n@"src/types.ts"',
        focus: "design",
      },
    ]);
  });

  test("selected files from different workspace roots are rejected", async () => {
    const h = createHarness({ folders: [folderA, folderB] });
    const first = path.join(rootA, "a.ts");
    const second = path.join(rootB, "b.ts");
    await runAsk(
      {
        kind: "file",
        resourcePath: first,
        selectedResourcePaths: [first, second],
      },
      h.deps
    );
    assert.deepStrictEqual(h.clientCalls, []);
    assert.deepStrictEqual(h.errors, [
      "Selected files must belong to the same workspace folder.",
    ]);
  });

  test("tagged reference encoding quotes spaces and escapes quotes", () => {
    assert.strictEqual(
      appendTaggedFileReferences("Goal", [
        "src/a.ts",
        'docs/plan "draft".md',
      ]),
      'Goal\n\n@"src/a.ts"\n@"docs/plan \\"draft\\".md"'
    );
  });

  test("step 1 cancel: no client, clipboard, or toast", async () => {
    const h = createHarness({});
    h.setWizard({ goal: undefined });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.wizardOpened, 1);
    assert.deepStrictEqual(h.clientCalls, []);
    assert.deepStrictEqual(h.extractCalls, []);
    assert.deepStrictEqual(h.clipboard, []);
  });

  test("shows early warning and forwards its recovery action", async () => {
    const h = createHarness({});
    let availabilityChecks = 0;
    let recoveryCalls = 0;
    h.deps.executableRecovery = {
      async isExecutableAvailable() {
        availabilityChecks += 1;
        return false;
      },
      async openRecovery() {
        recoveryCalls += 1;
        return true;
      },
    };
    h.setWizard({ goal: undefined });

    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(availabilityChecks, 1);
    assert.strictEqual(h.lastWizard?.executableUnavailable, true);
    assert.strictEqual(
      EXECUTABLE_UNAVAILABLE_WARNING,
      "Badger isn’t available. Install Badger or choose a local executable before generating your prompt."
    );
    assert.strictEqual(RESOLVE_BADGER_LABEL, "Fix issue");
    assert.strictEqual(
      await h.lastWizard?.onOpenExecutableRecovery?.(),
      true
    );
    assert.strictEqual(recoveryCalls, 1);
  });

  test("availability check failure leaves Copy-time recovery authoritative", async () => {
    const h = createHarness({});
    h.deps.executableRecovery = {
      async isExecutableAvailable() {
        throw new Error("preflight failed");
      },
      async openRecovery() {
        return false;
      },
    };
    h.setWizard({ goal: undefined });

    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.lastWizard?.executableUnavailable, false);
  });

  test("blank goal uses the neutral exploration task and design focus", async () => {
    const h = createHarness({});
    h.setWizard({ goal: "", aiResponse: undefined });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(
      DEFAULT_GOAL,
      "Explore this project, summarize the relevant design and behavior, and identify the most useful next steps."
    );
    assert.strictEqual(h.clientCalls.length, 1);
    assert.strictEqual(h.clientCalls[0].request, DEFAULT_GOAL);
    assert.strictEqual(h.clientCalls[0].focus, "design");
    assert.strictEqual(h.clipboard.length, 1);
    assert.ok(h.clipboard[0].includes(DEFAULT_GOAL));
    assert.deepStrictEqual(h.extractCalls, []);
  });

  test("whitespace-only goal also uses neutral exploration", async () => {
    const h = createHarness({});
    h.setWizard({ goal: "   \n\t  ", aiResponse: undefined });
    await runAsk({ kind: "project" }, h.deps);
    assert.strictEqual(h.clientCalls[0].request, DEFAULT_GOAL);
  });

  test("multi-root project picker cancel is silent (wizard never opens)", async () => {
    const h = createHarness({
      folders: [folderA, folderB],
      pick: async () => undefined,
    });
    await runAsk({ kind: "project" }, h.deps);
    assert.strictEqual(h.wizardOpened, 0);
  });

  test("prepare failure stays without clipboard", async () => {
    const h = createHarness({});
    h.deps.client = {
      async generatePrompt() {
        return {
          ok: false,
          kind: "generationFailed",
          message: "mock generation failed",
        };
      },
      async extractPrompt() {
        throw new Error("extract should not run");
      },
    };
    await runAsk({ kind: "project" }, h.deps);
    assert.deepStrictEqual(h.clipboard, []);
    assert.ok(h.errors.some((e) => e.includes("mock generation failed")));
  });

  test("Prompt 1 keeps an unsupported-API diagnostic visible", async () => {
    const h = createHarness({});
    const diagnostic =
      "Installed Badger does not support the required API. Error: the following flags are only available in development builds: --input";
    h.deps.client = {
      async generatePrompt() {
        return { ok: false, kind: "unsupportedApi", message: diagnostic };
      },
      async extractPrompt() {
        throw new Error("extract should not run");
      },
    };

    await runAsk({ kind: "project" }, h.deps);

    assert.deepStrictEqual(h.errors, [`Badger CLI: ${diagnostic}`]);
  });
});

suite("runAsk step 2 copy-requested-files + done panel", () => {
  test("product labels: Copy requested files and Start again", () => {
    assert.strictEqual(COPY_REQUESTED_FILES_LABEL, "Copy requested files");
    assert.strictEqual(START_AGAIN_LABEL, "Start again");
    assert.strictEqual(
      PROMPT2_COPIED_MESSAGE,
      "Final handoff prompt copied. Paste it into the same AI chat to complete the handoff and continue the conversation."
    );
  });

  test("wizard contracts include step-1 copy split and paste-back actions", async () => {
    const h = createHarness({});
    await runAsk({ kind: "project" }, h.deps);
    assert.ok(h.lastWizard);
    assert.strictEqual(typeof h.lastWizard!.onPreparePrompt, "function");
    assert.strictEqual(typeof h.lastWizard!.validateSelectors, "function");
    assert.strictEqual(typeof h.lastWizard!.onCopyRequestedFiles, "function");
    assert.strictEqual(typeof h.lastWizard!.onOpenHandoffGuide, "function");
    await h.lastWizard!.onOpenHandoffGuide!();
    assert.deepStrictEqual(h.openedUrls, [HANDOFF_GUIDE_URL]);
    assert.ok(h.lastWizard!.chatProviders);
    assert.strictEqual(h.lastWizard!.chatProviders!.length, CHAT_PROVIDERS.length);
    assert.strictEqual(COPY_TO_CLIPBOARD_LABEL, "Copy to Clipboard");
    assert.strictEqual(ASK_DIALOG_TITLE, "AI Badger");
    assert.strictEqual(STEP1_INDICATOR, "Step 1 of 2");
    assert.strictEqual(HANDOFF_STEP_INDICATOR, "Step 2 of 2");
    assert.strictEqual(REQUEST_INPUT_PROMPT, "What do you want help with?");
    assert.strictEqual(HANDOFF_HEADLINE, "Prompt copied to clipboard.");
    assert.ok(HANDOFF_INSTRUCTION.includes("Paste it into an AI chat"));
    assert.ok(HANDOFF_INSTRUCTION.includes("ask for specific files"));
    assert.ok(HANDOFF_MESSAGE.includes("paste the AI"));
  });

  test("copy button gate: prose without FILE: does not extract", async () => {
    const h = createHarness({});
    h.setWizard({
      goal: "Explain the scanner.",
      aiResponse: "You should look at the scanner package.",
    });
    await runAsk({ kind: "project" }, h.deps);
    assert.strictEqual(hasSelectorLikeContent("You should look at the scanner package."), false);
    assert.deepStrictEqual(h.extractCalls, []);
    assert.strictEqual(h.clipboard.length, 1);
  });

  test("valid selectors copy Prompt 2 and keep success messaging", async () => {
    const h = createHarness({});
    const selectors = [
      "FILE:README.md",
      "PREFIX:cmd/demo/main.go#func main",
    ].join("\n");
    h.setWizard({
      goal: "Explain the scanner.",
      aiResponse: selectors,
    });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.extractCalls.length, 1);
    assert.strictEqual(h.extractCalls[0].focus, "design");
    assert.strictEqual(h.clipboard.length, 2);
    assert.strictEqual(
      h.clipboard[1],
      formatMockExtractPrompt(h.extractCalls[0])
    );
    assert.deepStrictEqual(h.infos, [
      PROMPT_COPIED_MESSAGE,
      PROMPT2_COPIED_MESSAGE,
    ]);
  });

  test("extract failure surfaces error and does not write Prompt 2", async () => {
    const h = createHarness({});
    h.deps.client = {
      async generatePrompt(request) {
        h.clientCalls.push(request);
        return { ok: true, prompt: formatMockPrompt(request) };
      },
      async extractPrompt(request) {
        h.extractCalls.push(request);
        return {
          ok: false,
          kind: "generationFailed",
          message: "mock extract failed",
        };
      },
    };
    h.setWizard({
      goal: "Explain the scanner.",
      aiResponse: "FILE:README.md",
    });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.extractCalls.length, 1);
    assert.strictEqual(h.clipboard.length, 1);
    assert.ok(h.errors.some((e) => e.includes("mock extract failed")));
  });

  test("Prompt 2 keeps an unsupported extract-focus diagnostic visible", async () => {
    const h = createHarness({});
    const diagnostic =
      "Installed Badger does not support the required API. Error: unknown api flag: --focus";
    h.deps.client = {
      async generatePrompt(request) {
        h.clientCalls.push(request);
        return { ok: true, prompt: formatMockPrompt(request) };
      },
      async extractPrompt(request) {
        h.extractCalls.push(request);
        return { ok: false, kind: "unsupportedApi", message: diagnostic };
      },
    };
    h.setWizard({
      goal: "Explain the scanner.",
      aiResponse: "FILE:README.md",
    });

    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.clipboard.length, 1);
    assert.deepStrictEqual(h.errors, [`Badger CLI: ${diagnostic}`]);
  });

  test("invalid selectors rejected before extract", async () => {
    const h = createHarness({});
    h.setWizard({
      goal: "g",
      aiResponse: "FILE:ok.go\nNOTASELECTOR:x",
    });
    await runAsk({ kind: "project" }, h.deps);
    assert.deepStrictEqual(h.extractCalls, []);
    assert.ok(h.errors.some((e) => /Line 2|unknown/i.test(e)));
  });

  test("Start again re-prepares Prompt 1 with the same goal", async () => {
    const h = createHarness({});
    h.setWizard({
      goal: "Explain the scanner.",
      aiResponse: "FILE:README.md",
      startAgainOnce: true,
    });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.clientCalls.length, 2);
    assert.strictEqual(h.clientCalls[0].request, "Explain the scanner.");
    assert.strictEqual(h.clientCalls[1].request, "Explain the scanner.");
    assert.strictEqual(h.extractCalls.length, 1);
    // Prompt 1, Prompt 2, then Prompt 1 again after start again
    assert.strictEqual(h.clipboard.length, 3);
  });

  test("scope is passed through extract on folder entry", async () => {
    const h = createHarness({});
    h.setWizard({
      goal: "help",
      aiResponse: "FILE:README.md",
    });
    await runAsk(
      {
        kind: "folder",
        resourcePath: path.join(rootA, "docs"),
      },
      h.deps
    );
    assert.strictEqual(h.extractCalls[0].scope, "docs");
  });
});

suite("runAsk Step 1 copy / copy-and-open", () => {
  test("primary copy generates Prompt 1 without opening a browser", async () => {
    const h = createHarness({});
    h.setWizard({
      goal: "Explain the scanner.",
      aiResponse: undefined,
    });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.clipboard.length, 1);
    assert.deepStrictEqual(h.openedUrls, []);
    assert.deepStrictEqual(h.infos, [PROMPT_COPIED_MESSAGE]);
  });

  test("copy and open uses landing url only and remembers provider", async () => {
    const h = createHarness({});
    const chatgpt = providerById("chatgpt")!;
    h.setWizard({
      goal: "Explain the scanner.",
      openProviderId: "chatgpt",
      aiResponse: undefined,
    });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.clipboard.length, 1);
    assert.deepStrictEqual(h.openedUrls, [chatgpt.url]);
    assert.ok(!h.openedUrls[0].includes(h.clipboard[0]));
    assert.strictEqual(h.lastProviderId, "chatgpt");
    assert.deepStrictEqual(h.infos, [promptCopiedOpenedMessage("ChatGPT")]);
    assert.deepStrictEqual(h.extractCalls, []);
  });

  test("open failure still copies and does not remember provider", async () => {
    const h = createHarness({});
    h.setOpenExternalResult(false);
    h.setWizard({
      goal: "g",
      openProviderId: "claude",
      aiResponse: undefined,
    });
    await runAsk({ kind: "project" }, h.deps);

    assert.strictEqual(h.clipboard.length, 1);
    assert.strictEqual(h.openedUrls.length, 1);
    assert.strictEqual(h.lastProviderId, undefined);
    assert.deepStrictEqual(h.infos, [
      promptCopiedOpenFailedMessage("Claude"),
    ]);
  });

  test("last provider only reorders menu; primary stays Copy to Clipboard", async () => {
    const h = createHarness({});
    h.deps.ui.setLastChatProviderId("deepseek");
    h.setWizard({ goal: "g", aiResponse: undefined });
    await runAsk({ kind: "project" }, h.deps);

    assert.ok(h.lastWizard?.chatProviders);
    assert.strictEqual(h.lastWizard!.chatProviders![0].id, "deepseek");
    assert.strictEqual(COPY_TO_CLIPBOARD_LABEL, "Copy to Clipboard");
    assert.deepStrictEqual(h.openedUrls, []);
  });

  test("Prompt 2 success never opens a provider", async () => {
    const h = createHarness({});
    h.setWizard({
      goal: "Explain the scanner.",
      aiResponse: "FILE:README.md",
    });
    await runAsk({ kind: "project" }, h.deps);
    assert.deepStrictEqual(h.openedUrls, []);
    assert.ok(
      h.infos.includes(PROMPT2_COPIED_MESSAGE),
      "done messaging stays continue-same-chat"
    );
  });
});
