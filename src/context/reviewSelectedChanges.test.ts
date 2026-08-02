import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { stat as fsStat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSelectedGitDiff, getSelectedGitChangeMetadata } from "../git/gitDiff";
import { buildReviewPayload } from "../review/reviewPayload";
import {
  createReviewSelectedChangesSelectionDeps,
  normalizeScmCommandArgs,
  reviewSelectedChanges,
  type ReviewSelectedChangesDeps,
} from "./reviewSelectedChanges";
import { resolveScmSelection } from "../selection/scmSelection";

function resource(path: string, deleted = false): import("vscode").SourceControlResourceState {
  return {
    resourceUri: {
      fsPath: path,
      scheme: "file",
      toString: () => `file://${path}`,
    },
    decorations: deleted ? { strikeThrough: true } : undefined,
  } as unknown as import("vscode").SourceControlResourceState;
}

function deps(overrides: Partial<ReviewSelectedChangesDeps> = {}) {
  const copied: string[] = [];
  const errors: string[] = [];
  const info: string[] = [];
  const base: ReviewSelectedChangesDeps = {
    selection: {
      stat: async () => ({ isFile: true }),
      getRepositoryRoot: async () => "/repo",
      getRelativePath: (uri) => uri.fsPath.slice("/repo/".length),
    },
    generateDiff: async () => ({ ok: true, patch: "selected diff" }),
    getChangeMetadata: async (_root, paths) => ({
      ok: true,
      changes: new Map(paths.map((path) => [path, {
        selectedPath: path,
        changeKind: "modified" as const,
        diffPaths: [path],
      }])),
    }),
    buildPayload: async (diff, files) => ({
      ok: true,
      payload: `${diff}:${files.map((file) => file.relativePath).join(",")}`,
      includedFiles: files.map((file) => file.relativePath),
      statuses: [],
    }),
    writeClipboard: async (text) => { copied.push(text); },
    showInformationMessage: (message) => { info.push(message); },
    showErrorMessage: (message) => { errors.push(message); },
    ...overrides,
  };
  return { base, copied, errors, info };
}

suite("normalizeScmCommandArgs", () => {
  test("treats rest arguments as the full SCM multi-selection", () => {
    const a = resource("/repo/a.ts");
    const b = resource("/repo/b.ts");
    const c = resource("/repo/c.ts");
    const normalized = normalizeScmCommandArgs([a, b, c]);
    assert.equal(normalized.clicked?.resourceUri.fsPath, "/repo/a.ts");
    assert.deepEqual(
      normalized.selected?.map((item) => item.resourceUri.fsPath),
      ["/repo/a.ts", "/repo/b.ts", "/repo/c.ts"]
    );
  });

  test("does not treat a second resource as a selected-array when two files are multi-selected", () => {
    const a = resource("/repo/a.ts");
    const b = resource("/repo/b.ts");
    const normalized = normalizeScmCommandArgs([a, b]);
    assert.deepEqual(
      normalized.selected?.map((item) => item.resourceUri.fsPath),
      ["/repo/a.ts", "/repo/b.ts"]
    );
  });

  test("accepts tree-view style focused item plus selected array", () => {
    const a = resource("/repo/a.ts");
    const b = resource("/repo/b.ts");
    const normalized = normalizeScmCommandArgs([b, [b, a]]);
    assert.equal(normalized.clicked?.resourceUri.fsPath, "/repo/b.ts");
    assert.deepEqual(
      normalized.selected?.map((item) => item.resourceUri.fsPath),
      ["/repo/b.ts", "/repo/a.ts"]
    );
  });

  test("ignores non-resource trailing arguments when only one resource is present", () => {
    const normalized = normalizeScmCommandArgs([
      resource("/repo/a.ts"),
      { unexpected: "SCM context" },
    ]);
    assert.equal(normalized.clicked?.resourceUri.fsPath, "/repo/a.ts");
    assert.deepEqual(
      normalized.selected?.map((item) => item.resourceUri.fsPath),
      ["/repo/a.ts"]
    );
  });
});

