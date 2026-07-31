/**
 * Git diff contract for selected SCM files:
 *
 * - repositories with a valid HEAD use `git diff HEAD`, so staged and later
 *   unstaged edits are represented together as the current working-tree
 *   change from HEAD;
 * - an unborn repository has no valid HEAD. The caller must use
 *   `buildUnbornRepositoryDiffArgv`, which compares each selected existing
 *   working-tree file with `/dev/null`; this captures the final file contents
 *   regardless of whether the resource is staged, unstaged, or both;
 * - untracked files use `git diff --no-index /dev/null <path>` and are
 *   normalized by the caller as additions. A nonempty successful patch exits
 *   with status 1 (`NO_INDEX_DIFF_EXIT_CODE`), which is not an error;
 * - every path follows `--`, and argv is passed directly to Git (no shell);
 * - the selected paths are the only pathspecs supplied to Git.
 */
export function buildTrackedDiffArgv(paths: readonly string[]): string[] {
  return [
    "diff",
    "--no-ext-diff",
    "--binary",
    "--full-index",
    "--find-renames",
    "HEAD",
    "--",
    ...paths,
  ];
}

export function buildUntrackedDiffArgv(path: string): string[] {
  return ["diff", "--no-ext-diff", "--binary", "--full-index", "--no-index", "/dev/null", path];
}

export const NO_INDEX_DIFF_EXIT_CODE = 1;

export function buildUnbornRepositoryDiffArgv(paths: readonly string[]): string[][] {
  return paths.map(buildUntrackedDiffArgv);
}
