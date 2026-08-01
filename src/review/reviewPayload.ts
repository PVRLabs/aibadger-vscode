import { open as nodeOpen } from "node:fs/promises";
import { MAX_REVIEW_FILE_BYTES, MAX_REVIEW_PAYLOAD_BYTES, REVIEW_TASK } from "./reviewPayloadPolicy";

export type ReviewChangeKind =
  | "modified"
  | "tracked-added"
  | "deleted"
  | "untracked"
  | "renamed"
  | "binary";

export type ReviewPayloadFile = {
  uri: { fsPath: string };
  relativePath: string;
  changeKind?: ReviewChangeKind;
  isDeleted?: boolean;
};

export type ReviewPayloadReadDeps = {
  openFile?: (path: string) => Promise<ReviewFileHandle>;
};

type ReviewFileMetadata = {
  size: number;
  mtimeMs: number;
  ino?: number;
};

type ReviewFileHandle = {
  stat(): Promise<ReviewFileMetadata>;
  read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
};

export type ReviewPayloadResult =
  | { ok: true; payload: string; includedFiles: string[]; statuses: ReviewFileStatus[] }
  | { ok: false; reason: "mandatory-overflow"; byteLength: number };

export type ReviewFileStatus = { path: string; reason: string };

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function fullFileLimitDescription(): string {
  const kib = MAX_REVIEW_FILE_BYTES / 1024;
  return `file exceeds ${Number.isInteger(kib) ? kib : MAX_REVIEW_FILE_BYTES} ${Number.isInteger(kib) ? "KiB" : "bytes"} full-file limit`;
}

type BoundedReadResult =
  | { kind: "eligible"; bytes: Uint8Array }
  | { kind: "oversized" }
  | { kind: "changed" }
  | { kind: "failed" };

function sameMetadata(before: ReviewFileMetadata, after: ReviewFileMetadata): boolean {
  return before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino;
}

async function readBounded(handle: ReviewFileHandle): Promise<BoundedReadResult> {
  const bytes = new Uint8Array(MAX_REVIEW_FILE_BYTES + 1);
  try {
    const before = await handle.stat();
    let total = 0;
    while (total < bytes.length) {
      const result = await handle.read(bytes, total, bytes.length - total, total);
      if (result.bytesRead === 0) break;
      total += result.bytesRead;
    }
    const after = await handle.stat();
    if (!sameMetadata(before, after)) return { kind: "changed" };
    if (total > MAX_REVIEW_FILE_BYTES) return { kind: "oversized" };
    return { kind: "eligible", bytes: bytes.subarray(0, total) };
  } catch {
    return { kind: "failed" };
  } finally {
    try {
      await handle.close();
    } catch {
      // A close failure does not expose a handle or payload in diagnostics.
    }
  }
}

async function openReviewFile(path: string): Promise<ReviewFileHandle> {
  const handle = await nodeOpen(path, "r");
  return handle as unknown as ReviewFileHandle;
}

function fileBlock(path: string, contents: string): string {
  const normalized = contents.endsWith("\n") ? contents : `${contents}\n`;
  return `--- File: ${path} (Full File) ---\n${normalized}--- End File ---`;
}

function statusBlock(statuses: readonly ReviewFileStatus[]): string {
  return [
    "[FILE CONTEXT STATUS]",
    ...statuses.map((status) => `- ${status.path} — diff only: ${status.reason}`),
  ].join("\n");
}

function render(diff: string, blocks: readonly string[], statuses: readonly ReviewFileStatus[]): string {
  return [
    `[TASK]\n${REVIEW_TASK}`,
    `[REVIEW CONTEXT: SELECTED GIT DIFF]\n${diff}`,
    ...(blocks.length > 0 ? [`[CONTEXT]\n${blocks.join("\n\n")}`] : []),
    statusBlock(statuses),
  ].join("\n\n") + "\n";
}

function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function statusFor(kind: ReviewChangeKind | undefined): string | undefined {
  switch (kind) {
    case "deleted": return "deleted";
    case "tracked-added": return "tracked newly added file already complete in patch";
    case "untracked": return "untracked addition already complete in patch";
    case "binary": return "binary file";
    default: return undefined;
  }
}