suite("reviewSelectedChanges", () => {
  test("copies the selected payload and uses singular success wording", async () => {
    const harness = deps();
    await reviewSelectedChanges([resource("/repo/a.ts")], harness.base);
    assert.deepEqual(harness.copied, ["selected diff:a.ts"]);
    assert.deepEqual(harness.info, [
      "Copied review request for 1 selected file. Nothing is shared until you paste it.",
    ]);
    assert.deepEqual(harness.errors, []);
  });

  test("copies every resource passed as SCM rest arguments", async () => {
    const harness = deps();
    await reviewSelectedChanges(
      [resource("/repo/a.ts"), resource("/repo/b.ts"), resource("/repo/c.ts")],
      harness.base
    );
    assert.deepEqual(harness.copied, ["selected diff:a.ts,b.ts,c.ts"]);
    assert.match(harness.info[0], /3 selected files/);
  });

  test("preserves tree-view multi-selection order and uses plural wording", async () => {
    const harness = deps();
    await reviewSelectedChanges(
      [resource("/repo/b.ts"), [resource("/repo/b.ts"), resource("/repo/a.ts")]],
      harness.base
    );
    assert.deepEqual(harness.copied, ["selected diff:b.ts,a.ts"]);
    assert.match(harness.info[0], /2 selected files/);
  });

  test("does not write the clipboard when Git produces no diff", async () => {
    const harness = deps({
      generateDiff: async () => ({ ok: false, reason: "no-diff" }),
    });
    await reviewSelectedChanges([resource("/repo/a.ts")], harness.base);
    assert.deepEqual(harness.copied, []);
    assert.deepEqual(harness.info, []);
    assert.deepEqual(harness.errors, ["The selected files have no current Git changes."]);
  });

  test("reports unexpected preparation failures without attempting the clipboard", async () => {
    const harness = deps({
      selection: {
        stat: async () => ({ isFile: true }),
        getRepositoryRoot: async () => { throw new Error("unexpected repository failure"); },
        getRelativePath: () => "a.ts",
      },
    });
    await reviewSelectedChanges([resource("/repo/a.ts")], harness.base);
    assert.deepEqual(harness.copied, []);
    assert.deepEqual(harness.errors, ["Could not prepare selected changes for review (selection)."]);
  });

  test("does not write the clipboard when the mandatory payload is too large", async () => {
    const harness = deps({
      buildPayload: async () => ({ ok: false, reason: "mandatory-overflow", byteLength: 300000 }),
    });
    await reviewSelectedChanges([resource("/repo/a.ts")], harness.base);
    assert.deepEqual(harness.copied, []);
    assert.match(harness.errors[0], /too large.*Select fewer files/);
  });

  test("reports clipboard failures without showing success", async () => {
    const harness = deps({
      writeClipboard: async () => { throw new Error("clipboard unavailable"); },
    });
    await reviewSelectedChanges([resource("/repo/a.ts")], harness.base);
    assert.deepEqual(harness.info, []);
    assert.deepEqual(harness.errors, ["Could not write the review request to the clipboard."]);
  });

  test("maps deleted SCM decoration without invoking Badger", async () => {
    const harness = deps();
    await reviewSelectedChanges([resource("/repo/deleted.ts", true)], harness.base);
    assert.deepEqual(harness.copied, ["selected diff:deleted.ts"]);
  });

  test("expands only a selected rename while keeping one payload file", async () => {
    const diffPaths: string[][] = [];
    const payloadPaths: string[][] = [];
    const harness = deps({
      getChangeMetadata: async () => ({
        ok: true,
        changes: new Map([[
          "renamed new.ts",
          {
            selectedPath: "renamed new.ts",
            changeKind: "renamed" as const,
            renameSourcePath: "renamed old.ts",
            diffPaths: ["renamed old.ts", "renamed new.ts"],
          },
        ]]),
      }),
      generateDiff: async (_root, paths) => {
        diffPaths.push([...paths]);
        return { ok: true, patch: "rename from renamed old.ts\nrename to renamed new.ts\n" };
      },
      buildPayload: async (diff, files) => {
        payloadPaths.push(files.map((file) => file.relativePath));
        return { ok: true, payload: diff, includedFiles: [], statuses: [] };
      },
    });
    await reviewSelectedChanges(
      [resource("/repo/renamed new.ts")],
      harness.base
    );
    assert.deepEqual(diffPaths, [["renamed old.ts", "renamed new.ts"]]);
    assert.deepEqual(payloadPaths, [["renamed new.ts"]]);
    assert.match(harness.info[0], /1 selected file/);
  });

  test("runs the real rename metadata and diff orchestration for one destination resource", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-review-rename-"));
    const run = (args: string[]) => execFileSync("git", args, { cwd: root });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      writeFileSync(join(root, "old name.ts"), "one\ntwo\nthree\n");
      writeFileSync(join(root, "unrelated old.ts"), "unrelated\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      run(["mv", "old name.ts", "new name.ts"]);
      writeFileSync(join(root, "new name.ts"), "one\ntwo\nthree\nchanged\n");
      run(["mv", "unrelated old.ts", "unrelated new.ts"]);

      const captured: { diff?: string; paths?: string[] } = {};
      const harness = deps({
        selection: {
          stat: async () => ({ isFile: true }),
          getRepositoryRoot: async () => root,
          getRelativePath: (uri) => uri.fsPath.slice(root.length + 1),
        },
        getChangeMetadata: getSelectedGitChangeMetadata,
        generateDiff: async (repositoryRoot, paths, gitDeps) => {
          captured.paths = [...paths];
          return generateSelectedGitDiff(repositoryRoot, paths, gitDeps);
        },
        buildPayload: async (diff, files) => {
          captured.diff = diff;
          return { ok: true, payload: diff, includedFiles: files.map((file) => file.relativePath), statuses: [] };
        },
      });
      await reviewSelectedChanges([resource(join(root, "new name.ts"))], harness.base);
      assert.deepEqual(captured.paths, ["old name.ts", "new name.ts"]);
      assert.match(captured.diff ?? "", /rename from old name\.ts/);
      assert.match(captured.diff ?? "", /rename to new name\.ts/);
      assert.doesNotMatch(captured.diff ?? "", /unrelated new\.ts/);
      assert.deepEqual(harness.copied.length, 1);
      assert.match(harness.info[0], /1 selected file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("runs the real deletion orchestration after the selected parent directory is removed", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-review-deleted-"));
    const run = (args: string[]) => execFileSync("git", args, { cwd: root });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      mkdirSync(join(root, "removed/subdir"), { recursive: true });
      const deleted = join(root, "removed/subdir/deleted.ts");
      writeFileSync(deleted, "gone\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      rmSync(join(root, "removed"), { recursive: true, force: true });

      const harness = deps({
        selection: {
          stat: async () => { throw { code: "ENOENT" }; },
          getRepositoryRoot: async () => root,
          getRelativePath: (uri) => uri.fsPath.slice(root.length + 1),
        },
        getChangeMetadata: getSelectedGitChangeMetadata,
        generateDiff: generateSelectedGitDiff,
        buildPayload: async (diff) => ({ ok: true, payload: diff, includedFiles: [], statuses: [] }),
      });
      await reviewSelectedChanges([resource(deleted, true)], harness.base);
      assert.deepEqual(harness.copied.length, 1);
      assert.match(harness.copied[0], /deleted file mode/);
      assert.deepEqual(harness.errors, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("copies a deletion patch when the removed parent is replaced by a file", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-review-replaced-parent-"));
    const run = (args: string[]) => execFileSync("git", args, { cwd: root });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      mkdirSync(join(root, "removed/subdir"), { recursive: true });
      const deleted = join(root, "removed/subdir/file.ts");
      writeFileSync(deleted, "gone\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      rmSync(join(root, "removed"), { recursive: true, force: true });
      writeFileSync(join(root, "removed"), "replacement\n");

      const harness = deps({
        selection: {
          stat: async () => { throw { code: "FileNotADirectory" }; },
          getRepositoryRoot: async () => root,
          getRelativePath: (uri) => uri.fsPath.slice(root.length + 1),
        },
        getChangeMetadata: getSelectedGitChangeMetadata,
        generateDiff: generateSelectedGitDiff,
        buildPayload: async (diff) => ({ ok: true, payload: diff, includedFiles: [], statuses: [] }),
      });
      await reviewSelectedChanges([resource(deleted, true)], harness.base);
      assert.deepEqual(harness.errors, []);
      assert.equal(harness.copied.length, 1);
      assert.match(harness.copied[0], /deleted file mode/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("passes nested untracked metadata to the payload without a duplicate full-file block", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-review-untracked-"));
    const run = (args: string[]) => execFileSync("git", args, { cwd: root });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      writeFileSync(join(root, "tracked.ts"), "tracked\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      mkdirSync(join(root, "new-directory/nested"), { recursive: true });
      const selectedPath = join(root, "new-directory/nested/new.ts");
      writeFileSync(selectedPath, "new file\n");

      const harness = deps({
        selection: {
          stat: async () => ({ isFile: true }),
          getRepositoryRoot: async () => root,
          getRelativePath: (uri) => uri.fsPath.slice(root.length + 1),
        },
        getChangeMetadata: getSelectedGitChangeMetadata,
        generateDiff: generateSelectedGitDiff,
        buildPayload: buildReviewPayload,
      });
      await reviewSelectedChanges([resource(selectedPath)], harness.base);
      assert.equal(harness.errors.length, 0);
      assert.equal(harness.copied.length, 1);
      assert.match(harness.copied[0], /\[REVIEW CONTEXT: SELECTED GIT DIFF\]/);
      assert.match(harness.copied[0], /\+new file/);
      assert.match(harness.copied[0], /new-directory\/nested\/new\.ts — diff only: untracked addition already complete in patch/);
      assert.doesNotMatch(harness.copied[0], /Full File/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves a symlinked workspace through the actual SCM selection dependencies", async function (this: Mocha.Context) {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-review-symlink-"));
    const linkRoot = `${root}-link`;
    const run = (args: string[]) => execFileSync("git", args, { cwd: root });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src/a.ts"), "before\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      try {
        symlinkSync(root, linkRoot, "dir");
      } catch (error) {
        if (process.platform === "win32") {
          this.skip();
          return;
        }
        throw error;
      }
      const selectedPath = join(linkRoot, "src/a.ts");
      writeFileSync(selectedPath, "before\nafter\n");
      const vscodeApi = {
        workspace: {
          fs: {
            stat: async (uri: { fsPath: string }) => {
              const value = await fsStat(uri.fsPath);
              return { type: value.isFile() ? 1 : 2 };
            },
          },
        },
        FileType: { File: 1 },
      } as unknown as typeof import("vscode");
      const selection = await resolveScmSelection(
        resource(selectedPath),
        undefined,
        createReviewSelectedChangesSelectionDeps(vscodeApi)
      );
      assert.equal(selection.ok, true);
      if (!selection.ok) return;
      assert.equal(selection.value.repositoryRoot, realpathSync(root));
      assert.equal(selection.value.files[0].relativePath, "src/a.ts");
      const diff = await generateSelectedGitDiff(
        selection.value.repositoryRoot,
        [selection.value.files[0].relativePath]
      );
      assert.equal(diff.ok, true);
      if (diff.ok) assert.match(diff.patch, /\+after/);
    } finally {
      rmSync(linkRoot, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});
