import * as vscode from "vscode";
import { showAskWizard } from "./askWizard";
import { LAST_CHAT_PROVIDER_STATE_KEY } from "./providers";
import type { RunAskUi } from "./runAsk";

export function createVscodeRunAskUi(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext
): RunAskUi {
  return {
    showAskWizard: async (options) =>
      showAskWizard({
        ...options,
        extensionUri,
      }),
    writeClipboard: async (text) => {
      await vscode.env.clipboard.writeText(text);
    },
    showInformationMessage: (message) => {
      void vscode.window.showInformationMessage(message);
    },
    showErrorMessage: (message) => {
      void vscode.window.showErrorMessage(message);
    },
    openExternal: async (url) => {
      try {
        return await vscode.env.openExternal(vscode.Uri.parse(url));
      } catch {
        return false;
      }
    },
    getLastChatProviderId: () => {
      const value = context.globalState.get<string>(LAST_CHAT_PROVIDER_STATE_KEY);
      return typeof value === "string" && value.length > 0 ? value : undefined;
    },
    setLastChatProviderId: (id) => {
      void context.globalState.update(LAST_CHAT_PROVIDER_STATE_KEY, id);
    },
  };
}
