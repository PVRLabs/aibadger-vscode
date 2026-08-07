import * as vscode from "vscode";
import {
  buildWizardHtml,
} from "./askWizardHtml";
import {
  ASK_DIALOG_TITLE,
  DEEP_REVIEW_COPY_LABEL,
  DEEP_REVIEW_DIALOG_TITLE,
  DEEP_REVIEW_REQUEST_PLACEHOLDER,
  DEEP_REVIEW_REQUEST_PROMPT,
  DEEP_REVIEW_STEP1_HINT,
  COMPLETION_NEXT_STEPS,
  COMPLETION_NEXT_STEPS_TITLE,
  COPY_REQUESTED_FILES_LABEL,
  COPY_TO_CLIPBOARD_LABEL,
  copyAndOpenLabel,
  DONE_CLOSE_LABEL,
  DONE_PANEL_HINT,
  AI_RESPONSE_PLACEHOLDER,
  EXECUTABLE_UNAVAILABLE_WARNING,
  HANDOFF_CANCEL_LABEL,
  HANDOFF_HEADLINE,
  HANDOFF_INSTRUCTION,
  HANDOFF_GUIDE_LINK_LABEL,
  HANDOFF_OPTIONAL_GUIDE,
  HANDOFF_OPTIONAL_GUIDE_MEDIA_LABEL,
  HANDOFF_OPTIONAL_GUIDE_TITLE,
  HANDOFF_STEP_INDICATOR,
  PROMPT1_SUMMARY_NOTE,
  PROMPT1_SUMMARY_TITLE,
  NEXT_PROMPT_COPIED_DESCRIPTION,
  NEXT_PROMPT_COPIED_TITLE,
  REQUEST_INPUT_PLACEHOLDER,
  REQUEST_INPUT_PROMPT,
  RESOLVE_BADGER_LABEL,
  START_AGAIN_LABEL,
  STEP1_HINT,
  STEP1_INDICATOR,
} from "./messages";
import type { ChatProviderMenuItem } from "./providers";
import {
  createAskWizardController,
  type AskWizardResult,
  type PreparePromptAction,
  type PreparePromptResult,
} from "./askWizardController";

export type {
  AskWizardResult,
  PreparePromptAction,
  PreparePromptResult,
} from "./askWizardController";

/**
 * Wizard session ends when the panel is closed (Cancel, Close, or panel X).
 * Extract/copy success stays open on the done panel until the user acts.
 */
export type AskWizardOptions = {
  title?: string;
  /**
   * Extension package root required to load packaged webview assets and the logo.
   */
  extensionUri: vscode.Uri;
  /**
   * Ordered Prompt 1 open-chat shortcuts (ids + display names only).
   * Last-used provider is first when known; primary remains Copy to Clipboard.
   */
  chatProviders?: readonly ChatProviderMenuItem[];
  /** Initial resolved-executable status for the visible Step 1 warning. */
  executableUnavailable?: boolean;
  /**
   * Open native executable recovery actions. True means a selected executable
   * was successfully started and the visible warning may be cleared.
   */
  onOpenExecutableRecovery?: () => Promise<boolean>;
  /**
   * Step 1 primary / dropdown: generate Prompt 1, copy, optional open, then
   * advance to Step 2. Return ok:false to stay on step 1 with the supplied
   * user-safe CLI failure message visible inline.
   */
  onPreparePrompt: (
    goal: string,
    action?: PreparePromptAction
  ) => Promise<PreparePromptResult>;
  /**
   * Step 2 validate: return error to keep editable; undefined means syntax OK.
   */
  validateSelectors: (text: string) => string | undefined;
  /**
   * Step 2 "Copy requested files": extract + copy Prompt 2. Return the
   * user-safe CLI failure message to keep it visibly inline on step 2;
   * undefined shows the done panel.
   */
  onCopyRequestedFiles: (
    goal: string,
    selectors: string
  ) => Promise<string | undefined>;
  /** Open the public, provider-neutral browser handoff guide. */
  onOpenHandoffGuide?: () => Promise<void>;
  /** Optional first-step copy used by the repository-scoped Deep Review UI. */
  firstStepCopy?: {
    prompt: string;
    placeholder: string;
    hint: string;
    copyLabel: string;
    /** Deep Review completes after the initial prompt; continuation is optional. */
    completeAfterCopy?: boolean;
    completionTitle?: string;
    completionDescription?: string;
    optionalSelectorContinuation?: boolean;
    step2Indicator?: string;
    handoffHeadline?: string;
    handoffInstruction?: string;
    responsePlaceholder?: string;
    continuationCopyLabel?: string;
  };
};

