import * as vscode from "vscode";
import { COPY_IMAGE_COMMAND, COPY_IMAGES_COMMAND, COPY_ATTACHMENT_COMMAND, COPY_ATTACHMENTS_COMMAND, copyNativeAttachments } from "./context/copyNativeAttachments";
import { getFileClipboard } from "./context/fileClipboard";

export function registerNativeAttachments(context: vscode.ExtensionContext): void {
  const clipboard = getFileClipboard(process.platform, Boolean(vscode.env.remoteName));
  for (const command of [COPY_IMAGE_COMMAND, COPY_IMAGES_COMMAND, COPY_ATTACHMENT_COMMAND, COPY_ATTACHMENTS_COMMAND]) {
    context.subscriptions.push(vscode.commands.registerCommand(command,
      async (uri?: vscode.Uri, selected?: vscode.Uri[]) => {
        try {
          const { copied, skipped } = await copyNativeAttachments(uri, selected, {
            clipboard,
            isFile: async file => Boolean((await vscode.workspace.fs.stat(vscode.Uri.file(file.fsPath))).type & vscode.FileType.File),
          }, command === COPY_ATTACHMENT_COMMAND || command === COPY_ATTACHMENTS_COMMAND ? "attachment" : "image");
          const message = `${copied === 1 ? "File" : `${copied} files`} copied. Paste into your AI chat.`;
          if (skipped) {
            void vscode.window.showWarningMessage(`${message} Skipped ${skipped} unsupported, excluded, or unavailable ${skipped === 1 ? "item" : "items"}.`);
          } else {
            void vscode.window.showInformationMessage(message);
          }
        } catch (error) {
          void vscode.window.showErrorMessage(`Could not copy attachments: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    ));
  }
}
