import {
  resolveExplorerSelection,
  type SelectionUri,
} from "../selection/explorerSelection";
import type { AskEntry } from "./runAsk";

export const ASK_FILES_SELECTION_MESSAGE =
  "Select one or more files to ask about with AI Badger.";
export const ASK_FILES_STAT_MESSAGE =
  "AI Badger could not inspect one or more selected files.";

export type AskSelectionDeps = {
  getActiveFileUri(): SelectionUri | undefined;
  stat(uri: SelectionUri): Promise<{ isFile: boolean }>;
};

export type ResolveAskSelectionResult =
  | { ok: true; entry: Extract<AskEntry, { kind: "file" }> }
  | { ok: false; message: string };

/**
 * Resolve and validate a file-oriented Ask command invocation.
 *
 * Explorer multi-selection, editor context arguments, and Command Palette
 * fallback all use the same selection rules as the direct-copy commands.
 */
export async function resolveAskFileSelection(
  clickedUri: SelectionUri | undefined,
  selectedUris: readonly SelectionUri[] | undefined,
  deps: AskSelectionDeps
): Promise<ResolveAskSelectionResult> {
  const selection = resolveExplorerSelection(
    clickedUri,
    selectedUris,
    deps.getActiveFileUri()
  );
  if (selection.uris.length === 0) {
    // Preserve the existing runAsk path so it owns the missing-selection UI.
    return { ok: true, entry: { kind: "file" } };
  }

  let stats: Array<{ isFile: boolean }>;
  try {
    stats = await Promise.all(selection.uris.map((uri) => deps.stat(uri)));
  } catch {
    return { ok: false, message: ASK_FILES_STAT_MESSAGE };
  }
  if (stats.some((stat) => !stat.isFile)) {
    return { ok: false, message: ASK_FILES_SELECTION_MESSAGE };
  }

  return {
    ok: true,
    entry: {
      kind: "file",
      resourcePath: selection.uris[0].fsPath,
      selectedResourcePaths: selection.uris.map((uri) => uri.fsPath),
    },
  };
}
