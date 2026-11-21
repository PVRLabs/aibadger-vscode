import * as assert from "node:assert/strict";
import {
  copyWorkspaceChangesForReview,
  WORKSPACE_REVIEW_COPY_FAILURE_MESSAGE,
  WORKSPACE_REVIEW_FAILED_MESSAGE,
  WORKSPACE_REVIEW_NO_CHANGE_MESSAGE,
  WORKSPACE_REVIEW_OVERFLOW_MESSAGE,
} from "./workspaceReviewChanges";
import { repositoryLabel } from "../review/reviewPayload";
import { formatPayloadSize } from "../shared/formatPayloadSize";

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
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: () => undefined,
      showErrorMessage: assert.fail,
    });
    assert.equal(copied.length, 1);
    assert.equal((copied[0].match(/\[TASK\]/g) ?? []).length, 1);
    assert.equal((copied[0].match(/\[REPOSITORY: (?:web|api)\]/g) ?? []).length, 2);
    assert.match(copied[0], /\[REPOSITORY: api\][\s\S]*diff for repo-1[\s\S]*status for repo-1/);
    assert.match(copied[0], /\[REPOSITORY: web\][\s\S]*diff for repo-2[\s\S]*status for repo-2/);
  });

  test("warns once with combined workspace review totals", async () => {
    const copied: string[] = [];
    const warnings: string[] = [];
    await copyWorkspaceChangesForReview(["/work/api", "/work/web"], {
      buildRepository: async (scope) => {
        const includedFiles = scope.repositoryRoot.endsWith("/api")
          ? ["kept.ts", "another.ts"]
          : ["kept.ts"];
        return {
          ok: true,
          payload: `[REPOSITORY: ${repositoryLabel(scope.repositoryRoot)}]\ndiff — context`,
          changedFiles: [...includedFiles, "omitted.ts", "deleted.ts"],
          includedFiles,
          statuses: [
            { path: "omitted.ts", reason: "total review-context budget reached" },
            { path: "deleted.ts", reason: "deleted" },
          ],
        };
      },
      writeClipboard: async (text) => { copied.push(text); },
      showWarningMessage: (message) => {
        assert.equal(copied.length, 1);
        warnings.push(message);
      },
      showInformationMessage: assert.fail,
      showErrorMessage: assert.fail,
    });

    assert.match(copied[0], /\[REPOSITORY: api\]/);
    assert.match(copied[0], /\[REPOSITORY: web\]/);
    assert.equal(warnings.length, 1);
    const size = formatPayloadSize(Buffer.byteLength(copied[0], "utf8"));
    assert.ok(warnings[0].startsWith(`Copied review request with limited file context (${size}), ready to paste`));
    assert.match(warnings[0], /full contents for 3 files/);
    assert.match(warnings[0], /context budget limited 2 files to diffs/);
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
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: (message) => { info.push(message); },
      showErrorMessage: assert.fail,
    });
    assert.equal(copied.length, 1);
    assert.match(copied[0], /\[REPOSITORY: web\]/);
    assert.match(copied[0], /\[REPOSITORY: api\]/);
    assert.equal(
      info[0],
      `Copied workspace review request for 2 repositories and 2 changed files (${formatPayloadSize(Buffer.byteLength(copied[0], "utf8"))}). Paste it into your AI chat to get a review. Nothing is shared until you paste it.`
    );
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
      showWarningMessage: (message) => assert.fail(message),
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
      showWarningMessage: (message) => assert.fail(message),
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
      showWarningMessage: (message) => assert.fail(message),
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
      showWarningMessage: (message) => assert.fail(message),
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
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => { errors.push(message); },
    });
    assert.deepEqual(errors, [WORKSPACE_REVIEW_OVERFLOW_MESSAGE]);
    assert.match(errors[0], /Select fewer changed files in Source Control, then right-click and choose AI Badger: Copy Selected Changes for Review/);
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
      showWarningMessage: (message) => assert.fail(message),
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
      showWarningMessage: (message) => assert.fail(message),
      showInformationMessage: () => undefined,
      showErrorMessage: (message) => { errors.push(message); },
    });
    assert.deepEqual(copied, []);
    assert.deepEqual(errors, [WORKSPACE_REVIEW_OVERFLOW_MESSAGE]);
    assert.match(errors[0], /Select fewer changed files in Source Control, then right-click and choose AI Badger: Copy Selected Changes for Review/);
  });
});
