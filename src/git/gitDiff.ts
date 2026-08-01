import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { realpath, stat } from "node:fs/promises";
import type { ReviewChangeKind } from "../review/reviewPayload";

/** Git diff contract for selected SCM files. */
function literalPathspec(path: string): string {
  return `:(literal)${path}`;
}

export function buildTrackedDiffArgv(paths: readonly string[]): string[] {
  return [
    "diff",
    "--no-ext-diff",
    "--binary",
    "--full-index",
    "--find-renames",
    "HEAD",
    "--",
    ...paths.map(literalPathspec),
  ];
}

export function buildUntrackedDiffArgv(path: string): string[] {
  return ["diff", "--no-ext-diff", "--binary", "--full-index", "--no-index", "--", "/dev/null", path];
}

export const NO_INDEX_DIFF_EXIT_CODE = 1;

export function buildUnbornRepositoryDiffArgv(paths: readonly string[]): string[][] {
  return paths.map(buildUntrackedDiffArgv);
}

type GitProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export type GitDiffResult =
  | { ok: true; patch: string }
  | { ok: false; reason: "no-files" | "no-diff" | "git-unavailable" | "git-failed"; detail?: string };

export type GitDiffDeps = {
  spawn?: typeof nodeSpawn;
};

export type GitChangeMetadata = {
  selectedPath: string;
  changeKind: ReviewChangeKind;
  renameSourcePath?: string;
  diffPaths: string[];
};

export type GitStatusResult =
  | { ok: true; changes: Map<string, GitChangeMetadata> }
  | { ok: false; reason: "git-unavailable" | "git-failed"; detail?: string };

export function buildGitStatusMetadataArgv(): string[] {
  return ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--renames"];
}

function runGit(
  repositoryRoot: string,
  argv: readonly string[],
  spawn: typeof nodeSpawn
): Promise<GitProcessResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn("git", [...argv], {
        cwd: repositoryRoot,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ code: null, stdout: "", stderr: error instanceof Error ? error.message : "spawn failed" });
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => (stdout += chunk));
    child.stderr?.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", (error: NodeJS.ErrnoException) => {
      resolve({ code: null, stdout, stderr: error.message });
    });
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function joinPatches(patches: readonly string[]): string {
  return patches.filter((patch) => patch.length > 0).map((patch) => patch.endsWith("\n") ? patch : `${patch}\n`).join("");
}

type ExistingDirectory = {
  originalPath: string;
  physicalPath: string;
};

