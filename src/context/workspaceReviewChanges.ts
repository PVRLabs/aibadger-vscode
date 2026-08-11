import { buildRepositoryReviewPayload } from "./repositoryReviewChanges";
import { buildReviewPayload } from "../review/reviewPayload";
import { MAX_REVIEW_PAYLOAD_BYTES, REVIEW_TASK } from "../review/reviewPayloadPolicy";
import { workspaceRepositories } from "../review/workspaceReviewContract";

export const WORKSPACE_REVIEW_NO_CHANGE_MESSAGE = "No workspace changes to copy for review.";
export const WORKSPACE_REVIEW_FAILED_MESSAGE = "Could not prepare all workspace changes for review.";
export const WORKSPACE_REVIEW_OVERFLOW_MESSAGE = "The workspace review request is too large to copy.";
export const WORKSPACE_REVIEW_COPY_FAILURE_MESSAGE = "Could not write the workspace review request to the clipboard.";

export type WorkspaceReviewDeps = {
  buildRepository?: typeof buildRepositoryReviewPayload;
  writeClipboard(text: string): Promise<void>;
  showInformationMessage(message: string): void;
  showErrorMessage(message: string): void;
};

function header(id: string, label: string): string {
  return `[REPOSITORY ${id}: ${label}]`;
}

export async function copyWorkspaceChangesForReview(
  changedRepositoryRoots: readonly string[],
  deps: WorkspaceReviewDeps
): Promise<void> {
  const repositories = workspaceRepositories(changedRepositoryRoots);
  if (repositories.length === 0) {
    deps.showInformationMessage(WORKSPACE_REVIEW_NO_CHANGE_MESSAGE);
    return;
  }

  const framing = `[TASK]\n${REVIEW_TASK}\n\n[WORKSPACE REVIEW CONTEXT]\n`;
  const framingBytes = Buffer.byteLength(framing, "utf8") + repositories.reduce(
    (total, repository) => total + Buffer.byteLength(`\n\n${header(repository.id, repository.label)}\n`, "utf8"),
    0
  );
  const perRepositoryBytes = Math.floor((MAX_REVIEW_PAYLOAD_BYTES - framingBytes) / repositories.length);
  if (perRepositoryBytes <= 0) {
    deps.showErrorMessage(WORKSPACE_REVIEW_OVERFLOW_MESSAGE);
    return;
  }

  const buildRepository = deps.buildRepository ?? buildRepositoryReviewPayload;
  const results = await Promise.all(repositories.map((repository) =>
    buildRepository({
      kind: "repository",
      repositoryId: repository.id,
      repositoryRoot: repository.repositoryRoot,
    }, {
      buildPayload: (diff, files) => buildReviewPayload(diff, files, { maxPayloadBytes: perRepositoryBytes }),
    }).catch(() => ({ ok: false as const, reason: "git-failed" as const }))
  ));

  if (results.some((result) => !result.ok && result.reason === "mandatory-overflow")) {
    deps.showErrorMessage(WORKSPACE_REVIEW_OVERFLOW_MESSAGE);
    return;
  }
  if (results.some((result) => !result.ok)) {
    deps.showErrorMessage(WORKSPACE_REVIEW_FAILED_MESSAGE);
    return;
  }

  const successful = results.filter((result) => result.ok);
  const nestedTaskPrefix = `[TASK]\n${REVIEW_TASK}\n\n`;
  const payload = framing + successful.map((result, index) =>
    `\n\n${header(repositories[index].id, repositories[index].label)}\n${result.payload.startsWith(nestedTaskPrefix) ? result.payload.slice(nestedTaskPrefix.length) : result.payload}`
  ).join("");
  if (Buffer.byteLength(payload, "utf8") > MAX_REVIEW_PAYLOAD_BYTES) {
    deps.showErrorMessage(WORKSPACE_REVIEW_OVERFLOW_MESSAGE);
    return;
  }

  try {
    await deps.writeClipboard(payload);
  } catch {
    deps.showErrorMessage(WORKSPACE_REVIEW_COPY_FAILURE_MESSAGE);
    return;
  }
  const changedFiles = successful.reduce((total, result) => total + result.changedFiles.length, 0);
  deps.showInformationMessage(
    `Copied workspace review request for ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"} and ${changedFiles} changed ${changedFiles === 1 ? "file" : "files"}. Nothing is shared until you paste it.`
  );
}
