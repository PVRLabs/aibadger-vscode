import * as path from "path";
import {
  formatAdditionalContext,
  type AdditionalContextFile,
  type BinaryContextFile,
  type ExcludedContextFile,
} from "./formatAdditionalContext";
import {
  resolveExplorerSelection,
  type SelectionUri,
} from "../selection/explorerSelection";

export { resolveExplorerSelection } from "../selection/explorerSelection";

export const COPY_FILES_FOR_AI_COMMAND = "aiBadger.copyFilesForAI";
export const COPY_FILE_FOR_AI_COMMAND = "aiBadger.copyFileForAI";
export const MAX_COPY_FILE_BYTES = 500 * 1024;
export const MAX_COPY_PAYLOAD_BYTES = 1024 * 1024;

export const UNSUPPORTED_SELECTION_MESSAGE =
  "Select one or more files to copy with AI Badger.";
export const CROSS_WORKSPACE_MESSAGE =
  "Selected files must belong to the same workspace folder.";
export const OVERSIZED_SELECTION_MESSAGE =
  "The selected files are too large to copy as a single context block.";
export const PER_FILE_EXCLUSION_REASON =
  "contents exceed the 500 KiB per-file limit";
export const TOTAL_PAYLOAD_EXCLUSION_REASON =
  "contents would exceed the 1 MiB total payload limit";

export type CopyUri = SelectionUri;

export type CopyWorkspaceFolder = {
  uri: CopyUri;
};

export type CopyFileStat = {
  isFile: boolean;
};

export type CopyFilesDeps = {
  getActiveFileUri(): CopyUri | undefined;
  getWorkspaceFolder(uri: CopyUri): CopyWorkspaceFolder | undefined;
  getRelativePath(uri: CopyUri): string;
  stat(uri: CopyUri): Promise<CopyFileStat>;
  getOpenDocumentText(uri: CopyUri): string | undefined;
  readFile(uri: CopyUri): Promise<Uint8Array>;
  writeClipboard(text: string): Promise<void>;
  showInformationMessage(message: string): void;
  showErrorMessage(message: string): void;
};

function uriKey(uri: CopyUri): string {
  return uri.toString();
}

const BINARY_TYPES: Readonly<Record<string, string>> = {
  ".gif": "GIF",
  ".ico": "ICO",
  ".jpeg": "JPEG",
  ".jpg": "JPEG",
  ".pdf": "PDF",
  ".png": "PNG",
  ".webp": "WebP",
  ".zip": "ZIP",
};

function binaryType(relativePath: string): string {
  const extension = path.extname(relativePath).toLowerCase();
  if (BINARY_TYPES[extension]) {
    return BINARY_TYPES[extension];
  }
  return extension === "" ? "Binary" : extension.slice(1).toUpperCase();
}

function formatBinarySize(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1000 * 1000) {
    return `${Math.round(bytes / 1000)} KB`;
  }
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  if (text.includes("\0")) {
    return undefined;
  }
  return text;
}

function binaryFile(
  index: number,
  relativePath: string,
  size: number
): BinaryContextFile & { kind: "included"; index: number } {
  // TODO: Add a Badger file-metadata API and use it here for richer binary
  // metadata. Until then, keep this direct-copy action CLI-free and infer type
  // from the selected filename using only bytes already read for the size.
  return {
    kind: "included",
    index,
    path: relativePath,
    binaryType: binaryType(relativePath),
    size: formatBinarySize(size),
  };
}

export function copySuccessMessage(count: number): string {
  return count === 1
    ? "Copied 1 file to the clipboard. It is not shared until you paste it."
    : `Copied ${count} files to the clipboard. They are not shared until you paste them.`;
}

type IndexedContextFile = (AdditionalContextFile | BinaryContextFile) & {
  index: number;
};
type IndexedExcludedFile = ExcludedContextFile & { index: number };

