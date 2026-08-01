export type ScmUri = {
  fsPath: string;
  scheme?: string;
  toString(): string;
};

export type ScmResource = {
  resourceUri: ScmUri;
  /** VS Code SCM decoration can identify a deleted path after it leaves disk. */
  isDeleted?: boolean;
};

export type ScmSelectionError =
  | "no-files"
  | "non-file-resource"
  | "folder"
  | "missing-file"
  | "stat-failed"
  | "repository-root-unresolved"
  | "cross-repository"
  | "invalid-path";

export type ResolvedScmFile = {
  uri: ScmUri;
  relativePath: string;
  isDeleted?: boolean;
};

export type ResolvedScmSelection = {
  repositoryRoot: string;
  files: ResolvedScmFile[];
};

export type ScmSelectionResult =
  | { ok: true; value: ResolvedScmSelection }
  | { ok: false; reason: ScmSelectionError };

export type ScmSelectionDeps = {
  stat(uri: ScmUri): Promise<{ isFile: boolean }>;
  getRepositoryRoot(uri: ScmUri): Promise<string | undefined>;
  getRelativePath(uri: ScmUri, repositoryRoot: string): string | Promise<string>;
};

function isMissingPathError(code: string | undefined): boolean {
  return code === "ENOENT" || code === "FileNotFound" ||
    code === "ENOTDIR" || code === "FileNotADirectory";
}

function uriKey(uri: ScmUri): string {
  return uri.toString();
}

function dedupe(uris: readonly ScmUri[]): ScmUri[] {
  const seen = new Set<string>();
  return uris.filter((uri) => {
    const key = uriKey(uri);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeRelativePath(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return undefined;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    return undefined;
  }
  return segments.filter((segment) => segment !== "." && segment !== "").join("/") || undefined;
}

/** Normalize SCM context arguments without falling back to another selection source. */
export function resolveScmUris(
  clicked: ScmResource | undefined,
  selected: readonly ScmResource[] | undefined
): { ok: true; uris: ScmUri[] } | { ok: false; reason: "no-files" | "non-file-resource" } {
  const selectedUris = selected?.map((resource) => resource.resourceUri);
  const clickedUri = clicked?.resourceUri;
  const uris = clickedUri
    ? selectedUris?.some((uri) => uriKey(uri) === uriKey(clickedUri))
      ? dedupe(selectedUris ?? [])
      : [clickedUri]
    : dedupe(selectedUris ?? []);

  if (uris.length === 0) {
    return { ok: false, reason: "no-files" };
  }
  if (uris.some((uri) => uri.scheme !== undefined && uri.scheme !== "file")) {
    return { ok: false, reason: "non-file-resource" };
  }
  return { ok: true, uris };
}

/** Resolve SCM files to one Git root and stable root-relative POSIX paths. */
export async function resolveScmSelection(
  clicked: ScmResource | undefined,
  selected: readonly ScmResource[] | undefined,
  deps: ScmSelectionDeps
): Promise<ScmSelectionResult> {
  const normalized = resolveScmUris(clicked, selected);
  if (!normalized.ok) {
    return normalized;
  }

  const files: ResolvedScmFile[] = [];
  let repositoryRoot: string | undefined;
  const seenPaths = new Set<string>();
  const deletedUris = new Set(
    [clicked, ...(selected ?? [])]
      .filter((resource): resource is ScmResource => Boolean(resource?.isDeleted))
      .map((resource) => uriKey(resource.resourceUri))
  );
  for (const uri of normalized.uris) {
    let fileStat: { isFile: boolean };
    let resolvedAsDeleted = false;
    try {
      fileStat = await deps.stat(uri);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (isMissingPathError(code)) {
        if (deletedUris.has(uriKey(uri))) {
          // A deleted SCM resource is intentionally allowed to reach Git. Git
          // is authoritative for its deletion patch and the path is still
          // available through resourceUri.
          fileStat = { isFile: true };
          resolvedAsDeleted = true;
        } else {
          return { ok: false, reason: "missing-file" };
        }
      } else {
        return { ok: false, reason: "stat-failed" };
      }
    }
    if (!fileStat.isFile) {
      return { ok: false, reason: "folder" };
    }
    const root = await deps.getRepositoryRoot(uri);
    if (!root) {
      return { ok: false, reason: "repository-root-unresolved" };
    }
    if (repositoryRoot && repositoryRoot !== root) {
      return { ok: false, reason: "cross-repository" };
    }
    repositoryRoot = root;
    const relativePath = normalizeRelativePath(await deps.getRelativePath(uri, root));
    if (!relativePath) {
      return { ok: false, reason: "invalid-path" };
    }
    if (!seenPaths.has(relativePath)) {
      seenPaths.add(relativePath);
      files.push({ uri, relativePath, ...(resolvedAsDeleted ? { isDeleted: true } : {}) });
    }
  }

  if (!repositoryRoot || files.length === 0) {
    return { ok: false, reason: "no-files" };
  }
  return { ok: true, value: { repositoryRoot, files } };
}
