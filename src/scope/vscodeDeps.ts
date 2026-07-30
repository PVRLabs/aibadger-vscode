import * as vscode from "vscode";
import type { ResolveScopeDeps, WorkspaceFolderRef } from "./types";

function toRef(folder: vscode.WorkspaceFolder): WorkspaceFolderRef {
  return {
    name: folder.name,
    fsPath: folder.uri.fsPath,
  };
}

/**
 * VS Code-backed dependencies for scope resolution.
 */
export function createVscodeResolveDeps(): ResolveScopeDeps {
  return {
    getWorkspaceFolders: () => {
      const folders = vscode.workspace.workspaceFolders;
      return folders?.map(toRef);
    },
    getWorkspaceFolderForPath: (resourcePath: string) => {
      const uri = vscode.Uri.file(resourcePath);
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      return folder ? toRef(folder) : undefined;
    },
    pickWorkspaceFolder: async (folders) => {
      // Prefer native multi-root picker when VS Code has open folders.
      const picked = await vscode.window.showWorkspaceFolderPick({
        placeHolder: "Select the project for AI Badger",
      });
      if (picked) {
        return toRef(picked);
      }

      // showWorkspaceFolderPick returns undefined on cancel; also handles
      // the case where folders were passed but the API has no open roots.
      if (folders.length === 0) {
        return undefined;
      }

      // Fallback quick-pick if workspace folder pick is unavailable (tests / edge).
      // When user cancelled the native picker, do not force a second prompt.
      return undefined;
    },
  };
}
