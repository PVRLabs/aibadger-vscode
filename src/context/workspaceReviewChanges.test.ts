import * as assert from "node:assert/strict";
import {
  copyWorkspaceChangesForReview,
  WORKSPACE_REVIEW_FAILED_MESSAGE,
  WORKSPACE_REVIEW_NO_CHANGE_MESSAGE,
  WORKSPACE_REVIEW_OVERFLOW_MESSAGE,
} from "./workspaceReviewChanges";

suite("copyWorkspaceChangesForReview", () => {
  test("copies one repository-qualified aggregate payload atomically", async () => {
    const copied: string[] = [];
    const info: string[] = [];
    await copyWorkspaceChangesForReview(["/z/api", "/a/web"], {
      buildRepository: async (scope) => ({
        ok: true,
        payload: `payload for ${scope.repositoryId}`,
        changedFiles: [`${scope.repositoryId}.ts`],
        includedFiles: [],
        statuses: [],
      }),
      writeClipboard: async (text) => { copied.push(text); },
      showInformationMessage: (message) => { info.push(message); },
      showErrorMessage: assert.fail,
    });
    assert.equal(copied.length, 1);
    assert.match(copied[0], /\[REPOSITORY repo-1: web\]/);
    assert.match(copied[0], /\[REPOSITORY repo-2: api\]/);
    assert.match(info[0], /2 repositories and 2 changed files/);
  });

  test("reports a clean workspace without building or copying", async () => {
    const info: string[] = [];
    await copyWorkspaceChangesForReview([], {
      buildRepository: async () => { throw new Error("must not build"); },
      writeClipboard: async () => { throw new Error("must not copy"); },
      showInformationMessage: (message) => { info.push(message); },
      showErrorMessage: assert.fail,
    });
    assert.deepEqual(info, [WORKSPACE_REVIEW_NO_CHANGE_MESSAGE]);
  });

  test("does not copy a partial result after any repository failure", async () => {
    const copied: string[] = [];
    const errors: string[] = [];
    await copyWorkspaceChangesForReview(["/a", "/b"], {
      buildRepository: async (scope) => scope.repositoryRoot === "/a"
        ? { ok: true, payload: "a", changedFiles: ["a.ts"], includedFiles: [], statuses: [] }
        : { ok: false, reason: "git-failed" },
      writeClipboard: async (text) => { copied.push(text); },
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => { errors.push(message); },
    });
    assert.deepEqual(copied, []);
    assert.deepEqual(errors, [WORKSPACE_REVIEW_FAILED_MESSAGE]);
  });

  test("maps mandatory overflow without copying", async () => {
    const errors: string[] = [];
    await copyWorkspaceChangesForReview(["/a"], {
      buildRepository: async () => ({ ok: false, reason: "mandatory-overflow", byteLength: 300000 }),
      writeClipboard: async () => { throw new Error("must not copy"); },
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => { errors.push(message); },
    });
    assert.deepEqual(errors, [WORKSPACE_REVIEW_OVERFLOW_MESSAGE]);
  });
});
