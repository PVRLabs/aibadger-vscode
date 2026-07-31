import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildTrackedDiffArgv,
  buildUnbornRepositoryDiffArgv,
  buildUntrackedDiffArgv,
  NO_INDEX_DIFF_EXIT_CODE,
} from "./gitDiff";

suite("Git selected diff contract", () => {
  test("compares tracked selections with HEAD and includes staged plus unstaged edits", () => {
    assert.deepStrictEqual(buildTrackedDiffArgv(["space name/file.ts", "deleted.ts"]), [
      "diff",
      "--no-ext-diff",
      "--binary",
      "--full-index",
      "--find-renames",
      "HEAD",
      "--",
      "space name/file.ts",
      "deleted.ts",
    ]);
  });

  test("uses /dev/null as the source for an untracked full addition", () => {
    assert.deepStrictEqual(buildUntrackedDiffArgv("new file.ts"), [
      "diff",
      "--no-ext-diff",
      "--binary",
      "--full-index",
      "--no-index",
      "/dev/null",
      "new file.ts",
    ]);
    assert.equal(NO_INDEX_DIFF_EXIT_CODE, 1);
  });

  test("uses working-tree additions when the repository has an unborn HEAD", () => {
    assert.deepStrictEqual(buildUnbornRepositoryDiffArgv(["staged.ts", "new file.ts"]), [
      buildUntrackedDiffArgv("staged.ts"),
      buildUntrackedDiffArgv("new file.ts"),
    ]);
  });

  test("proves current local changes for all selected Git states", () => {
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
      write("new file.ts", "untracked\n");
      write("space name.ts", "before\nspaced\n");

      const tracked = run(
        buildTrackedDiffArgv([
          "staged.ts",
          "unstaged.ts",
          "mixed.ts",
          "deleted.ts",
          "renamed.ts",
          "renamed new.ts",
          "space name.ts",
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

      let untracked = "";
      try {
        untracked = execFileSync("git", buildUntrackedDiffArgv("new file.ts"), {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        const result = error as { status?: number; stdout?: string };
        assert.equal(result.status, NO_INDEX_DIFF_EXIT_CODE);
        untracked = result.stdout ?? "";
      }
      assert.match(untracked, /new file\.ts/);
      assert.match(untracked, /\+untracked/);
      assert.equal(readFileSync(join(root, "new file.ts"), "utf8"), "untracked\n");

      const unborn = mkdtempSync(join(tmpdir(), "ai-badger-git-unborn-"));
      try {
        execFileSync("git", ["init", "-q"], { cwd: unborn });
        writeFileSync(join(unborn, "staged.ts"), "staged\n");
        execFileSync("git", ["add", "staged.ts"], { cwd: unborn });
        writeFileSync(join(unborn, "staged.ts"), "staged\nunstaged\n");
        let unbornPatch = "";
        try {
          unbornPatch = execFileSync(
            "git",
            buildUnbornRepositoryDiffArgv(["staged.ts"])[0],
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
});
