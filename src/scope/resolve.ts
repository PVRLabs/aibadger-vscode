import { relativeScope } from "./paths";
import type {
  ResolveResult,
  ResolveScopeDeps,
  ScopeTarget,
  WorkspaceFolderRef,
} from "./types";

/**
 * Resolve a selected file or folder into { projectRoot, scope? }.
 * The selected path must belong to an open workspace folder.
 */
export function resolveSelectedResource(
  resourcePath: string,
  deps: Pick<ResolveScopeDeps, "getWorkspaceFolderForPath">
): ResolveResult {
  const folder = deps.getWorkspaceFolderForPath(resourcePath);
  if (!folder) {
    return { ok: false, error: { kind: "outsideWorkspace" } };
  }

  const projectRoot = folder.fsPath;
  const scope = relativeScope(projectRoot, resourcePath);
  const target: ScopeTarget = scope
    ? { projectRoot, scope }
    : { projectRoot };

  return { ok: true, target };
}

/**
 * Resolve an unscoped (project / toolbar) request.
 * Single folder → that root. Multiple → picker. None → noWorkspace.
 * User cancel from the picker → cancelled (silent).
 */
export async function resolveUnscopedProject(
  deps: ResolveScopeDeps
): Promise<ResolveResult> {
  const folders = deps.getWorkspaceFolders();
  if (!folders || folders.length === 0) {
    return { ok: false, error: { kind: "noWorkspace" } };
  }

  if (folders.length === 1) {
    return {
      ok: true,
      target: { projectRoot: folders[0].fsPath },
    };
  }

  const picked = await deps.pickWorkspaceFolder(folders);
  if (!picked) {
    return { ok: false, error: { kind: "cancelled" } };
  }

  return {
    ok: true,
    target: { projectRoot: picked.fsPath },
  };
}

/**
 * User-facing messages for non-silent resolve failures.
 * Cancellation has no message.
 */
export function messageForResolveError(
  kind: "noWorkspace" | "outsideWorkspace"
): string {
  switch (kind) {
    case "noWorkspace":
      return "AI Badger: No workspace folder is open.";
    case "outsideWorkspace":
      return "AI Badger: Selected item is outside any open workspace folder.";
  }
}

/** Convenience for tests and temporary handler display. */
export function formatScopeTarget(target: ScopeTarget): string {
  if (target.scope) {
    return `root=${target.projectRoot} scope=${target.scope}`;
  }
  return `root=${target.projectRoot} (project)`;
}

export type { ResolveResult, ScopeTarget, WorkspaceFolderRef };
