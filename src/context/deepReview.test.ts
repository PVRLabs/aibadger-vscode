import { strict as assert } from "node:assert";
import { prepareDeepReviewPrompt } from "./deepReview";
import type { BadgerReviewClient } from "../client/types";

function harness(overrides: Partial<BadgerReviewClient> = {}) {
  const calls: string[] = [];
  const clipboard: string[] = [];
  const opened: string[] = [];
  const messages: string[] = [];
  const client: BadgerReviewClient = {
    async reviewContext(request) {
      calls.push(`context:${request.repositoryRoot}:${request.guidance}:${request.includeTopology}`);
      return { ok: true, prompt: "  [TASK]\nreview\n" };
    },
    async reviewContinuation() {
      calls.push("continuation");
      return { ok: true, prompt: "supplemental" };
    },
    ...overrides,
  };
  return {
    client,
    calls,
    clipboard,
    opened,
    messages,
    deps: {
      client,
      repositoryRoot: "/repo",
      writeClipboard: async (text: string) => {
        clipboard.push(text);
      },
      openExternal: async (url: string) => {
        opened.push(url);
        return true;
      },
      showInformationMessage: (message: string) => {
        messages.push(message);
      },
    },
  };
}

suite("prepareDeepReviewPrompt", () => {
  test("generates once and copies stdout verbatim", async () => {
    const h = harness();
    const result = await prepareDeepReviewPrompt("  focus on races  ", undefined, h.deps);

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(h.calls, ["context:/repo:focus on races:true"]);
    assert.deepEqual(h.clipboard, ["  [TASK]\nreview\n"]);
    assert.deepEqual(h.opened, []);
    assert.equal(h.messages[0], "AI Badger review prompt copied to clipboard.");
  });

  test("copies before opening a provider and never puts the prompt in its URL", async () => {
    const h = harness();
    const order: string[] = [];
    h.deps.writeClipboard = async (text) => {
      order.push(`copy:${text}`);
      h.clipboard.push(text);
    };
    h.deps.openExternal = async (url) => {
      order.push(`open:${url}`);
      h.opened.push(url);
      return true;
    };

    const result = await prepareDeepReviewPrompt(
      "review",
      { openProviderId: "chatgpt" },
      h.deps
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(order[0], "copy:  [TASK]\nreview\n");
    assert.equal(order[1], "open:https://chatgpt.com");
    assert.ok(!h.opened[0].includes("[TASK]"));
  });

  test("does not write the clipboard when generation fails", async () => {
    const failed = harness({
      reviewContext: async () => ({
        ok: false,
        kind: "generationFailed",
        message: "No changes to review.",
      }),
    });
    const failedResult = await prepareDeepReviewPrompt("review", undefined, failed.deps);
    assert.deepEqual(failedResult, { ok: false, message: "No changes to review." });
    assert.deepEqual(failed.clipboard, []);
    assert.deepEqual(failed.opened, []);
  });

  test("preserves clipboard atomicity when writing fails", async () => {
    const h = harness();
    h.deps.writeClipboard = async () => {
      throw new Error("clipboard unavailable");
    };
    const result = await prepareDeepReviewPrompt("review", { openProviderId: "claude" }, h.deps);

    assert.deepEqual(result, {
      ok: false,
      message: "Could not write the review prompt to the clipboard.",
    });
    assert.deepEqual(h.opened, []);
  });
});
