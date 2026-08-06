/**
 * Phase 2 repository-review surface contract.
 *
 * This describes the commands and target resolution for the repository review
 * integration. Runtime registration lives in extension.ts.
 */

export const COPY_ALL_CHANGES_FOR_REVIEW_COMMAND =
  "aiBadger.copyAllChangesForReview";
export const DEEP_REVIEW_COMMAND = "aiBadger.deepReview";

export const COPY_ALL_CHANGES_FOR_REVIEW_TITLE =
  "AI Badger: Copy All Changes for Review";
export const DEEP_REVIEW_TITLE = "AI Badger: Deep Review";

export const COPY_ACTION_ICON = "media/copy.svg";
export const BADGER_ACTION_ICON = "media/copy-two-step.svg";

export const SCM_REPOSITORY_MENU = "scm/sourceControl";
export const EXPLORER_SELECTION_MENU = "explorer/context";

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

export type RepositoryReviewContract = {
  direct: {
    command: string;
    title: string;
    icon: string;
    menu: string;
    scope: "one-source-control-repository";
    requiresBadger: false;
  };
  assisted: {
    command: string;
    title: string;
    icon: string;
    menu: string;
    scope: "one-source-control-repository";
    requiresBadger: true;
    initialState: "guidance";
  };
  explorer: {
    menu: string;
    scope: "explicit-explorer-selection";
    viewTitleIsNotSelection: true;
  };
};

export const REPOSITORY_REVIEW_CONTRACT: RepositoryReviewContract = {
  direct: {
    command: COPY_ALL_CHANGES_FOR_REVIEW_COMMAND,
    title: COPY_ALL_CHANGES_FOR_REVIEW_TITLE,
    icon: COPY_ACTION_ICON,
    menu: SCM_REPOSITORY_MENU,
    scope: "one-source-control-repository",
    requiresBadger: false,
  },
  assisted: {
    command: DEEP_REVIEW_COMMAND,
    title: DEEP_REVIEW_TITLE,
    icon: BADGER_ACTION_ICON,
    menu: SCM_REPOSITORY_MENU,
    scope: "one-source-control-repository",
    requiresBadger: true,
    initialState: "guidance",
  },
  explorer: {
    menu: EXPLORER_SELECTION_MENU,
    scope: "explicit-explorer-selection",
    viewTitleIsNotSelection: true,
  },
};
