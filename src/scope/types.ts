/**
 * Resolved Badger invocation target.
 * projectRoot is absolute; scope is root-relative using `/` separators when present.
 */
export type ScopeTarget = {
  projectRoot: string;
  scope?: string;
};

export type ResolveErrorKind =
  | "noWorkspace"
  | "outsideWorkspace"
  | "cancelled";

export type ResolveError = {
  kind: ResolveErrorKind;
};

export type ResolveResult =
  | { ok: true; target: ScopeTarget }
  | { ok: false; error: ResolveError };

/** Minimal workspace folder shape for pure resolution (no vscode import). */
export type WorkspaceFolderRef = {
  name: string;
  fsPath: string;
};

export type ResolveScopeDeps = {
  /** Open workspace folders, in VS Code order. */
  getWorkspaceFolders: () => readonly WorkspaceFolderRef[] | undefined;
  /** Containing workspace folder for an absolute resource path, if any. */
  getWorkspaceFolderForPath: (
    resourcePath: string
  ) => WorkspaceFolderRef | undefined;
  /**
   * Multi-root unscoped picker. Return undefined when the user cancels.
   * Only called when more than one folder is open and no resource is selected.
   */
  pickWorkspaceFolder: (
    folders: readonly WorkspaceFolderRef[]
  ) => Promise<WorkspaceFolderRef | undefined>;
};
