import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  COPY_ALL_CHANGES_FOR_REVIEW_COMMAND,
  DEEP_REVIEW_COMMAND,
  resolveRepositoryReviewScope,
  resolveSingleGitRepositoryReviewScope,
} from "./repositoryReviewContract";

suite("repository review action contract", () => {
  test("uses distinct repository-level direct and assisted commands", () => {
    assert.equal(COPY_ALL_CHANGES_FOR_REVIEW_COMMAND, "aiBadger.copyAllChangesForReview");
    assert.equal(DEEP_REVIEW_COMMAND, "aiBadger.deepReview");
    assert.notEqual(COPY_ALL_CHANGES_FOR_REVIEW_COMMAND, "aiBadger.reviewSelectedChanges");
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

  test("exposes repository actions", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
    ) as { contributes?: { commands?: Array<{ command?: string }> } };
    const commands = packageJson.contributes?.commands ?? [];
    assert.equal(commands.some((item) => item.command === COPY_ALL_CHANGES_FOR_REVIEW_COMMAND), true);
    assert.equal(commands.some((item) => item.command === DEEP_REVIEW_COMMAND), true);
  });

  test("keeps contributed icon assets available", () => {
    const extensionRoot = path.resolve(__dirname, "../../");
    const copyActionIcon = "media/copy.svg";
    const badgerActionIcon = "media/copy-two-step.svg";
    assert.equal(fs.existsSync(path.resolve(extensionRoot, copyActionIcon)), true);
    assert.equal(fs.existsSync(path.resolve(extensionRoot, badgerActionIcon)), true);

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
      "aiBadger.copyFileForAI",
      "aiBadger.copyFilesForAI",
    ]) {
      const item = commands.find((candidate) => candidate.command === command);
      assert.deepEqual(item?.icon, {
        light: copyActionIcon,
        dark: copyActionIcon,
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
        light: badgerActionIcon,
        dark: badgerActionIcon,
      });
    }
  });
});
