import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  BADGER_ACTION_ICON,
  COPY_ACTION_ICON,
  COPY_ALL_CHANGES_FOR_REVIEW_COMMAND,
  COPY_ALL_CHANGES_FOR_REVIEW_TITLE,
  DEEP_REVIEW_COMMAND,
  DEEP_REVIEW_PLACEHOLDER_MESSAGE,
  DEEP_REVIEW_TITLE,
  EXPLORER_SELECTION_MENU,
  REPOSITORY_REVIEW_CONTRACT,
  resolveRepositoryReviewScope,
  resolveSingleGitRepositoryReviewScope,
  SCM_REPOSITORY_MENU,
} from "./repositoryReviewContract";

suite("repository review action contract", () => {
  test("uses distinct repository-level direct and assisted commands", () => {
    assert.equal(COPY_ALL_CHANGES_FOR_REVIEW_COMMAND, "aiBadger.copyAllChangesForReview");
    assert.equal(COPY_ALL_CHANGES_FOR_REVIEW_TITLE, "AI Badger: Copy All Changes for Review");
    assert.equal(DEEP_REVIEW_COMMAND, "aiBadger.deepReview");
    assert.equal(DEEP_REVIEW_TITLE, "AI Badger: Deep Review");
    assert.notEqual(COPY_ALL_CHANGES_FOR_REVIEW_COMMAND, "aiBadger.reviewSelectedChanges");
  });

  test("uses the per-SourceControl repository menu and existing icon meanings", () => {
    assert.equal(SCM_REPOSITORY_MENU, "scm/sourceControl");
    assert.equal(EXPLORER_SELECTION_MENU, "explorer/context");
    assert.equal(REPOSITORY_REVIEW_CONTRACT.direct.icon, COPY_ACTION_ICON);
    assert.equal(REPOSITORY_REVIEW_CONTRACT.assisted.icon, BADGER_ACTION_ICON);
    assert.equal(REPOSITORY_REVIEW_CONTRACT.direct.requiresBadger, false);
    assert.equal(REPOSITORY_REVIEW_CONTRACT.assisted.requiresBadger, true);
    assert.equal(REPOSITORY_REVIEW_CONTRACT.assisted.initialState, "placeholder");
    assert.equal(DEEP_REVIEW_PLACEHOLDER_MESSAGE, "Deep Review is not implemented yet.");
  });

  test("resolves the clicked SourceControl repository without fallbacks", () => {
    assert.deepEqual(
      resolveRepositoryReviewScope({
        id: "git:/workspace/repo-a",
        providerId: "git",
        rootUri: { fsPath: "/workspace/repo-a" },
      }),
      {
        kind: "repository",
        repositoryId: "git:/workspace/repo-a",
        repositoryRoot: "/workspace/repo-a",
      }
    );
    assert.equal(resolveRepositoryReviewScope(undefined), undefined);
    assert.equal(resolveRepositoryReviewScope({ id: "git:missing-root" }), undefined);
    assert.equal(resolveRepositoryReviewScope({ rootUri: { fsPath: "/repo" } }), undefined);
  });

  test("uses the title-menu fallback only for one Git repository", () => {
    assert.deepEqual(
      resolveSingleGitRepositoryReviewScope([
        { id: "git:/repo", providerId: "git", rootUri: { fsPath: "/repo" } },
      ]),
      { kind: "repository", repositoryId: "git:/repo", repositoryRoot: "/repo" }
    );
    assert.equal(resolveSingleGitRepositoryReviewScope([]), undefined);
    assert.equal(resolveSingleGitRepositoryReviewScope([
      { id: "git:/a", providerId: "git", rootUri: { fsPath: "/a" } },
      { id: "git:/b", providerId: "git", rootUri: { fsPath: "/b" } },
    ]), undefined);
    assert.equal(resolveSingleGitRepositoryReviewScope([
      { id: "svn:/repo", providerId: "svn", rootUri: { fsPath: "/repo" } },
    ]), undefined);
  });

  test("exposes repository actions after the integration chunk", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
    ) as { contributes?: { commands?: Array<{ command?: string }> } };
    const commands = packageJson.contributes?.commands ?? [];
    assert.equal(commands.some((item) => item.command === COPY_ALL_CHANGES_FOR_REVIEW_COMMAND), true);
    assert.equal(commands.some((item) => item.command === DEEP_REVIEW_COMMAND), true);
  });

  test("keeps both icon assets available for the later contribution", () => {
    const extensionRoot = path.resolve(__dirname, "../../");
    assert.equal(fs.existsSync(path.resolve(extensionRoot, COPY_ACTION_ICON)), true);
    assert.equal(fs.existsSync(path.resolve(extensionRoot, BADGER_ACTION_ICON)), true);

    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(extensionRoot, "package.json"), "utf8")
    ) as {
      contributes?: {
        commands?: Array<{
          command?: string;
          icon?: { light?: string; dark?: string };
        }>;
      };
    };
    const commands = packageJson.contributes?.commands ?? [];
    for (const command of [
      "aiBadger.copyFileWithQuestion",
      "aiBadger.copyFilesWithQuestion",
    ]) {
      const item = commands.find((candidate) => candidate.command === command);
      assert.deepEqual(item?.icon, {
        light: COPY_ACTION_ICON,
        dark: COPY_ACTION_ICON,
      });
    }
    for (const command of [
      "aiBadger.askAboutProject",
      "aiBadger.askAboutFolder",
      "aiBadger.askAboutFile",
      "aiBadger.askAboutSelectedFiles",
    ]) {
      const item = commands.find((candidate) => candidate.command === command);
      assert.deepEqual(item?.icon, {
        light: BADGER_ACTION_ICON,
        dark: BADGER_ACTION_ICON,
      });
    }
  });
});
