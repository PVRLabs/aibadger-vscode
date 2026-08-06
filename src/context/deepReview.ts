import type {
  BadgerReviewClient,
  GeneratePromptResult,
} from "../client/types";
import {
  promptCopiedMessage,
  promptCopiedOpenFailedMessage,
  promptCopiedOpenedMessage,
} from "../flow/messages";
import { providerById } from "../flow/providers";
import type { PreparePromptAction, PreparePromptResult } from "../flow/askWizardController";

export type DeepReviewPreparationDeps = {
  client: BadgerReviewClient;
  repositoryRoot: string;
  writeClipboard: (text: string) => Promise<void>;
  openExternal: (url: string) => Promise<boolean>;
  showInformationMessage: (message: string) => void;
};

/**
 * Generate the initial repository-scoped review request after explicit user
 * consent. Badger owns repository inspection and prompt formatting; the
 * extension only copies its successful stdout and optionally opens a provider.
 */
export async function prepareDeepReviewPrompt(
  guidance: string,
  action: PreparePromptAction | undefined,
  deps: DeepReviewPreparationDeps
): Promise<PreparePromptResult> {
  const capabilities = await deps.client.reviewCapabilities();
  if (!capabilities.ok) {
    return { ok: false, message: capabilities.message };
  }
  if (!capabilities.capabilities.reviewContext) {
    return {
      ok: false,
      message: "This Badger version does not support Deep Review.",
    };
  }

  const result: GeneratePromptResult = await deps.client.reviewContext({
    repositoryRoot: deps.repositoryRoot,
    guidance: guidance.trim(),
  });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const providerId = action?.openProviderId;
  const provider = providerId ? providerById(providerId) : undefined;
  if (providerId && !provider) {
    return { ok: false, message: "Unknown AI chat." };
  }

  try {
    await deps.writeClipboard(result.prompt);
  } catch {
    return {
      ok: false,
      message: "Could not write the review prompt to the clipboard.",
    };
  }

  if (!providerId) {
    deps.showInformationMessage(promptCopiedMessage());
    return { ok: true };
  }

  // The provider was validated before the clipboard write.
  if (!provider) {
    return { ok: false, message: "Unknown AI chat." };
  }
  const opened = await deps.openExternal(provider.url);
  deps.showInformationMessage(
    opened
      ? promptCopiedOpenedMessage(provider.name)
      : promptCopiedOpenFailedMessage(provider.name)
  );
  return { ok: true };
}
