import * as path from "node:path";
import { stat as nodeStat } from "node:fs/promises";
import {
  generateSelectedGitDiff,
  getGitChangeMetadata,
  type GitDiffDeps,
  type GitChangeMetadata,
} from "../git/gitDiff";
import {
  buildReviewPayload,
  type ReviewPayloadFile,
  type ReviewFileStatus,
} from "../review/reviewPayload";
import type { RepositoryReviewScope } from "../review/repositoryReviewContract";

export type RepositoryReviewResult =
  | {
      ok: true;
      payload: string;
      changedFiles: string[];
      includedFiles: string[];
      statuses: ReviewFileStatus[];
    }
  | {
      ok: false;
      reason:
        | "no-change"
        | "invalid-root"
        | "git-unavailable"
        | "git-failed"
        | "mandatory-overflow";
      byteLength?: number;
    };

export type RepositoryReviewDeps = {
  statRepositoryRoot?: (repositoryRoot: string) => Promise<{ isDirectory: boolean }>;
  git?: GitDiffDeps;
  getChangeMetadata?: typeof getGitChangeMetadata;
  generateDiff?: typeof generateSelectedGitDiff;
  buildPayload?: typeof buildReviewPayload;
};

const repositoryRootStat = async (repositoryRoot: string): Promise<{ isDirectory: boolean }> => {
  const info = await nodeStat(repositoryRoot);
  return { isDirectory: info.isDirectory() };
};

function isRepositoryReviewScope(value: unknown): value is RepositoryReviewScope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RepositoryReviewScope>;
  return candidate.kind === "repository" &&
    typeof candidate.repositoryId === "string" &&
    candidate.repositoryId.length > 0 &&
    typeof candidate.repositoryRoot === "string" &&
    candidate.repositoryRoot.length > 0;
}

function orderedDiffPaths(changes: readonly GitChangeMetadata[]): string[] {
  const paths = new Set<string>();
  for (const change of changes) {
    if (change.changeKind === "untracked") continue;
    for (const diffPath of change.diffPaths) paths.add(diffPath);
  }
  return [...paths];
}

function reviewFile(
  repositoryRoot: string,
  change: GitChangeMetadata,
  binaryPaths: ReadonlySet<string>
): ReviewPayloadFile {
  return {
    uri: { fsPath: path.join(repositoryRoot, change.selectedPath) },
    relativePath: change.selectedPath,
    changeKind: change.changeKind,
    isDeleted: change.changeKind === "deleted",
    isBinary: binaryPaths.has(change.selectedPath),
  };
}

/**
 * Build the complete review payload for all current changes in one Git
 * repository. This is intentionally UI-independent: callers supply the
 * repository target, and this function never consults VS Code, Badger, or
 * the clipboard.
 */
export async function buildRepositoryReviewPayload(
  scope: RepositoryReviewScope,
  deps: RepositoryReviewDeps = {}
): Promise<RepositoryReviewResult> {
  if (!isRepositoryReviewScope(scope)) {
    return { ok: false, reason: "invalid-root" };
  }

  const statRepositoryRoot = deps.statRepositoryRoot ?? repositoryRootStat;
  try {
    const rootStat = await statRepositoryRoot(scope.repositoryRoot);
    if (!rootStat.isDirectory) return { ok: false, reason: "invalid-root" };
  } catch {
    return { ok: false, reason: "invalid-root" };
  }

  const getChangeMetadata = deps.getChangeMetadata ?? getGitChangeMetadata;
  const metadata = await getChangeMetadata(scope.repositoryRoot, deps.git);
  if (!metadata.ok) return { ok: false, reason: metadata.reason };
  if (metadata.changes.size === 0) return { ok: false, reason: "no-change" };

  const changes = [...metadata.changes.values()];
  const diffPaths = orderedDiffPaths(changes);
  const generateDiff = deps.generateDiff ?? generateSelectedGitDiff;
  const diff = diffPaths.length > 0
    ? await generateDiff(scope.repositoryRoot, diffPaths, deps.git)
    : { ok: true as const, patch: "", binaryPaths: [] };
  if (!diff.ok) {
    return diff.reason === "no-files" || diff.reason === "no-diff"
      ? { ok: false, reason: "no-change" }
      : { ok: false, reason: diff.reason };
  }

  const binaryPaths = new Set(diff.binaryPaths ?? []);
  const files = changes.map((change) => reviewFile(scope.repositoryRoot, change, binaryPaths));
  const buildPayload = deps.buildPayload ?? buildReviewPayload;
  const payload = await buildPayload(diff.patch, files);
  if (!payload.ok) {
    return {
      ok: false,
      reason: "mandatory-overflow",
      byteLength: payload.byteLength,
    };
  }
  return {
    ok: true,
    payload: payload.payload,
    changedFiles: files.map((file) => file.relativePath),
    includedFiles: payload.includedFiles,
    statuses: payload.statuses,
  };
}
