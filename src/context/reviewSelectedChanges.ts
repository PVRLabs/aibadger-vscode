import type * as vscode from "vscode";
import * as path from "node:path";
import {
  generateSelectedGitDiff,
  getSelectedGitChangeMetadata,
  canonicalizeSelectedPath,
  resolveGitRepositoryRoot,
  type GitDiffDeps,
} from "../git/gitDiff";
import {
  buildReviewPayload,
  type ReviewChangeKind,
  type ReviewPayloadFile,
  type ReviewPayloadResult,
} from "../review/reviewPayload";
import {
  resolveScmSelection,
  type ScmResource,
  type ScmSelectionDeps,
  type ScmUri,
} from "../selection/scmSelection";

export const REVIEW_SELECTED_CHANGES_COMMAND = "aiBadger.reviewSelectedChanges";

export type ReviewScmResource = ScmResource;

export type ReviewSelectedChangesDeps = {
  selection: ScmSelectionDeps;
  git?: GitDiffDeps;
  generateDiff?: typeof generateSelectedGitDiff;
  getChangeMetadata?: typeof getSelectedGitChangeMetadata;
  buildPayload?: typeof buildReviewPayload;
  writeClipboard(text: string): Promise<void>;
  showInformationMessage(message: string): void;
  showErrorMessage(message: string): void;
};

const ERROR_MESSAGES: Record<string, string> = {
  "no-files": "Select one or more changed Git files to review.",
  "non-file-resource": "Review Selected Changes supports Git files only.",
  folder: "Select files, not folders, from Git Source Control.",
  "missing-file": "A selected Git file is no longer available.",
  "stat-failed": "Could not inspect the selected Git files.",
  "repository-root-unresolved": "Could not resolve the selected Git repository.",
  "cross-repository": "Selected files must belong to the same Git repository.",
  "invalid-path": "A selected Git file has an invalid repository-relative path.",
  "no-diff": "The selected files have no current Git changes.",
  "git-unavailable": "Git is unavailable. Install Git or check your PATH.",
  "git-failed": "Git could not generate a diff for the selected files.",
};

function errorMessage(reason: string): string {
  return ERROR_MESSAGES[reason] ?? "Could not prepare the selected changes for review.";
}

function selectedCountMessage(count: number): string {
  return count === 1
    ? "Copied review request for 1 selected file. Nothing is shared until you paste it."
    : `Copied review request for ${count} selected files. Nothing is shared until you paste it.`;
}

function asScmResource(
  resource: vscode.SourceControlResourceState | undefined
): ReviewScmResource | undefined {
  if (!resource) return undefined;
  return {
    resourceUri: resource.resourceUri as unknown as ScmUri,
    isDeleted: Boolean(resource.decorations?.strikeThrough),
  };
}

function statusFailure(result: { reason: "git-unavailable" | "git-failed" }): string {
  return errorMessage(result.reason);
}

export async function reviewSelectedChanges(
  clicked: vscode.SourceControlResourceState | undefined,
  selected: unknown,
  deps: ReviewSelectedChangesDeps
): Promise<void> {
  let stage = "selection";
  try {
    const clickedResource = asScmResource(clicked);
    const selectedResources = Array.isArray(selected)
      ? selected.map(asScmResource).filter(
          (resource): resource is ReviewScmResource => resource !== undefined
        )
      : undefined;
    const resolved = await resolveScmSelection(clickedResource, selectedResources, deps.selection);
    if (!resolved.ok) {
      deps.showErrorMessage(errorMessage(resolved.reason));
      return;
    }

    const selectedPaths = resolved.value.files.map((file) => file.relativePath);
    stage = "Git status";
    const getChangeMetadata = deps.getChangeMetadata ?? getSelectedGitChangeMetadata;
    const metadata = await getChangeMetadata(
      resolved.value.repositoryRoot,
      selectedPaths,
      deps.git
    );
    if (!metadata.ok) {
      deps.showErrorMessage(statusFailure(metadata));
      return;
    }

    const diffPaths = resolved.value.files.flatMap((file) =>
      metadata.changes.get(file.relativePath)?.diffPaths ?? [file.relativePath]
    );
    stage = "Git diff";
    const generateDiff = deps.generateDiff ?? generateSelectedGitDiff;
    const diff = await generateDiff(resolved.value.repositoryRoot, diffPaths, deps.git);
    if (!diff.ok) {
      deps.showErrorMessage(errorMessage(diff.reason));
      return;
    }

    const files: ReviewPayloadFile[] = resolved.value.files.map((file) => ({
      uri: file.uri,
      relativePath: file.relativePath,
      isDeleted: file.isDeleted,
      changeKind: metadata.changes.get(file.relativePath)?.changeKind as ReviewChangeKind | undefined,
    }));
    stage = "review payload";
    const buildPayload = deps.buildPayload ?? buildReviewPayload;
    const payload: ReviewPayloadResult = await buildPayload(diff.patch, files);
    if (!payload.ok) {
      deps.showErrorMessage(
        "The selected review request is too large to copy. Select fewer files and try again."
      );
      return;
    }

    try {
      await deps.writeClipboard(payload.payload);
    } catch {
      deps.showErrorMessage("Could not write the review request to the clipboard.");
      return;
    }
    deps.showInformationMessage(selectedCountMessage(files.length));
  } catch {
    deps.showErrorMessage(`Could not prepare selected changes for review (${stage}).`);
  }
}

export function createReviewSelectedChangesSelectionDeps(
  vscodeApi: typeof import("vscode")
): ScmSelectionDeps {
  return {
    stat: async (uri) => {
      const stat = await vscodeApi.workspace.fs.stat(uri as vscode.Uri);
      return { isFile: (stat.type & vscodeApi.FileType.File) !== 0 };
    },
    getRepositoryRoot: (uri) => resolveGitRepositoryRoot(uri.fsPath),
    getRelativePath: async (uri, root) => {
      const physicalPath = await canonicalizeSelectedPath(uri.fsPath);
      return physicalPath ? path.relative(root, physicalPath) : "";
    },
  };
}
