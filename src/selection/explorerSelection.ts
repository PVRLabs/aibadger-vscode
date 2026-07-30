export type SelectionUri = {
  fsPath: string;
  toString(): string;
};

export type ResolvedExplorerSelection = {
  uris: SelectionUri[];
  preserveOrder: boolean;
};

function uriKey(uri: SelectionUri): string {
  return uri.toString();
}

function dedupeUris(uris: readonly SelectionUri[]): SelectionUri[] {
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

/** Normalize Explorer, editor, and Command Palette file selections. */
export function resolveExplorerSelection(
  clickedUri: SelectionUri | undefined,
  selectedUris: readonly SelectionUri[] | undefined,
  activeFileUri: SelectionUri | undefined
): ResolvedExplorerSelection {
  // Explorer context commands pass a URI array as the second argument, while
  // other menu surfaces may pass unrelated contextual command arguments.
  const explorerSelection = Array.isArray(selectedUris)
    ? selectedUris
    : undefined;

  if (clickedUri) {
    const clickedKey = uriKey(clickedUri);
    if (explorerSelection?.some((uri) => uriKey(uri) === clickedKey)) {
      return { uris: dedupeUris(explorerSelection), preserveOrder: true };
    }
    return { uris: [clickedUri], preserveOrder: true };
  }
  if (explorerSelection && explorerSelection.length > 0) {
    return { uris: dedupeUris(explorerSelection), preserveOrder: true };
  }
  return {
    uris: activeFileUri ? [activeFileUri] : [],
    preserveOrder: false,
  };
}
