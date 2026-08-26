import { repositoryLabel } from "./reviewPayload";

export const COPY_WORKSPACE_CHANGES_FOR_REVIEW_COMMAND =
  "aiBadger.copyWorkspaceChangesForReview";
export const COPY_WORKSPACE_CHANGES_FOR_REVIEW_TITLE =
  "AI Badger: Copy Workspace Changes for Review";

export type WorkspaceRepository = {
  id: string;
  label: string;
  repositoryRoot: string;
};

export function workspaceRepositories(
  roots: readonly string[]
): WorkspaceRepository[] {
  const ordered = [...new Set(roots)].sort((a, b) => a.localeCompare(b));
  return ordered.map((repositoryRoot, index) => {
    return {
      id: `repo-${index + 1}`,
      label: repositoryLabel(repositoryRoot),
      repositoryRoot,
    };
  });
}