/** Packaged brand mark shown in the wizard header. */
export const WIZARD_LOGO_MEDIA_PATH = "media/ai-badger-logo.jpg";

type FromWebview = AskWizardContract.ToHostMessage;

/**
 * Ask wizard in one Webview panel:
 *
 * 1. Goal -> Copy to Clipboard | Copy and Open <provider> (prepare Prompt 1)
 * 2. Paste AI response -> Copy requested files (paste-back only; no re-copy/open)
 * 3. Done: continue-in-same-chat; Start again or Close
 */
export function showAskWizard(
  options: AskWizardOptions
): Promise<AskWizardResult | undefined> {
  const title = options.title ?? ASK_DIALOG_TITLE;
  const mediaRoot = vscode.Uri.joinPath(options.extensionUri, "media");
  const webviewAssetRoot = vscode.Uri.joinPath(
    options.extensionUri,
    "out",
    "webview",
    "askWizard"
  );
  const compiledRoot = vscode.Uri.joinPath(options.extensionUri, "out");
  const chatProviders = options.chatProviders ?? [];

  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "aiBadgerAsk",
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaRoot, compiledRoot],
      }
    );

    let settled = false;
    const finish = (value: AskWizardResult | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
      panel.dispose();
    };
    const controller = createAskWizardController(
      {
        chatProviders,
        completeAfterPrepare: options.firstStepCopy?.completeAfterCopy ?? false,
        optionalSelectorContinuation:
          options.firstStepCopy?.optionalSelectorContinuation ?? false,
        onOpenExecutableRecovery: options.onOpenExecutableRecovery,
        onPreparePrompt: options.onPreparePrompt,
        validateSelectors: options.validateSelectors,
        onCopyRequestedFiles: options.onCopyRequestedFiles,
        onOpenHandoffGuide: options.onOpenHandoffGuide,
      },
      {
        postMessage: (message) => {
          void panel.webview.postMessage(message);
        },
        finish,
      }
    );

    const logoSrc = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(mediaRoot, "ai-badger-logo.jpg"))
      .toString();
    const stylesheetUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(webviewAssetRoot, "styles.css"))
      .toString();
    const scriptUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(webviewAssetRoot, "main.js"))
      .toString();
    const selectorScriptUri = panel.webview
      .asWebviewUri(
        vscode.Uri.joinPath(compiledRoot, "shared", "selectorPrimitives.js")
      )
      .toString();

    panel.webview.html = buildWizardHtml({
      title,
      logoSrc,
      cspSource: panel.webview.cspSource,
      stylesheetUri,
      selectorScriptUri,
      scriptUri,
      config: createWizardConfig(
        title,
        chatProviders,
        options.executableUnavailable ?? false,
        options.firstStepCopy
      ),
    });

    panel.webview.onDidReceiveMessage(async (msg: FromWebview) => {
      await controller.handleMessage(msg);
    });

    panel.onDidDispose(() => {
      finish(controller.resultOnDispose());
    });
  });
}

