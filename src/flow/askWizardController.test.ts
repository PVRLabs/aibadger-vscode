import * as assert from "assert";
import {
  createAskWizardController,
  type AskWizardControllerOptions,
  type AskWizardResult,
} from "./askWizardController";
import { handoffInstructionAfterOpen } from "./messages";

type HostMessage = AskWizardContract.ToHostMessage;
type WebviewMessage = AskWizardContract.ToWebviewMessage;

function createHarness(overrides: Partial<AskWizardControllerOptions> = {}) {
  const posted: WebviewMessage[] = [];
  const finished: Array<AskWizardResult | undefined> = [];
  const prepared: Array<{
    goal: string;
    openProviderId: string | undefined;
  }> = [];
  const copied: Array<{ goal: string; selectors: string }> = [];
  const options: AskWizardControllerOptions = {
    chatProviders: [{ id: "chatgpt", name: "ChatGPT" }],
    onPreparePrompt: async (goal, action) => {
      prepared.push({ goal, openProviderId: action?.openProviderId });
      return { ok: true, summaryLines: ["Go · 3 files"] };
    },
    validateSelectors: () => undefined,
    onCopyRequestedFiles: async (goal, selectors) => {
      copied.push({ goal, selectors });
      return undefined;
    },
    ...overrides,
  };
  const controller = createAskWizardController(options, {
    postMessage: (message) => posted.push(message),
    finish: (value) => finished.push(value),
  });
  const send = (message: HostMessage) => controller.handleMessage(message);
  return { controller, copied, finished, posted, prepared, send };
}

