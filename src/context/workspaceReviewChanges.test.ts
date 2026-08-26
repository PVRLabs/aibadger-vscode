import * as assert from "node:assert/strict";
import {
  copyWorkspaceChangesForReview,
  WORKSPACE_REVIEW_COPY_FAILURE_MESSAGE,
  WORKSPACE_REVIEW_FAILED_MESSAGE,
  WORKSPACE_REVIEW_NO_CHANGE_MESSAGE,
  WORKSPACE_REVIEW_OVERFLOW_MESSAGE,
} from "./workspaceReviewChanges";
import { repositoryLabel } from "../review/reviewPayload";

suite("copyWorkspaceChangesForReview", () => {
  test("keeps one outer task and scopes each repository section under its marker", async () => {
    const copied: string[] = [];
    await copyWorkspaceChangesForReview(["/work/web", "/work/api"], {
      buildRepository: async (scope) => ({
        ok: true,
        payload: [
          `[REPOSITORY: ${repositoryLabel(scope.repositoryRoot)}]`,
          "[REVIEW CONTEXT: SELECTED GIT DIFF]",
          `diff for ${scope.repositoryId}`,
          "[CONTEXT]",
          `complete file for ${scope.repositoryId}`,
          "[FILE CONTEXT STATUS]",
          `status for ${scope.repositoryId}`,
        ].join("\n"),
        changedFiles: [`${scope.repositoryId}.ts`],
        includedFiles: [],
        statuses: [],
      }),
      writeClipboard: async (text) => { copied.push(text); },
      showInformationMessage: () => undefined,
      showErrorMessage: assert.fail,
    });
    assert.equal(copied.length, 1);
    assert.equal((copied[0].match(/\[TASK\]/g) ?? []).length, 1);
    assert.equal((copied[0].match(/\[REPOSITORY: (?:web|api)\]/g) ?? []).length, 2);
    assert.match(copied[0], /\[REPOSITORY: api\][\s\S]*diff for repo-1[\s\S]*status for repo-1/);
    assert.match(copied[0], /\[REPOSITORY: web\][\s\S]*diff for repo-2[\s\S]*status for repo-2/);
  });

  test("copies one marked aggregate payload atomically", async () => {
    const copied: string[] = [];
    const info: string[] = [];
    await copyWorkspaceChangesForReview(["/z/api", "/a/web"], {
      buildRepository: async (scope) => ({
        ok: true,
        payload: `[REPOSITORY: ${repositoryLabel(scope.repositoryRoot)}]\npayload for ${scope.repositoryId}`,
        changedFiles: [`${scope.repositoryId}.ts`],
        includedFiles: [],
        statuses: [],
      }),
      writeClipboard: async (text) => { copied.push(text); },
      showInformationMessage: (message) => { info.push(message); },
      showErrorMessage: assert.fail,
    });
    assert.equal(copied.length, 1);
    assert.match(copied[0], /\[REPOSITORY: web\]/);
    assert.match(copied[0], /\[REPOSITORY: api\]/);
    assert.match(info[0], /2 repositories and 2 changed files/);
  });

  test("keeps duplicate repository names and colliding relative paths distinct", async () => {
    const copied: string[] = [];
    await copyWorkspaceChangesForReview(["/work/one/api", "/work/two/api"], {
      buildRepository: async (scope) => ({
        ok: true,
        payload: `[REPOSITORY: ${repositoryLabel(scope.repositoryRoot)}]\n[REVIEW CONTEXT: SELECTED GIT DIFF]\n--- a/src/index.ts\n+++ b/src/index.ts\n+${scope.repositoryId}\n`,
        changedFiles: ["src/index.ts"],
        includedFiles: [],
        statuses: [],
      }),
      writeClipboard: async (text) => { copied.push(text); },
      showInformationMessage: () => undefined,
      showErrorMessage: assert.fail,
    });

    assert.equal(copied.length, 1);
    assert.equal((copied[0].match(/\[REPOSITORY: api\]/g) ?? []).length, 2);
    assert.match(copied[0], /\[REPOSITORY: api\][\s\S]*\+repo-1/);
    assert.match(copied[0], /\[REPOSITORY: api\][\s\S]*\+repo-2/);
    assert.equal((copied[0].match(/src\/index\.ts/g) ?? []).length, 4);
  });

  test("gives every repository the same bounded payload budget", async () => {
    const payloadSizes: number[] = [];
    await copyWorkspaceChangesForReview(["/a", "/b", "/c"], {
      buildRepository: async (_scope, deps) => {
        assert.ok(deps?.buildPayload);
        const result = await deps.buildPayload("x".repeat(80 * 1024), [], "repo");
        assert.ok(result.ok);
        payloadSizes.push(Buffer.byteLength(result.payload, "utf8"));
        return { ok: true, payload: result.payload, changedFiles: ["a.ts"], includedFiles: [], statuses: [] };
      },
      writeClipboard: async (text) => {
        assert.ok(Buffer.byteLength(text, "utf8") <= 512 * 1024);
      },
      showInformationMessage: () => undefined,
      showErrorMessage: assert.fail,
    });

    assert.equal(payloadSizes.length, 3);
    assert.equal(new Set(payloadSizes).size, 1);
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

  test("reports clipboard failure without claiming success", async () => {
    const info: string[] = [];
    const errors: string[] = [];
    await copyWorkspaceChangesForReview(["/a"], {
      buildRepository: async () => ({
        ok: true,
        payload: "complete payload",
        changedFiles: ["a.ts"],
        includedFiles: [],
        statuses: [],
      }),
      writeClipboard: async () => { throw new Error("clipboard unavailable"); },
      showInformationMessage: (message) => { info.push(message); },
      showErrorMessage: (message) => { errors.push(message); },
    });

    assert.deepEqual(info, []);
    assert.deepEqual(errors, [WORKSPACE_REVIEW_COPY_FAILURE_MESSAGE]);
  });

  test("does not copy a near-limit aggregate when section framing overflows", async () => {
    const copied: string[] = [];
    const errors: string[] = [];
    await copyWorkspaceChangesForReview(["/work/api"], {
      buildRepository: async (scope) => ({
        ok: true,
        payload: `[REPOSITORY: ${repositoryLabel(scope.repositoryRoot)}]\n${"x".repeat(512 * 1024)}`,
        changedFiles: ["api.ts"],
        includedFiles: [],
        statuses: [],
      }),
      writeClipboard: async (text) => { copied.push(text); },
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => { errors.push(message); },
    });
    assert.deepEqual(copied, []);
    assert.deepEqual(errors, [WORKSPACE_REVIEW_OVERFLOW_MESSAGE]);
  });
});
