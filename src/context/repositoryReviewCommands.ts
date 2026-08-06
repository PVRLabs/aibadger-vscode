import { formatByteSize } from "../flow/promptSummary";
import { buildRepositoryReviewPayload } from "./repositoryReviewChanges";
import {
  resolveRepositoryReviewScope,
  resolveSingleGitRepositoryReviewScope,
  type RepositoryTarget,
  type RepositoryReviewScope,
} from "../review/repositoryReviewContract";

export const REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE =
  "Could not identify the Git repository for this action.";
export const REPOSITORY_REVIEW_AMBIGUOUS_TARGET_MESSAGE =
  "Select a repository-specific Source Control action when multiple Git repositories are open.";
export const REPOSITORY_REVIEW_NO_CHANGE_MESSAGE =
  "No current changes to copy for review.";
export const REPOSITORY_REVIEW_INVALID_ROOT_MESSAGE =
  "The selected Git repository is no longer available.";
export const REPOSITORY_REVIEW_GIT_UNAVAILABLE_MESSAGE =
  "Git is unavailable. Install Git or check your PATH.";
export const REPOSITORY_REVIEW_GIT_FAILED_MESSAGE =
  "Git could not prepare the repository changes for review.";
export const REPOSITORY_REVIEW_OVERFLOW_MESSAGE =
  "The repository review request is too large to copy.";
export const REPOSITORY_REVIEW_COPY_FAILURE_MESSAGE =
  "Could not write the review request to the clipboard.";

export type RepositoryReviewCommandDeps = {
  buildPayload?: typeof buildRepositoryReviewPayload;
  writeClipboard(text: string): Promise<void>;
  showInformationMessage(message: string): void;
  showErrorMessage(message: string): void;
};

export function resolveRepositoryReviewCommandTarget(
  target: unknown,
  repositories: readonly RepositoryTarget[] = []
): unknown {
  if (target !== undefined) return target;
  const scope = resolveSingleGitRepositoryReviewScope(repositories);
  return scope ? {
    id: scope.repositoryId,
    rootUri: { fsPath: scope.repositoryRoot },
  } : undefined;
}

export function repositoryReviewSuccessMessage(
  count: number,
  byteLength: number
): string {
  const files = count === 1 ? "1 changed file" : `${count} changed files`;
  return `Copied review request for ${files} (${formatByteSize(byteLength)}). Nothing is shared until you paste it.`;
}

function failureMessage(reason: string): string {
  switch (reason) {
    case "no-change":
      return REPOSITORY_REVIEW_NO_CHANGE_MESSAGE;
    case "invalid-root":
      return REPOSITORY_REVIEW_INVALID_ROOT_MESSAGE;
    case "git-unavailable":
      return REPOSITORY_REVIEW_GIT_UNAVAILABLE_MESSAGE;
    case "git-failed":
      return REPOSITORY_REVIEW_GIT_FAILED_MESSAGE;
    case "mandatory-overflow":
      return REPOSITORY_REVIEW_OVERFLOW_MESSAGE;
    default:
      return REPOSITORY_REVIEW_GIT_FAILED_MESSAGE;
  }
}

/** Copy all current changes for exactly the SourceControl target VS Code supplied. */
export async function copyAllChangesForReview(
  target: unknown,
  deps: RepositoryReviewCommandDeps,
  repositories: readonly RepositoryTarget[] = []
): Promise<void> {
  const resolvedTarget = resolveRepositoryReviewCommandTarget(target, repositories);
  const scope = resolveRepositoryReviewScope(resolvedTarget);
  if (!scope) {
    deps.showErrorMessage(
      target === undefined && repositories.length > 0
        ? REPOSITORY_REVIEW_AMBIGUOUS_TARGET_MESSAGE
        : REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE
    );
    return;
  }

  let result;
  try {
    result = await (deps.buildPayload ?? buildRepositoryReviewPayload)(scope);
  } catch {
    deps.showErrorMessage(REPOSITORY_REVIEW_GIT_FAILED_MESSAGE);
    return;
  }
  if (!result.ok) {
    deps.showErrorMessage(failureMessage(result.reason));
    return;
  }

  try {
    await deps.writeClipboard(result.payload);
  } catch {
    deps.showErrorMessage(REPOSITORY_REVIEW_COPY_FAILURE_MESSAGE);
    return;
  }
  deps.showInformationMessage(
    repositoryReviewSuccessMessage(
      result.changedFiles.length,
      Buffer.byteLength(result.payload, "utf8")
    )
  );
}

export type { RepositoryReviewScope };
