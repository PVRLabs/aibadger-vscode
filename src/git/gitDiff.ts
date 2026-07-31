import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

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
