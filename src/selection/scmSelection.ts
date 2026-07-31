export type ScmUri = {
  fsPath: string;
  scheme?: string;
  toString(): string;
};

export type ScmResource = {
  resourceUri: ScmUri;
};

export type ScmSelectionResult =
  | { ok: true; uris: ScmUri[] }
  | { ok: false; reason: "no-files" | "non-file-resource" };

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

/**
 * Normalize the arguments supplied by `scm/resourceState/context`.
 *
 * VS Code supplies the clicked SourceControlResourceState first and, for a
 * multi-selection, the selected SourceControlResourceState values as the
 * second argument. The clicked resource is authoritative when it is not in
 * that array. Only file URIs are accepted; there is deliberately no fallback
 * to the active editor or Explorer selection.
 */
export function resolveScmSelection(
  clicked: ScmResource | undefined,
  selected: readonly ScmResource[] | undefined
): ScmSelectionResult {
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