function fitPayload(
  files: readonly IndexedContextFile[],
  excludedFiles: readonly IndexedExcludedFile[]
): {
  payload: string;
  includedCount: number;
  excludedCount: number;
} {
  const included = [...files];
  const excluded = [...excludedFiles];
  let orderedExcluded = [...excluded].sort((a, b) => a.index - b.index);
  let payload = formatAdditionalContext(undefined, included, orderedExcluded);

  while (Buffer.byteLength(payload, "utf8") > MAX_COPY_PAYLOAD_BYTES) {
    const removed = included.pop();
    if (!removed) {
      throw new Error(OVERSIZED_SELECTION_MESSAGE);
    }
    excluded.push({
      index: removed.index,
      path: removed.path,
      reason: TOTAL_PAYLOAD_EXCLUSION_REASON,
    });
    orderedExcluded = [...excluded].sort((a, b) => a.index - b.index);
    payload = formatAdditionalContext(undefined, included, orderedExcluded);
  }

  return {
    payload,
    includedCount: included.length,
    excludedCount: orderedExcluded.length,
  };
}

function copyResultMessage(
  selectedCount: number,
  excludedCount: number
): string {
  if (excludedCount === 0) {
    return copySuccessMessage(selectedCount);
  }
  const noun = excludedCount === 1 ? "file was" : "files were";
  return `Copied context for ${selectedCount} selected ${
    selectedCount === 1 ? "file" : "files"
  }. ${excludedCount} ${noun} listed but excluded by payload limits.`;
}

export async function copyFilesForAI(
  clickedUri: CopyUri | undefined,
  selectedUris: readonly CopyUri[] | undefined,
  deps: CopyFilesDeps
): Promise<void> {
  try {
    const selection = resolveExplorerSelection(
      clickedUri,
      selectedUris,
      deps.getActiveFileUri()
    );
    if (selection.uris.length === 0) {
      throw new Error(UNSUPPORTED_SELECTION_MESSAGE);
    }

    const validated = await Promise.all(
      selection.uris.map(async (uri) => {
        const [stat, folder] = await Promise.all([
          deps.stat(uri),
          Promise.resolve(deps.getWorkspaceFolder(uri)),
        ]);
        if (!stat.isFile || !folder) {
          throw new Error(UNSUPPORTED_SELECTION_MESSAGE);
        }
        return {
          uri,
          folder,
          relativePath: deps.getRelativePath(uri).replaceAll("\\", "/"),
        };
      })
    );

    const workspaceKey = uriKey(validated[0].folder.uri);
    if (validated.some((file) => uriKey(file.folder.uri) !== workspaceKey)) {
      throw new Error(CROSS_WORKSPACE_MESSAGE);
    }
    if (!selection.preserveOrder) {
      validated.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    }

    const loaded = await Promise.all(
      validated.map(async ({ uri, relativePath }, index) => {
        const openText = deps.getOpenDocumentText(uri);
        if (openText !== undefined) {
          const size = Buffer.byteLength(openText, "utf8");
          if (openText.includes("\0")) {
            return binaryFile(index, relativePath, size);
          }
          if (size > MAX_COPY_FILE_BYTES) {
            return {
              kind: "excluded" as const,
              index,
              path: relativePath,
              reason: PER_FILE_EXCLUSION_REASON,
            };
          }
          return {
            kind: "included" as const,
            index,
            path: relativePath,
            contents: openText,
          };
        }

        const bytes = await deps.readFile(uri);
        const contents = decodeUtf8(bytes);
        if (contents === undefined) {
          return binaryFile(index, relativePath, bytes.byteLength);
        }
        if (bytes.byteLength > MAX_COPY_FILE_BYTES) {
          return {
            kind: "excluded" as const,
            index,
            path: relativePath,
            reason: PER_FILE_EXCLUSION_REASON,
          };
        }
        return {
          kind: "included" as const,
          index,
          path: relativePath,
          contents,
        };
      })
    );
    const files = loaded.filter(
      (file): file is Extract<typeof file, { kind: "included" }> =>
        file.kind === "included"
    );
    const excludedFiles = loaded.filter(
      (file): file is Extract<typeof file, { kind: "excluded" }> =>
        file.kind === "excluded"
    );
    const initial = fitPayload(files, excludedFiles);

    const count = validated.length;
    await deps.writeClipboard(initial.payload);
    deps.showInformationMessage(copyResultMessage(count, initial.excludedCount));
  } catch (error) {
    deps.showErrorMessage(
      error instanceof Error ? error.message : UNSUPPORTED_SELECTION_MESSAGE
    );
  }
}
