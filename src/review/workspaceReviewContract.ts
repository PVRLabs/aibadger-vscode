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
  const counts = new Map<string, number>();
  return ordered.map((repositoryRoot, index) => {
    const base = basename(repositoryRoot) || "repository";
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    return {
      id: `repo-${index + 1}`,
      label: occurrence === 1 ? base : `${base} (${occurrence})`,
      repositoryRoot,
    };
  });
}

function basename(root: string): string {
  const normalized = root.replaceAll("\\", "/").replace(/\/$/u, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}
