import * as assert from "assert";
import {
  CHAT_PROVIDERS,
  orderProviders,
  providerById,
  toMenuItems,
} from "./providers";
import {
  COPY_TO_CLIPBOARD_LABEL,
  copyAndOpenLabel,
  DEFAULT_GOAL,
  effectiveGoal,
  HANDOFF_HEADLINE,
  HANDOFF_INSTRUCTION,
  HANDOFF_MESSAGE,
  handoffInstructionAfterOpen,
  handoffMessageAfterOpen,
  promptCopiedOpenFailedMessage,
  promptCopiedOpenedMessage,
} from "./messages";

suite("chat providers (Prompt 1 handoff only)", () => {
  test("catalog has five named landing pages and no empty urls", () => {
    assert.strictEqual(CHAT_PROVIDERS.length, 5);
    for (const p of CHAT_PROVIDERS) {
      assert.ok(p.id);
      assert.ok(p.name);
      assert.ok(p.url.startsWith("https://"));
      // Never embed prompt payload placeholders in catalog URLs.
      assert.ok(!p.url.includes("?"));
    }
  });

  test("providerById resolves known ids", () => {
    assert.strictEqual(providerById("chatgpt")?.name, "ChatGPT");
    assert.strictEqual(providerById("unknown"), undefined);
  });

  test("orderProviders keeps catalog order when no last id", () => {
    assert.deepStrictEqual(
      orderProviders(undefined).map((p) => p.id),
      CHAT_PROVIDERS.map((p) => p.id)
    );
  });

  test("orderProviders puts last-used first without dropping others", () => {
    const ordered = orderProviders("grok");
    assert.strictEqual(ordered[0].id, "grok");
    assert.strictEqual(ordered.length, CHAT_PROVIDERS.length);
    assert.deepStrictEqual(
      new Set(ordered.map((p) => p.id)),
      new Set(CHAT_PROVIDERS.map((p) => p.id))
    );
  });

  test("orderProviders ignores unknown last id", () => {
    assert.deepStrictEqual(
      orderProviders("not-a-provider").map((p) => p.id),
      CHAT_PROVIDERS.map((p) => p.id)
    );
  });

  test("menu items omit urls (host opens via openExternal)", () => {
    const items = toMenuItems(CHAT_PROVIDERS);
    assert.strictEqual(items.length, 5);
    for (const item of items) {
      assert.ok("id" in item && "name" in item);
      assert.ok(!("url" in item));
    }
  });

  test("copy labels stay provider-neutral on primary", () => {
    assert.strictEqual(COPY_TO_CLIPBOARD_LABEL, "Copy to Clipboard");
    assert.strictEqual(copyAndOpenLabel("Claude"), "Copy and Open Claude");
    assert.strictEqual(
      promptCopiedOpenedMessage("ChatGPT"),
      "Prompt copied. ChatGPT opened."
    );
    assert.strictEqual(
      promptCopiedOpenFailedMessage("Gemini"),
      "Prompt copied. Could not open Gemini."
    );
  });

  test("blank goal resolves to neutral exploration", () => {
    assert.strictEqual(
      DEFAULT_GOAL,
      "Explore this project, summarize the relevant design and behavior, and identify the most useful next steps."
    );
    assert.strictEqual(effectiveGoal(""), DEFAULT_GOAL);
    assert.strictEqual(effectiveGoal("  "), DEFAULT_GOAL);
    assert.strictEqual(effectiveGoal("Fix the scanner"), "Fix the scanner");
  });

  test("step 2 is one short instruction (no numbered list)", () => {
    assert.strictEqual(HANDOFF_HEADLINE, "Prompt copied to clipboard.");
    assert.ok(HANDOFF_INSTRUCTION.includes("Paste it into an AI chat"));
    assert.ok(HANDOFF_INSTRUCTION.includes("paste the AI"));
    assert.ok(HANDOFF_MESSAGE.startsWith(HANDOFF_HEADLINE));
    assert.strictEqual(
      handoffInstructionAfterOpen("ChatGPT"),
      "Paste it into the opened ChatGPT window, then paste the AI’s response below. The AI will ask for specific files to fully answer your question."
    );
    assert.ok(HANDOFF_INSTRUCTION.includes("ask for specific files"));
    assert.ok(!handoffInstructionAfterOpen("Claude").includes("Open an AI chat"));
    assert.ok(
      handoffMessageAfterOpen("Grok").startsWith("Prompt copied to clipboard.")
    );
  });
});
