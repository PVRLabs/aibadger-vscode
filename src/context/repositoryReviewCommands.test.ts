import * as assert from "node:assert/strict";
import {
  copyAllChangesForReview,
  REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE,
  REPOSITORY_REVIEW_NO_CHANGE_MESSAGE,
} from "./repositoryReviewCommands";

function target() {
  return {
    id: "git:/repo",
    rootUri: { fsPath: "/repo" },
  };
}

suite("repository review commands", () => {
  test("copies only the successful repository payload and reports privacy", async () => {
    const copied: string[] = [];
    const info: string[] = [];
    const errors: string[] = [];

    await copyAllChangesForReview(target(), {
      buildPayload: async () => ({
        ok: true,
        payload: "review payload",
        changedFiles: ["one.ts", "two.ts"],
        includedFiles: ["one.ts"],
        statuses: [],
      }),
      writeClipboard: async (text: string) => { copied.push(text); },
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: (message) => info.push(message),
      showErrorMessage: (message) => errors.push(message),
    });

    assert.deepEqual(copied, ["review payload"]);
    assert.equal(errors.length, 0);
    assert.match(info[0], /2 changed files/);
    assert.match(info[0], /Paste it into your AI chat to get a review\./);
    assert.match(info[0], /Nothing is shared until you paste it\./);
  });

  test("warns after copying repository review context limited by the budget", async () => {
    const copied: string[] = [];
    const warnings: string[] = [];
    const payload = "diff — context";

    await copyAllChangesForReview(target(), {
      buildPayload: async () => ({
        ok: true,
        payload,
        changedFiles: ["kept.ts", "omitted.ts", "deleted.ts"],
        includedFiles: ["kept.ts"],
        statuses: [
          { path: "omitted.ts", reason: "total review-context budget reached" },
          { path: "deleted.ts", reason: "deleted" },
        ],
      }),
      writeClipboard: async (text) => { copied.push(text); },
      showWarningMessage: (message) => {
        assert.deepEqual(copied, [payload]);
        warnings.push(message);
      },
      showInformationMessage: assert.fail,
      showErrorMessage: assert.fail,
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Copied review request with limited file context \(16 B\), ready to paste/);
    assert.match(warnings[0], /full contents for 1 file/);
    assert.match(warnings[0], /context budget limited 1 file to diffs/);
  });

  test("does not use a fallback target or write on failure", async () => {
    const copied: string[] = [];
    const errors: string[] = [];

    await copyAllChangesForReview(undefined, {
      buildPayload: async () => {
        throw new Error("must not run");
      },
      writeClipboard: async (text: string) => { copied.push(text); },
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => errors.push(message),
    });

    assert.deepEqual(copied, []);
    assert.deepEqual(errors, [REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE]);

    const copiedAfterFailure: string[] = [];
    await copyAllChangesForReview(target(), {
      buildPayload: async () => ({ ok: false, reason: "no-change" as const }),
      writeClipboard: async (text: string) => { copiedAfterFailure.push(text); },
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => errors.push(message),
    });
    assert.deepEqual(copiedAfterFailure, []);
    assert.equal(errors.at(-1), REPOSITORY_REVIEW_NO_CHANGE_MESSAGE);
  });

  test("oversized review points to Source Control selection and preserves clipboard", async () => {
    const copied: string[] = [];
    const errors: string[] = [];
    await copyAllChangesForReview(target(), {
      buildPayload: async () => ({ ok: false, reason: "mandatory-overflow", byteLength: 600000 }),
      writeClipboard: async (text) => { copied.push(text); },
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => errors.push(message),
    });
    assert.deepEqual(copied, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /too large to copy/);
    assert.match(errors[0], /Select fewer changed files in Source Control, then right-click and choose AI Badger: Copy Selected Changes for Review/);
  });
});
