import type { ChatProviderMenuItem } from "./providers";
import { hasSelectorLikeContent } from "./selectors";
import { handoffInstructionAfterOpen } from "./messages";

export type AskWizardResult = {
  /** True if at least one successful Prompt 2 copy happened this session. */
  completedCopy: boolean;
};

export type PreparePromptAction = {
  /** When set, open this provider’s public chat page after copying Prompt 1. */
  openProviderId?: string;
};

export type PreparePromptResult =
  | { ok: true; summaryLines?: readonly string[] }
  | { ok: false; message: string };

export type AskWizardControllerOptions = {
  chatProviders: readonly ChatProviderMenuItem[];
  /** Complete directly after Prompt 1 for workflows with optional continuation. */
  completeAfterPrepare?: boolean;
  onOpenExecutableRecovery?: () => Promise<boolean>;
  onPreparePrompt: (
    goal: string,
    action?: PreparePromptAction
  ) => Promise<PreparePromptResult>;
  validateSelectors: (text: string) => string | undefined;
  onCopyRequestedFiles: (
    goal: string,
    selectors: string
  ) => Promise<string | undefined>;
  onOpenHandoffGuide?: () => Promise<void>;
};

export type AskWizardControllerDeps = {
  postMessage(message: AskWizardContract.ToWebviewMessage): void;
  finish(value: AskWizardResult | undefined): void;
};

export type AskWizardController = {
  handleMessage(message: AskWizardContract.ToHostMessage): Promise<void>;
  resultOnDispose(): AskWizardResult | undefined;
};

/**
 * Pure host-side state machine for one Ask wizard session.
 *
 * VS Code panel creation, disposal, and message transport remain in the adapter.
 */
export function createAskWizardController(
  options: AskWizardControllerOptions,
  deps: AskWizardControllerDeps
): AskWizardController {
  let goal = "";
  let busy = false;
  let executableRecoveryBusy = false;
  let completedCopy = false;

  const result = (): AskWizardResult | undefined =>
    completedCopy ? { completedCopy: true } : undefined;

  return {
    async handleMessage(msg): Promise<void> {
      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        return;
      }
      if (msg.type === "cancel" || msg.type === "close") {
        deps.finish(result());
        return;
      }
      if (msg.type === "openHandoffGuide") {
        try {
          await options.onOpenHandoffGuide?.();
        } catch {
          // Documentation is optional; an open failure must not affect the flow.
        }
        return;
      }
      if (msg.type === "openExecutableRecovery") {
        if (executableRecoveryBusy) {
          return;
        }
        executableRecoveryBusy = true;
        deps.postMessage({
          type: "executableStatus",
          unavailable: true,
          busy: true,
        });
        try {
          const recovered =
            (await options.onOpenExecutableRecovery?.()) ?? false;
          deps.postMessage({
            type: "executableStatus",
            unavailable: !recovered,
            busy: false,
          });
        } catch {
          deps.postMessage({
            type: "executableStatus",
            unavailable: true,
            busy: false,
          });
        } finally {
          executableRecoveryBusy = false;
        }
        return;
      }
      if (msg.type === "startAgain") {
        deps.postMessage({
          type: "showStep1",
          goal,
        });
        return;
      }
      if (msg.type === "step1Submit") {
        if (busy) {
          return;
        }
        // Blank goal is allowed (the Ask flow maps it to its default).
        const text = typeof msg.text === "string" ? msg.text : "";
        goal = text.trim();
        const openProviderId =
          typeof msg.openProviderId === "string" && msg.openProviderId.length > 0
            ? msg.openProviderId
            : undefined;
        busy = true;
        deps.postMessage({ type: "busy", busy: true, step: 1 });
        try {
          const prepareResult = await options.onPreparePrompt(
            goal,
            openProviderId ? { openProviderId } : undefined
          );
          if (!prepareResult.ok) {
            deps.postMessage({
              type: "step1Error",
              message: prepareResult.message,
            });
            return;
          }
          if (options.completeAfterPrepare) {
            completedCopy = true;
            deps.postMessage({ type: "showDone" });
            return;
          }
          const openedProviderName = openProviderId
            ? options.chatProviders.find((provider) => provider.id === openProviderId)
                ?.name
            : undefined;
          const summaryLines =
            prepareResult.summaryLines && prepareResult.summaryLines.length > 0
              ? [...prepareResult.summaryLines]
              : undefined;
          deps.postMessage({
            type: "showStep2",
            ...(openedProviderName
              ? {
                  handoffInstruction:
                    handoffInstructionAfterOpen(openedProviderName),
                }
              : {}),
            ...(summaryLines ? { summaryLines } : {}),
          });
        } catch {
          deps.postMessage({
            type: "step1Error",
            message: "Failed to prepare prompt. Please try again.",
          });
        } finally {
          busy = false;
          deps.postMessage({ type: "busy", busy: false, step: 1 });
        }
        return;
      }
      if (msg.type === "step2Submit") {
        if (busy) {
          return;
        }
        const text = typeof msg.text === "string" ? msg.text : "";
        if (text.trim() === "" || !hasSelectorLikeContent(text)) {
          return;
        }
        const syntaxError = options.validateSelectors(text);
        if (syntaxError) {
          deps.postMessage({
            type: "validationError",
            message: syntaxError,
          });
          return;
        }
        busy = true;
        deps.postMessage({ type: "busy", busy: true, step: 2 });
        try {
          const error = await options.onCopyRequestedFiles(goal, text);
          if (error) {
            deps.postMessage({
              type: "validationError",
              message: error,
            });
            return;
          }
          completedCopy = true;
          deps.postMessage({ type: "showDone" });
        } catch {
          deps.postMessage({
            type: "validationError",
            message: "Failed to copy requested files. Please try again.",
          });
        } finally {
          busy = false;
          deps.postMessage({ type: "busy", busy: false, step: 2 });
        }
      }
    },

    resultOnDispose: result,
  };
}