/** Open the reusable Ask panel with Deep Review's first-step guidance copy. */
export function showDeepReviewWizard(
  options: Omit<AskWizardOptions, "title" | "firstStepCopy">
): Promise<AskWizardResult | undefined> {
  return showAskWizard({
    ...options,
    title: DEEP_REVIEW_DIALOG_TITLE,
    firstStepCopy: {
      prompt: DEEP_REVIEW_REQUEST_PROMPT,
      placeholder: DEEP_REVIEW_REQUEST_PLACEHOLDER,
      hint: DEEP_REVIEW_STEP1_HINT,
      copyLabel: DEEP_REVIEW_COPY_LABEL,
      completeAfterCopy: true,
      optionalSelectorContinuation: true,
      step2Indicator: "Optional context",
      handoffHeadline: "Review prompt copied.",
      handoffInstruction:
        "Paste the AI response below. Findings finish the flow without another Badger call; selector-only FILE, PREFIX, or NEAR lines copy additional context from the current filesystem, which may be newer than the initial review prompt.",
      responsePlaceholder:
        "Paste findings, or selector-only FILE: / PREFIX: / NEAR: lines",
      continuationCopyLabel: "Continue Review",
      completionTitle: "✓ Additional review context copied",
      completionDescription:
        "Paste it into the same AI chat to continue the review.",
    },
  });
}

function createWizardConfig(
  title: string,
  chatProviders: readonly ChatProviderMenuItem[],
  executableUnavailable: boolean,
  firstStepCopy?: AskWizardOptions["firstStepCopy"]
): AskWizardContract.WebviewConfig {
  const copy = firstStepCopy ?? {
    prompt: REQUEST_INPUT_PROMPT,
    placeholder: REQUEST_INPUT_PLACEHOLDER,
    hint: STEP1_HINT,
    copyLabel: COPY_TO_CLIPBOARD_LABEL,
  };
  return {
    title,
    requestInputPrompt: copy.prompt,
    requestInputPlaceholder: copy.placeholder,
    step1Indicator: STEP1_INDICATOR,
    step1Hint: copy.hint,
    executableUnavailable,
    executableUnavailableWarning: EXECUTABLE_UNAVAILABLE_WARNING,
    resolveBadgerLabel: RESOLVE_BADGER_LABEL,
    copyToClipboardLabel: copy.copyLabel,
    step1CancelLabel: HANDOFF_CANCEL_LABEL,
    moreCopyActionsLabel: "More copy actions",
    moreCopyActionsTitle: "Copy and open AI chat",
    moreCopyActionsAriaLabel: "More copy actions",
    step2Indicator: firstStepCopy?.step2Indicator ?? HANDOFF_STEP_INDICATOR,
    handoffHeadline: firstStepCopy?.handoffHeadline ?? HANDOFF_HEADLINE,
    handoffInstruction:
      firstStepCopy?.handoffInstruction ?? HANDOFF_INSTRUCTION,
    prompt1SummaryTitle: PROMPT1_SUMMARY_TITLE,
    prompt1SummaryNote: PROMPT1_SUMMARY_NOTE,
    optionalGuideTitle: HANDOFF_OPTIONAL_GUIDE_TITLE,
    optionalGuide: HANDOFF_OPTIONAL_GUIDE,
    optionalGuideMediaLabel: HANDOFF_OPTIONAL_GUIDE_MEDIA_LABEL,
    handoffGuideLinkLabel: HANDOFF_GUIDE_LINK_LABEL,
    aiResponsePlaceholder:
      firstStepCopy?.responsePlaceholder ?? AI_RESPONSE_PLACEHOLDER,
    copyRequestedFilesLabel:
      firstStepCopy?.continuationCopyLabel ?? COPY_REQUESTED_FILES_LABEL,
    optionalSelectorContinuation:
      firstStepCopy?.optionalSelectorContinuation ?? false,
    doneMessageTitle:
      firstStepCopy?.completionTitle ?? NEXT_PROMPT_COPIED_TITLE,
    doneMessageDescription:
      firstStepCopy?.completionDescription ?? NEXT_PROMPT_COPIED_DESCRIPTION,
    completionNextStepsTitle: COMPLETION_NEXT_STEPS_TITLE,
    completionNextSteps: COMPLETION_NEXT_STEPS,
    doneHint: DONE_PANEL_HINT,
    startAgainLabel: START_AGAIN_LABEL,
    doneCloseLabel: DONE_CLOSE_LABEL,
    workingLabel: "Working…",
    providers: chatProviders.map((provider) => ({
      id: provider.id,
      label: copyAndOpenLabel(provider.name),
    })),
  };
}
