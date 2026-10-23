import type { FileClipboard } from "./fileClipboard";
import * as path from "node:path";
import { isSensitivePath } from "../shared/sensitivePath";
import { resolveExplorerSelection } from "../selection/explorerSelection";

export const ATTACHMENT_EXTENSIONS = {
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif"],
  attachment: [".pdf", ".zip", ".docx", ".pptx", ".xlsx"],
} as const;
export type AttachmentCategory = keyof typeof ATTACHMENT_EXTENSIONS;
export const COPY_ATTACHMENT_COMMAND = "aiBadger.copyFileAsAttachment";
export const COPY_ATTACHMENTS_COMMAND = "aiBadger.copyFilesAsAttachments";
export const COPY_IMAGE_COMMAND = "aiBadger.copyImageForAI";
export const COPY_IMAGES_COMMAND = "aiBadger.copyImagesForAI";
export type AttachmentUri = { scheme: string; fsPath: string; toString(): string };
export type NativeAttachmentDeps = {
  clipboard: FileClipboard | undefined;
  isFile(uri: AttachmentUri): Promise<boolean>;
};

export async function copyNativeAttachments(
  clicked: AttachmentUri | undefined,
  selected: readonly AttachmentUri[] | undefined,
  deps: NativeAttachmentDeps,
  category: AttachmentCategory = "image"
): Promise<{ copied: number; skipped: number }> {
  if (!deps.clipboard) {
    throw new Error("Native file attachments are unavailable in this environment.");
  }
  const files = resolveExplorerSelection(clicked, selected, undefined).uris as AttachmentUri[];
  const extensions: readonly string[] = ATTACHMENT_EXTENSIONS[category];
  const localFiles = files.filter(file => file.scheme === "file" &&
    extensions.includes(path.extname(file.fsPath).toLowerCase()) && !isSensitivePath(file.fsPath));
  const eligible: AttachmentUri[] = [];
  for (const file of localFiles) {
    try {
      if (await deps.isFile(file)) eligible.push(file);
    } catch {
      // A stale or inaccessible selection must not prevent copying other files.
    }
  }
  if (!eligible.length) {
    throw new Error("No eligible files available to copy for this action.");
  }
  await deps.clipboard.writeFiles(eligible.map(file => file.fsPath));
  return { copied: eligible.length, skipped: files.length - eligible.length };
}
