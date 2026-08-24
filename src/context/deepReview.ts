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

export type DeepReviewContinuationDeps = Pick<
  DeepReviewPreparationDeps,
  "client" | "repositoryRoot" | "writeClipboard" | "showInformationMessage"
>;

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
  const result: GeneratePromptResult = await deps.client.reviewContext({
    repositoryRoot: deps.repositoryRoot,
    guidance: guidance.trim(),
    includeTopology: true,
  });
  if (!result.ok) {
    return {
      ok: false,
      message: noReviewableChanges(result.message)
        ? "No reviewable changes found. Make or stage a change, then try Deep Review again."
        : result.message,
    };
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

  const payloadBytes = Buffer.byteLength(result.prompt, "utf8");

  if (!provider) {
    deps.showInformationMessage(promptCopiedMessage(payloadBytes));
    return {
      ok: true,
      ...(result.badgerVersion ? { badgerVersion: result.badgerVersion } : {}),
    };
  }

  const opened = await deps.openExternal(provider.url);
  deps.showInformationMessage(
    opened
      ? promptCopiedOpenedMessage(provider.name, payloadBytes)
      : promptCopiedOpenFailedMessage(provider.name, payloadBytes)
  );
  return {
    ok: true,
    ...(result.badgerVersion ? { badgerVersion: result.badgerVersion } : {}),
  };
}

function noReviewableChanges(message: string): boolean {
  return /no reviewable changes/i.test(message);
}

/**
 * Request stateless supplemental review context. The initial prompt is not an
 * input: Badger reads only the validated selectors and current repository.
 */
export async function continueDeepReview(
  selectors: string,
  deps: DeepReviewContinuationDeps
): Promise<string | { badgerVersion?: string } | undefined> {
  const result = await deps.client.reviewContinuation({
    repositoryRoot: deps.repositoryRoot,
    selectors,
  });
  if (!result.ok) {
    return result.message;
  }
  if (result.prompt.trim() === "") {
    return "Badger returned no usable supplemental review context.";
  }
  try {
    await deps.writeClipboard(result.prompt);
  } catch {
    return "Could not write the supplemental review context to the clipboard.";
  }
  deps.showInformationMessage(
    "Additional review context copied. Paste it into the same AI chat."
  );
  return result.badgerVersion
    ? { badgerVersion: result.badgerVersion }
    : undefined;
}
