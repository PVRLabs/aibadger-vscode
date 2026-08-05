import * as assert from "node:assert/strict";
import {
  copyAllChangesForReview,
  REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE,
  REPOSITORY_REVIEW_NO_CHANGE_MESSAGE,
  showDeepReviewPlaceholder,
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
      showInformationMessage: (message) => info.push(message),
      showErrorMessage: (message) => errors.push(message),
    });

    assert.deepEqual(copied, ["review payload"]);
    assert.equal(errors.length, 0);
    assert.match(info[0], /2 changed files/);
    assert.match(info[0], /Nothing is shared until you paste it\./);
  });

  test("does not use a fallback target or write on failure", async () => {
    const copied: string[] = [];
    const errors: string[] = [];

    await copyAllChangesForReview(undefined, {
      buildPayload: async () => {
        throw new Error("must not run");
      },
      writeClipboard: async (text: string) => { copied.push(text); },
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => errors.push(message),
    });

    assert.deepEqual(copied, []);
    assert.deepEqual(errors, [REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE]);

    const copiedAfterFailure: string[] = [];
    await copyAllChangesForReview(target(), {
      buildPayload: async () => ({ ok: false, reason: "no-change" as const }),
      writeClipboard: async (text: string) => { copiedAfterFailure.push(text); },
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => errors.push(message),
    });
    assert.deepEqual(copiedAfterFailure, []);
    assert.equal(errors.at(-1), REPOSITORY_REVIEW_NO_CHANGE_MESSAGE);
  });

  test("Deep Review is exactly a notification with no other work", () => {
    const messages: string[] = [];
    showDeepReviewPlaceholder((message) => messages.push(message));
    assert.deepEqual(messages, ["Deep Review is not implemented yet."]);
  });
});
