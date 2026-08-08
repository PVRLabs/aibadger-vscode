/** Repository-review command IDs and target resolution. */

export const COPY_ALL_CHANGES_FOR_REVIEW_COMMAND =
  "aiBadger.copyAllChangesForReview";
export const DEEP_REVIEW_COMMAND = "aiBadger.deepReview";

export type RepositoryTarget = {
  id: string;
  providerId?: string;
  rootUri: { fsPath: string };
};

export type RepositoryReviewScope = {
  kind: "repository";
  repositoryId: string;
  repositoryRoot: string;
};

/**
 * Resolve only the SourceControl argument supplied by VS Code's
 * `scm/sourceControl` menu. There is deliberately no active-editor,
 * workspace-folder, or first-repository fallback.
 */
export function resolveRepositoryReviewScope(
  argument: unknown
): RepositoryReviewScope | undefined {
  if (!argument || typeof argument !== "object") return undefined;
  const candidate = argument as Partial<RepositoryTarget>;
  if (
    typeof candidate.id !== "string" ||
    !candidate.rootUri ||
    typeof candidate.rootUri.fsPath !== "string" ||
    candidate.rootUri.fsPath.length === 0
  ) {
    return undefined;
  }
  return {
    kind: "repository",
    repositoryId: candidate.id,
    repositoryRoot: candidate.rootUri.fsPath,
  };
}

/**
 * Resolve the title-menu fallback only when VS Code exposes exactly one Git
 * repository. This keeps the fallback independent of the active editor and
 * avoids guessing in a multi-repository workspace.
 */
export function resolveSingleGitRepositoryReviewScope(
  repositories: readonly RepositoryTarget[]
): RepositoryReviewScope | undefined {
  const gitRepositories = repositories.filter(
    (repository) => repository.providerId === "git"
  );
  if (gitRepositories.length !== 1) return undefined;
  return resolveRepositoryReviewScope(gitRepositories[0]);
}