type OptionalCandidate = {
  file: ReviewPayloadFile;
  block: string;
};

/**
 * Build the complete clipboard review request. The diff and final status
 * section are rendered for every candidate so UTF-8 accounting includes all
 * framing, separators, headers, and footers. Optional files are considered
 * in selection order and the first candidate that does not fit stops the
 * optional pass.
 */
export async function buildReviewPayload(
  diff: string,
  files: readonly ReviewPayloadFile[],
  deps: ReviewPayloadReadDeps = {}
): Promise<ReviewPayloadResult> {
  const fixedStatuses: ReviewFileStatus[] = [];
  const candidates: OptionalCandidate[] = [];
  const openFile = deps.openFile ?? openReviewFile;

  for (const file of files) {
    const fixedReason = file.isDeleted ? "deleted" : statusFor(file.changeKind);
    if (fixedReason) {
      fixedStatuses.push({ path: file.relativePath, reason: fixedReason });
    }
  }

  const mandatory = render(diff, [], fixedStatuses);
  if (byteLength(mandatory) > MAX_REVIEW_PAYLOAD_BYTES) {
    return { ok: false, reason: "mandatory-overflow", byteLength: byteLength(mandatory) };
  }

  for (const file of files) {
    const fixedReason = file.isDeleted ? "deleted" : statusFor(file.changeKind);
    if (fixedReason) continue;
    let readResult: BoundedReadResult;
    try {
      readResult = await readBounded(await openFile(file.uri.fsPath));
    } catch {
      fixedStatuses.push({ path: file.relativePath, reason: "full file unavailable" });
      continue;
    }
    if (readResult.kind === "changed" || readResult.kind === "failed") {
      fixedStatuses.push({ path: file.relativePath, reason: "full file unavailable" });
      continue;
    }
    if (readResult.kind === "oversized") {
      fixedStatuses.push({ path: file.relativePath, reason: fullFileLimitDescription() });
      continue;
    }
    const bytes = readResult.bytes;
    if (bytes.byteLength > MAX_REVIEW_FILE_BYTES) {
      fixedStatuses.push({ path: file.relativePath, reason: fullFileLimitDescription() });
      continue;
    }
    if (!isText(bytes)) {
      fixedStatuses.push({ path: file.relativePath, reason: "binary file" });
      continue;
    }
    candidates.push({
      file,
      block: fileBlock(file.relativePath, new TextDecoder().decode(bytes)),
    });
  }

  let excludedFrom = candidates.length;
  let blocks: string[] = [];
  let includedFiles: string[] = [];
  let statuses: ReviewFileStatus[] = [];
  const fixedStatusByPath = new Map(fixedStatuses.map((status) => [status.path, status]));
  const candidateIndexByPath = new Map(candidates.map((candidate, index) => [candidate.file.relativePath, index]));
  for (;;) {
    blocks = [];
    includedFiles = [];
    const selected = new Set<string>();
    for (const [index, candidate] of candidates.entries()) {
      if (index >= excludedFrom) break;
      const nextBlocks = [...blocks, candidate.block];
      const next = render(diff, nextBlocks, fixedStatuses);
      if (byteLength(next) > MAX_REVIEW_PAYLOAD_BYTES) {
        excludedFrom = index;
        break;
      }
      blocks = nextBlocks;
      includedFiles.push(candidate.file.relativePath);
      selected.add(candidate.file.relativePath);
    }

    statuses = files.flatMap((file) => {
      const fixed = fixedStatusByPath.get(file.relativePath);
      if (fixed) return [fixed];
      const index = candidateIndexByPath.get(file.relativePath);
      return index !== undefined && index >= excludedFrom && !selected.has(file.relativePath)
        ? [{ path: file.relativePath, reason: "total review-context budget reached" }]
        : [];
    });
    const payload = render(diff, blocks, statuses);
    if (byteLength(payload) <= MAX_REVIEW_PAYLOAD_BYTES) {
      return { ok: true, payload, includedFiles, statuses };
    }
    const lastIncluded = includedFiles.at(-1);
    if (!lastIncluded) {
      return { ok: false, reason: "mandatory-overflow", byteLength: byteLength(payload) };
    }
    excludedFrom = includedFiles.length - 1;
  }
}
