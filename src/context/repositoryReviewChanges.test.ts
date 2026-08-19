import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRepositoryReviewPayload } from "./repositoryReviewChanges";
import { buildReviewPayload } from "../review/reviewPayload";

function scope(repositoryRoot: string): import("../review/repositoryReviewContract").RepositoryReviewScope {
  return { kind: "repository", repositoryId: `git:${repositoryRoot}`, repositoryRoot };
}

function initializeRepository(repositoryRoot: string): void {
  const run = (args: string[]) => execFileSync("git", args, { cwd: repositoryRoot });
  run(["init", "-q"]);
  run(["config", "user.email", "tests@example.invalid"]);
  run(["config", "user.name", "AI Badger tests"]);
}

suite("buildRepositoryReviewPayload", () => {
  test("returns typed invalid-root and clean-repository outcomes", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-clean-"));
    try {
      assert.deepEqual(await buildRepositoryReviewPayload(scope(join(root, "missing"))), {
        ok: false,
        reason: "invalid-root",
      });

      initializeRepository(root);
      writeFileSync(join(root, "clean.ts"), "clean\n");
      execFileSync("git", ["add", "clean.ts"], { cwd: root });
      execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
      assert.deepEqual(await buildRepositoryReviewPayload(scope(root)), {
        ok: false,
        reason: "no-change",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("builds one deterministic payload for every repository change state", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-all-"));
    try {
      initializeRepository(root);
      writeFileSync(join(root, "modified.ts"), "before\n");
      writeFileSync(join(root, "deleted-large.bin"), Buffer.alloc(300 * 1024));
      writeFileSync(join(root, "old name.ts"), "old\n");
      writeFileSync(join(root, "spaced name.ts"), "before\n");
      execFileSync("git", ["add", "."], { cwd: root });
      execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });

      writeFileSync(join(root, "modified.ts"), "before\nafter\n");
      execFileSync("git", ["mv", "old name.ts", "renamed name.ts"], { cwd: root });
      writeFileSync(join(root, "renamed name.ts"), "old\nrenamed\n");
      execFileSync("git", ["rm", "-q", "deleted-large.bin"], { cwd: root });
      writeFileSync(join(root, "spaced name.ts"), "before\nspaced\n");
      writeFileSync(join(root, "staged-added.ts"), "staged\n");
      execFileSync("git", ["add", "staged-added.ts"], { cwd: root });
      mkdirSync(join(root, "new directory"));
      writeFileSync(join(root, "new directory/untracked.ts"), "untracked\n");

      const result = await buildRepositoryReviewPayload(scope(root));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.changedFiles, [
        "deleted-large.bin",
        "modified.ts",
        "new directory/untracked.ts",
        "renamed name.ts",
        "spaced name.ts",
        "staged-added.ts",
      ]);
      assert.match(result.payload, /\[REVIEW CONTEXT: SELECTED GIT DIFF\]/);
      assert.match(result.payload, /deleted file mode/);
      assert.doesNotMatch(result.payload, /GIT binary patch/);
      assert.match(result.payload, /new directory\/untracked\.ts/);
      assert.match(result.payload, /renamed name\.ts/);
      assert.match(result.payload, /deleted-large\.bin — diff only: deleted/);
      assert.match(result.payload, /spaced name\.ts/);
      assert.deepEqual(result.includedFiles, ["modified.ts", "new directory/untracked.ts", "renamed name.ts", "spaced name.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not combine another repository and does not expose Git diagnostics", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-isolation-"));
    const other = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-other-"));
    try {
      initializeRepository(root);
      writeFileSync(join(root, "root.ts"), "before\n");
      execFileSync("git", ["add", "root.ts"], { cwd: root });
      execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
      writeFileSync(join(root, "root.ts"), "root changed\n");

      initializeRepository(other);
      writeFileSync(join(other, "other.ts"), "before\n");
      execFileSync("git", ["add", "other.ts"], { cwd: other });
      execFileSync("git", ["commit", "-qm", "initial"], { cwd: other });
      writeFileSync(join(other, "other.ts"), "other changed\n");

      const result = await buildRepositoryReviewPayload(scope(root));
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.changedFiles, ["root.ts"]);
        assert.match(result.payload, /root changed/);
        assert.doesNotMatch(result.payload, /other changed/);
      }

      const notGit = await buildRepositoryReviewPayload(scope(other + "/missing"));
      assert.deepEqual(notGit, { ok: false, reason: "invalid-root" });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  test("maps Git failures and mandatory overflow without content diagnostics", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-errors-"));
    try {
      initializeRepository(root);
      const unavailable = await buildRepositoryReviewPayload(scope(root), {
        getChangeMetadata: async () => ({
          ok: false,
          reason: "git-unavailable" as const,
        }),
      });
      assert.deepEqual(unavailable, { ok: false, reason: "git-unavailable" });

      const overflow = await buildRepositoryReviewPayload(scope(root), {
        getChangeMetadata: async () => ({
          ok: true,
          changes: new Map([[
            "large.ts",
            { selectedPath: "large.ts", changeKind: "modified" as const, diffPaths: ["large.ts"] },
          ]]),
        }),
        generateDiff: async () => ({ ok: true, patch: "diff" }),
        buildPayload: async () => ({ ok: false, reason: "mandatory-overflow", byteLength: 300000 }),
      });
      assert.deepEqual(overflow, {
        ok: false,
        reason: "mandatory-overflow",
        byteLength: 300000,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("handles an unborn repository through the existing full-addition diff path", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-unborn-"));
    try {
      initializeRepository(root);
      writeFileSync(join(root, "unborn.ts"), "staged\n");
      execFileSync("git", ["add", "unborn.ts"], { cwd: root });
      writeFileSync(join(root, "unborn.ts"), "staged\nunstaged\n");

      const result = await buildRepositoryReviewPayload(scope(root), {
        buildPayload: buildReviewPayload,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.match(result.payload, /\+staged/);
        assert.match(result.payload, /\+unstaged/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("copies an untracked-only repository without requiring a commit", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-untracked-"));
    try {
      initializeRepository(root);
      writeFileSync(join(root, "new file.ts"), "untracked\n");

      const result = await buildRepositoryReviewPayload(scope(root));
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.changedFiles, ["new file.ts"]);
        assert.doesNotMatch(result.payload, /--- \/dev\/null/);
        assert.match(result.payload, /Untracked Working-Tree Addition: new file\.ts/);
        assert.match(result.payload, /untracked/);
        assert.deepEqual(result.includedFiles, ["new file.ts"]);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("uses the repository-wide Git adapter rather than a fabricated SCM selection", async () => {
    const calls: string[] = [];
    const root = mkdtempSync(join(tmpdir(), "ai-badger-repository-review-adapter-"));
    try {
      initializeRepository(root);
      const result = await buildRepositoryReviewPayload(scope(root), {
        getChangeMetadata: async (repositoryRoot) => {
          calls.push(repositoryRoot);
          return { ok: true, changes: new Map() };
        },
      });
      assert.deepEqual(result, { ok: false, reason: "no-change" });
      assert.deepEqual(calls, [root]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
