import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildTrackedDiffArgv,
  buildGitStatusMetadataArgv,
  buildUnbornRepositoryDiffArgv,
  buildUntrackedDiffArgv,
  generateSelectedGitDiff,
  getSelectedGitChangeMetadata,
  NO_INDEX_DIFF_EXIT_CODE,
  resolveGitRepositoryRoot,
} from "./gitDiff";

suite("Git selected diff contract", () => {
  test("uses deterministic repository-wide status metadata arguments", () => {
    assert.deepStrictEqual(buildGitStatusMetadataArgv(), [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--renames",
    ]);
  });
  test("compares tracked selections with HEAD and includes staged plus unstaged edits", () => {
    assert.deepStrictEqual(buildTrackedDiffArgv(["space name/file.ts", "deleted.ts"]), [
      "diff",
      "--no-ext-diff",
      "--full-index",
      "--find-renames",
      "HEAD",
      "--",
      ":(literal)space name/file.ts",
      ":(literal)deleted.ts",
    ]);
  });

  test("uses /dev/null as the source for an untracked full addition", () => {
    assert.deepStrictEqual(buildUntrackedDiffArgv("new file.ts"), [
      "diff",
      "--no-ext-diff",
      "--full-index",
      "--no-index",
      "--",
      "/dev/null",
      "new file.ts",
    ]);
    assert.equal(NO_INDEX_DIFF_EXIT_CODE, 1);
  });

  test("uses working-tree additions when the repository has an unborn HEAD", () => {
    assert.deepStrictEqual(buildUnbornRepositoryDiffArgv(["-staged.ts", "new file.ts"]), [
      buildUntrackedDiffArgv("-staged.ts"),
      buildUntrackedDiffArgv("new file.ts"),
    ]);
  });

  test("proves current local changes for all selected Git states", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-diff-"));
    const run = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const write = (path: string, content: string) => {
      const absolute = join(root, path);
      writeFileSync(absolute, content);
    };
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      write("staged.ts", "before\n");
      write("unstaged.ts", "before\n");
      write("mixed.ts", "before\n");
      write("deleted.ts", "before\n");
      write("renamed.ts", "rename-before\n");
      write("space name.ts", "before\n");
      writeFileSync(join(root, "deleted-large.bin"), Buffer.alloc(300 * 1024));
      writeFileSync(join(root, "modified.bin"), Buffer.from([0, 1, 2]));
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);

      write("staged.ts", "before\nstaged\n");
      run(["add", "staged.ts"]);
      write("unstaged.ts", "before\nunstaged\n");
      write("mixed.ts", "before\nstaged\n");
      run(["add", "mixed.ts"]);
      write("mixed.ts", "before\nstaged\nunstaged\n");
      run(["rm", "-q", "deleted.ts"]);
      run(["mv", "renamed.ts", "renamed new.ts"]);
      write("renamed new.ts", "rename-before\nrename-after\n");
      write("-new file.ts", "untracked\n");
      write("space name.ts", "before\nspaced\n");
      run(["rm", "-q", "deleted-large.bin"]);
      writeFileSync(join(root, "modified.bin"), Buffer.from([0, 3, 4]));
      writeFileSync(join(root, "added.bin"), Buffer.from([0, 5, 6]));
      run(["add", "added.bin"]);
      writeFileSync(join(root, "untracked.bin"), Buffer.from([0, 7, 8]));

      const tracked = run(
        buildTrackedDiffArgv([
          "staged.ts",
          "unstaged.ts",
          "mixed.ts",
          "deleted.ts",
          "renamed.ts",
          "renamed new.ts",
          "space name.ts",
          "deleted-large.bin",
        ])
      );
      const mixedPatch = tracked.match(
        /diff --git a\/mixed\.ts b\/mixed\.ts[\s\S]*?(?=\ndiff --git|$)/
      )?.[0];
      assert.ok(mixedPatch);
      assert.match(mixedPatch, /\+staged(?:\n|$)/);
      assert.match(mixedPatch, /\+unstaged(?:\n|$)/);
      const renamePatch = tracked.match(
        /diff --git a\/renamed\.ts b\/renamed new\.ts[\s\S]*?(?=\ndiff --git|$)/
      )?.[0];
      assert.ok(renamePatch);
      assert.match(renamePatch, /similarity index/);
      assert.match(renamePatch, /rename from renamed\.ts/);
      assert.match(renamePatch, /rename to renamed new\.ts/);
      assert.match(tracked, /deleted\.ts/);
      assert.match(tracked, /space name\.ts/);
      assert.doesNotMatch(tracked, /new file\.ts/);
      assert.match(tracked, /Binary files .*deleted-large\.bin.* differ/);
      assert.doesNotMatch(tracked, /GIT binary patch/);
      assert.ok(Buffer.byteLength(tracked, "utf8") < 50 * 1024);

      const binaryResult = await generateSelectedGitDiff(root, [
        "deleted-large.bin",
        "modified.bin",
        "added.bin",
        "untracked.bin",
      ]);
      assert.equal(binaryResult.ok, true);
      if (binaryResult.ok) {
        assert.deepEqual(new Set(binaryResult.binaryPaths), new Set([
          "deleted-large.bin",
          "modified.bin",
          "added.bin",
          "untracked.bin",
        ]));
        assert.doesNotMatch(binaryResult.patch, /GIT binary patch/);
      }

      let untracked = "";
      try {
        untracked = execFileSync("git", buildUntrackedDiffArgv("-new file.ts"), {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        const result = error as { status?: number; stdout?: string };
        assert.equal(result.status, NO_INDEX_DIFF_EXIT_CODE);
        untracked = result.stdout ?? "";
      }
      assert.match(untracked, /-new file\.ts/);
      assert.match(untracked, /\+untracked/);
      assert.equal(readFileSync(join(root, "-new file.ts"), "utf8"), "untracked\n");

      const unborn = mkdtempSync(join(tmpdir(), "ai-badger-git-unborn-"));
      try {
        execFileSync("git", ["init", "-q"], { cwd: unborn });
        writeFileSync(join(unborn, "-staged.ts"), "staged\n");
        execFileSync("git", ["add", "--", "-staged.ts"], { cwd: unborn });
        writeFileSync(join(unborn, "-staged.ts"), "staged\nunstaged\n");
        let unbornPatch = "";
        try {
          unbornPatch = execFileSync(
            "git",
            buildUnbornRepositoryDiffArgv(["-staged.ts"])[0],
            { cwd: unborn, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
          );
        } catch (error) {
          const result = error as { status?: number; stdout?: string };
          assert.equal(result.status, NO_INDEX_DIFF_EXIT_CODE);
          unbornPatch = result.stdout ?? "";
        }
        assert.match(unbornPatch, /\+staged\n/);
        assert.match(unbornPatch, /\+unstaged\n/);
      } finally {
        rmSync(unborn, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("executes Git with explicit argv and excludes unrelated changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-exec-"));
    const run = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      writeFileSync(join(root, ":(glob)selected.ts"), "before\n");
      writeFileSync(join(root, "unrelated.ts"), "before\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      writeFileSync(join(root, ":(glob)selected.ts"), "selected\n");
      writeFileSync(join(root, "unrelated.ts"), "unrelated\n");

      const result = await generateSelectedGitDiff(root, [":(glob)selected.ts"]);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.match(result.patch, /:\(glob\)selected\.ts/);
        assert.match(result.patch, /\+selected/);
        assert.doesNotMatch(result.patch, /unrelated\.ts/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns typed no-diff and unavailable results without patch diagnostics", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-errors-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      writeFileSync(join(root, "clean.ts"), "clean\n");
      execFileSync("git", ["add", "clean.ts"], { cwd: root });
      execFileSync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });
      execFileSync("git", ["config", "user.name", "AI Badger tests"], { cwd: root });
      execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
      const empty = await generateSelectedGitDiff(root, ["missing.ts"]);
      assert.deepStrictEqual(empty, { ok: false, reason: "no-diff" });

      const unavailable = await generateSelectedGitDiff(root, ["missing.ts"], {
        spawn: (() => { throw new Error("git unavailable"); }) as typeof import("node:child_process").spawn,
      });
      assert.equal(unavailable.ok, false);
      if (!unavailable.ok) {
        assert.equal(unavailable.reason, "git-unavailable");
        assert.ok(!unavailable.detail?.includes("diff"));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an empty selected-path list instead of diffing the repository", async () => {
    const result = await generateSelectedGitDiff("/not-used", []);
    assert.deepStrictEqual(result, { ok: false, reason: "no-files" });
  });

  test("does not classify a non-repository as an unborn repository", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-not-git-"));
    try {
      const result = await generateSelectedGitDiff(root, ["file.ts"]);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "git-failed");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("detects unborn HEAD even when another ref already exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-tagged-unborn-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      writeFileSync(join(root, "seed.ts"), "seed\n");
      const objectId = execFileSync("git", ["hash-object", "-w", "seed.ts"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      execFileSync("git", ["update-ref", "refs/tags/seed", objectId], { cwd: root });
      writeFileSync(join(root, "new.ts"), "new\n");
      const result = await generateSelectedGitDiff(root, ["new.ts"]);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.match(result.patch, /\+new/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("classifies a selected rename destination and expands only that pair", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-rename-metadata-"));
    const run = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      writeFileSync(join(root, "old name.ts"), "before\nline two\nline three\n");
      writeFileSync(join(root, "unrelated old.ts"), "unrelated\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      run(["mv", "old name.ts", "new name.ts"]);
      writeFileSync(join(root, "new name.ts"), "before\nline two\nline three\nafter rename\n");
      run(["mv", "unrelated old.ts", "unrelated new.ts"]);

      const metadata = await getSelectedGitChangeMetadata(root, ["new name.ts"]);
      assert.equal(metadata.ok, true);
      if (!metadata.ok) return;
      const rename = metadata.changes.get("new name.ts");
      assert.deepEqual(rename, {
        selectedPath: "new name.ts",
        changeKind: "renamed",
        renameSourcePath: "old name.ts",
        diffPaths: ["old name.ts", "new name.ts"],
      });
      const diff = await generateSelectedGitDiff(root, rename!.diffPaths);
      assert.equal(diff.ok, true);
      if (!diff.ok) return;
      assert.match(diff.patch, /rename from old name\.ts/);
      assert.match(diff.patch, /rename to new name\.ts/);
      assert.match(diff.patch, /\+after rename/);
      assert.doesNotMatch(diff.patch, /unrelated new\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves a deleted path after its parent directories are removed", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-deleted-parent-"));
    const run = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      mkdirSync(join(root, "removed/subdir"), { recursive: true });
      writeFileSync(join(root, "removed/subdir/deleted.ts"), "gone\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      rmSync(join(root, "removed"), { recursive: true, force: true });

      const deletedPath = join(root, "removed/subdir/deleted.ts");
      assert.equal(await resolveGitRepositoryRoot(deletedPath), realpathSync(root));
      const diff = await generateSelectedGitDiff(root, ["removed/subdir/deleted.ts"]);
      assert.equal(diff.ok, true);
      if (diff.ok) assert.match(diff.patch, /deleted file mode/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("continues past a replaced directory when resolving a deleted path", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-replaced-directory-"));
    const run = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      mkdirSync(join(root, "removed/subdir"), { recursive: true });
      writeFileSync(join(root, "removed/subdir/file.ts"), "gone\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      rmSync(join(root, "removed"), { recursive: true, force: true });
      writeFileSync(join(root, "removed"), "replacement\n");

      const deletedPath = join(root, "removed/subdir/file.ts");
      assert.equal(await resolveGitRepositoryRoot(deletedPath), realpathSync(root));
      const diff = await generateSelectedGitDiff(root, ["removed/subdir/file.ts"]);
      assert.equal(diff.ok, true);
      if (diff.ok) assert.match(diff.patch, /deleted file mode/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("enumerates a nested untracked file and keeps unrelated metadata out", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-untracked-metadata-"));
    const run = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      writeFileSync(join(root, "tracked.ts"), "tracked\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      mkdirSync(join(root, "new-directory/nested"), { recursive: true });
      writeFileSync(join(root, "new-directory/nested/new.ts"), "new file\n");
      writeFileSync(join(root, "unrelated.ts"), "unrelated\n");

      const metadata = await getSelectedGitChangeMetadata(root, ["new-directory/nested/new.ts"]);
      assert.equal(metadata.ok, true);
      if (!metadata.ok) return;
      assert.deepEqual([...metadata.changes.keys()], ["new-directory/nested/new.ts"]);
      assert.deepEqual(metadata.changes.get("new-directory/nested/new.ts"), {
        selectedPath: "new-directory/nested/new.ts",
        changeKind: "untracked",
        diffPaths: ["new-directory/nested/new.ts"],
      });
      const diff = await generateSelectedGitDiff(root, ["new-directory/nested/new.ts"]);
      assert.equal(diff.ok, true);
      if (!diff.ok) return;
      assert.match(diff.patch, /--- \/dev\/null/);
      assert.match(diff.patch, /\+new file/);
      assert.doesNotMatch(diff.patch, /unrelated\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("detects renames even when status.renames is disabled", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-badger-git-rename-config-"));
    const run = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      run(["init", "-q"]);
      run(["config", "user.email", "tests@example.invalid"]);
      run(["config", "user.name", "AI Badger tests"]);
      writeFileSync(join(root, "old.ts"), "one\ntwo\nthree\n");
      writeFileSync(join(root, "unrelated old.ts"), "unrelated\none\ntwo\n");
      run(["add", "."]);
      run(["commit", "-qm", "initial"]);
      run(["mv", "old.ts", "new.ts"]);
      writeFileSync(join(root, "new.ts"), "one\ntwo\nthree\nchanged\n");
      run(["mv", "unrelated old.ts", "unrelated new.ts"]);
      run(["config", "status.renames", "false"]);

      const metadata = await getSelectedGitChangeMetadata(root, ["new.ts"]);
      assert.equal(metadata.ok, true);
      if (!metadata.ok) return;
      const rename = metadata.changes.get("new.ts");
      assert.equal(rename?.changeKind, "renamed");
      assert.equal(rename?.renameSourcePath, "old.ts");
      assert.deepEqual(rename?.diffPaths, ["old.ts", "new.ts"]);
      const diff = await generateSelectedGitDiff(root, rename!.diffPaths);
      assert.equal(diff.ok, true);
      if (!diff.ok) return;
      assert.match(diff.patch, /rename from old\.ts/);
      assert.match(diff.patch, /rename to new\.ts/);
      assert.doesNotMatch(diff.patch, /unrelated new\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
