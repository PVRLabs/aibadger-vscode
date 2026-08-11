import * as assert from "node:assert/strict";
import {
  COPY_WORKSPACE_CHANGES_FOR_REVIEW_COMMAND,
  COPY_WORKSPACE_CHANGES_FOR_REVIEW_TITLE,
  workspaceRepositories,
} from "./workspaceReviewContract";

suite("workspace review contract", () => {
  test("uses one explicit direct-copy command", () => {
    assert.equal(COPY_WORKSPACE_CHANGES_FOR_REVIEW_COMMAND, "aiBadger.copyWorkspaceChangesForReview");
    assert.equal(COPY_WORKSPACE_CHANGES_FOR_REVIEW_TITLE, "AI Badger: Copy Workspace Changes for Review");
  });

  test("orders, deduplicates, and identifies repository roots", () => {
    assert.deepEqual(workspaceRepositories(["/z/api", "/a/web", "/z/api"]), [
      { id: "repo-1", label: "web", repositoryRoot: "/a/web" },
      { id: "repo-2", label: "api", repositoryRoot: "/z/api" },
    ]);
  });

  test("disambiguates duplicate names without putting parent paths in labels", () => {
    const repositories = workspaceRepositories(["/private/b/api", "/private/a/api"]);
    assert.deepEqual(repositories.map(({ id, label }) => ({ id, label })), [
      { id: "repo-1", label: "api" },
      { id: "repo-2", label: "api (2)" },
    ]);
    assert.equal(repositories.some(({ label }) => label.includes("/private")), false);
  });
});