suite("AskWizardController", () => {
  test("prepares a trimmed goal and advances with provider handoff", async () => {
    const harness = createHarness();

    await harness.send({
      type: "step1Submit",
      text: "  Explain this  ",
      openProviderId: "chatgpt",
    });

    assert.deepStrictEqual(harness.prepared, [
      { goal: "Explain this", openProviderId: "chatgpt" },
    ]);
    assert.deepStrictEqual(harness.posted, [
      { type: "busy", busy: true, step: 1 },
      {
        type: "showStep2",
        handoffInstruction: handoffInstructionAfterOpen("ChatGPT"),
        summaryLines: ["Go · 3 files"],
      },
      { type: "busy", busy: false, step: 1 },
    ]);
  });

  test("can complete after initial preparation for optional-continuation flows", async () => {
    const harness = createHarness({ completeAfterPrepare: true });

    await harness.send({
      type: "step1Submit",
      text: "  Review these changes  ",
    });

    assert.deepStrictEqual(harness.posted, [
      { type: "busy", busy: true, step: 1 },
      { type: "showDone" },
      { type: "busy", busy: false, step: 1 },
    ]);
    assert.deepStrictEqual(harness.controller.resultOnDispose(), {
      completedCopy: true,
    });
  });

  test("offers optional continuation after initial review copy", async () => {
    const harness = createHarness({
      completeAfterPrepare: true,
      optionalSelectorContinuation: true,
    });

    await harness.send({ type: "step1Submit", text: "Review these changes" });

    assert.deepStrictEqual(harness.posted, [
      { type: "busy", busy: true, step: 1 },
      { type: "showStep2" },
      { type: "busy", busy: false, step: 1 },
    ]);
  });

  test("final findings finish optional continuation without a copy call", async () => {
    const harness = createHarness({ optionalSelectorContinuation: true });

    await harness.send({
      type: "step2Submit",
      text: "No concrete issues were found.",
    });

    assert.deepStrictEqual(harness.copied, []);
    assert.deepStrictEqual(harness.finished, [undefined]);
  });

  test("optional continuation rejects empty and mixed selector responses", async () => {
    const harness = createHarness({
      optionalSelectorContinuation: true,
      validateSelectors: (text) =>
        text.includes("finding") ? "Line 2: expected a selector." : undefined,
    });

    await harness.send({ type: "step2Submit", text: "   " });
    await harness.send({
      type: "step2Submit",
      text: "FILE:a.go\nfinding: possible bug",
    });

    assert.deepStrictEqual(harness.copied, []);
    assert.deepStrictEqual(harness.posted, [
      {
        type: "validationError",
        message: "Paste the AI response, or close when the review is complete.",
      },
      { type: "validationError", message: "Line 2: expected a selector." },
    ]);
  });

  test("keeps prepare failures on step 1 and always clears busy", async () => {
    const harness = createHarness({
      onPreparePrompt: async () => ({ ok: false, message: "Badger failed" }),
    });

    await harness.send({ type: "step1Submit", text: "" });

    assert.deepStrictEqual(harness.posted, [
      { type: "busy", busy: true, step: 1 },
      { type: "step1Error", message: "Badger failed" },
      { type: "busy", busy: false, step: 1 },
    ]);
  });

  test("turns thrown prepare failures into visible errors and clears busy", async () => {
    const harness = createHarness({
      onPreparePrompt: async () => {
        throw new Error("clipboard unavailable");
      },
    });

    await harness.send({ type: "step1Submit", text: "Explain this" });

    assert.deepStrictEqual(harness.posted, [
      { type: "busy", busy: true, step: 1 },
      { type: "step1Error", message: "Failed to prepare prompt. Please try again." },
      { type: "busy", busy: false, step: 1 },
    ]);
  });

  test("ignores concurrent submissions while an operation is busy", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const harness = createHarness({
      onPreparePrompt: async () => {
        calls += 1;
        await pending;
        return { ok: true };
      },
    });

    const first = harness.send({ type: "step1Submit", text: "first" });
    await harness.send({ type: "step1Submit", text: "second" });
    assert.strictEqual(calls, 1);
    release?.();
    await first;
  });

  test("validates selectors before copying requested files", async () => {
    const harness = createHarness({
      validateSelectors: () => "Line 1 is invalid",
    });

    await harness.send({ type: "step2Submit", text: "FILE:a.go" });

    assert.deepStrictEqual(harness.copied, []);
    assert.deepStrictEqual(harness.posted, [
      { type: "validationError", message: "Line 1 is invalid" },
    ]);
  });

  test("copies requested files, reports completion, and retains the goal", async () => {
    const harness = createHarness();
    await harness.send({ type: "step1Submit", text: "Explain this" });
    harness.posted.length = 0;

    await harness.send({ type: "step2Submit", text: "FILE:a.go" });
    await harness.send({ type: "startAgain" });

    assert.deepStrictEqual(harness.copied, [
      { goal: "Explain this", selectors: "FILE:a.go" },
    ]);
    assert.deepStrictEqual(harness.posted, [
      { type: "busy", busy: true, step: 2 },
      { type: "showDone" },
      { type: "busy", busy: false, step: 2 },
      { type: "showStep1", goal: "Explain this" },
    ]);
    assert.deepStrictEqual(harness.controller.resultOnDispose(), {
      completedCopy: true,
    });
  });

  test("maps executable recovery success, failure, and exceptions to status", async () => {
    const success = createHarness({
      onOpenExecutableRecovery: async () => true,
    });
    await success.send({ type: "openExecutableRecovery" });
    assert.deepStrictEqual(success.posted, [
      { type: "executableStatus", unavailable: true, busy: true },
      { type: "executableStatus", unavailable: false, busy: false },
    ]);

    const failure = createHarness({
      onOpenExecutableRecovery: async () => {
        throw new Error("dialog failed");
      },
    });
    await failure.send({ type: "openExecutableRecovery" });
    assert.deepStrictEqual(failure.posted, [
      { type: "executableStatus", unavailable: true, busy: true },
      { type: "executableStatus", unavailable: true, busy: false },
    ]);
  });

  test("finishes with a result only after a successful copy", async () => {
    const incomplete = createHarness();
    await incomplete.send({ type: "cancel" });
    assert.deepStrictEqual(incomplete.finished, [undefined]);

    const complete = createHarness();
    await complete.send({ type: "step1Submit", text: "Goal" });
    await complete.send({ type: "step2Submit", text: "FILE:a.go" });
    await complete.send({ type: "close" });
    assert.deepStrictEqual(complete.finished, [{ completedCopy: true }]);
  });
});