async function findNearestExistingDirectory(filePath: string): Promise<ExistingDirectory | undefined> {
  let directory = path.dirname(filePath);
  for (;;) {
    try {
      const info = await stat(directory);
      if (info.isDirectory()) {
        return { originalPath: directory, physicalPath: await realpath(directory) };
      }
    } catch {
      // Continue through missing or inaccessible ancestors. The filesystem
      // root terminates the search safely below.
    }
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/** Canonicalize a selected path without resolving the selected file itself. */
export async function canonicalizeSelectedPath(filePath: string): Promise<string | undefined> {
  const existing = await findNearestExistingDirectory(filePath);
  if (!existing) return undefined;
  return path.join(existing.physicalPath, path.relative(existing.originalPath, filePath));
}

/** Resolve the Git worktree containing a selected file without invoking a shell. */
export async function resolveGitRepositoryRoot(
  filePath: string,
  deps: GitDiffDeps = {}
): Promise<string | undefined> {
  const existing = await findNearestExistingDirectory(filePath);
  if (!existing) return undefined;
  const result = await runGit(
    existing.physicalPath,
    ["rev-parse", "--show-toplevel"],
    deps.spawn ?? nodeSpawn
  );
  return result.code === 0 ? result.stdout.trim() || undefined : undefined;
}

/**
 * Read repository-wide Git status metadata, then retain only selected current
 * paths. Rename records retain their source internally so the selected
 * destination can produce a complete rename diff without adding a second
 * payload file.
 */
export async function getSelectedGitChangeMetadata(
  repositoryRoot: string,
  paths: readonly string[],
  deps: GitDiffDeps = {}
): Promise<GitStatusResult> {
  const result = await runGit(
    repositoryRoot,
    buildGitStatusMetadataArgv(),
    deps.spawn ?? nodeSpawn
  );
  if (result.code === null) return { ok: false, reason: "git-unavailable", detail: result.stderr };
  if (result.code !== 0) return { ok: false, reason: "git-failed", detail: result.stderr };

  const selected = new Set(paths);
  const changes = new Map<string, GitChangeMetadata>();
  const records = result.stdout.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const status = record.slice(0, 2);
    const currentPath = record.slice(3);
    const isRename = status.includes("R") || status.includes("C");
    const sourcePath = isRename ? records[++index] : undefined;
    if (!selected.has(currentPath)) continue;
    const kind: ReviewChangeKind = status === "??"
      ? "untracked"
      : status.includes("D")
        ? "deleted"
        : status.includes("A")
          ? "tracked-added"
          : status.includes("R")
            ? "renamed"
            : "modified";
    changes.set(currentPath, {
      selectedPath: currentPath,
      changeKind: kind,
      ...(isRename && sourcePath ? { renameSourcePath: sourcePath } : {}),
      diffPaths: isRename && sourcePath ? [sourcePath, currentPath] : [currentPath],
    });
  }
  return { ok: true, changes };
}

/** Generate only the selected files' Git patch, without extension-added prose. */
export async function generateSelectedGitDiff(
  repositoryRoot: string,
  paths: readonly string[],
  deps: GitDiffDeps = {}
): Promise<GitDiffResult> {
  if (paths.length === 0) {
    return { ok: false, reason: "no-files" };
  }
  const spawn = deps.spawn ?? nodeSpawn;
  const repository = await runGit(repositoryRoot, ["rev-parse", "--is-inside-work-tree"], spawn);
  if (repository.code === null) {
    return { ok: false, reason: "git-unavailable", detail: repository.stderr };
  }
  if (repository.code !== 0 || repository.stdout.trim() !== "true") {
    return { ok: false, reason: "git-failed", detail: repository.stderr };
  }
  const head = await runGit(repositoryRoot, ["rev-parse", "--verify", "HEAD"], spawn);
  if (head.code === null) {
    return { ok: false, reason: "git-unavailable", detail: head.stderr };
  }

  const patches: string[] = [];
  let unborn = false;
  if (head.code !== 0) {
    const headRef = await runGit(repositoryRoot, ["symbolic-ref", "--quiet", "HEAD"], spawn);
    if (headRef.code === null) {
      return { ok: false, reason: "git-unavailable", detail: headRef.stderr };
    }
    if (headRef.code !== 0 || !headRef.stdout.trim()) {
      return { ok: false, reason: "git-failed", detail: head.stderr || headRef.stderr };
    }
    const branchRef = await runGit(
      repositoryRoot,
      ["show-ref", "--verify", "--quiet", headRef.stdout.trim()],
      spawn
    );
    if (branchRef.code === null) {
      return { ok: false, reason: "git-unavailable", detail: branchRef.stderr };
    }
    if (branchRef.code !== 1) {
      return { ok: false, reason: "git-failed", detail: head.stderr || branchRef.stderr };
    }
    unborn = true;
  }
  if (!unborn) {
    const tracked = await runGit(repositoryRoot, buildTrackedDiffArgv(paths), spawn);
    if (tracked.code === null) {
      return { ok: false, reason: "git-unavailable", detail: tracked.stderr };
    }
    if (tracked.code !== 0) {
      return { ok: false, reason: "git-failed", detail: tracked.stderr };
    }
    patches.push(tracked.stdout);

    const untracked = await runGit(
      repositoryRoot,
      [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ...paths.map(literalPathspec),
      ],
      spawn
    );
    if (untracked.code === null) {
      return { ok: false, reason: "git-unavailable", detail: untracked.stderr };
    }
    if (untracked.code !== 0) {
      return { ok: false, reason: "git-failed", detail: untracked.stderr };
    }
    const untrackedPaths = new Set(untracked.stdout.split("\0").filter(Boolean));
    for (const path of paths) {
      if (!untrackedPaths.has(path)) {
        continue;
      }
      const addition = await runGit(repositoryRoot, buildUntrackedDiffArgv(path), spawn);
      if (addition.code === null) {
        return { ok: false, reason: "git-unavailable", detail: addition.stderr };
      }
      if (addition.code !== 0 && addition.code !== NO_INDEX_DIFF_EXIT_CODE) {
        return { ok: false, reason: "git-failed", detail: addition.stderr };
      }
      patches.push(addition.stdout);
    }
  } else {
    for (const path of paths) {
      const addition = await runGit(repositoryRoot, buildUntrackedDiffArgv(path), spawn);
      if (addition.code === null) {
        return { ok: false, reason: "git-unavailable", detail: addition.stderr };
      }
      if (addition.code !== 0 && addition.code !== NO_INDEX_DIFF_EXIT_CODE) {
        return { ok: false, reason: "git-failed", detail: addition.stderr };
      }
      patches.push(addition.stdout);
    }
  }

  const patch = joinPatches(patches);
  return patch ? { ok: true, patch } : { ok: false, reason: "no-diff" };
}
