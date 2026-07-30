declare namespace AskWizardContract {
  type ProviderMenuItem = {
    id: string;
    label: string;
  };

  type CompletionStep = {
    title: string;
    description: string;
    comingSoon?: boolean;
  };

  type WebviewConfig = {
    title: string;
    requestInputPrompt: string;
    requestInputPlaceholder: string;
    step1Indicator: string;
    step1Hint: string;
    executableUnavailable: boolean;
    executableUnavailableWarning: string;
    resolveBadgerLabel: string;
    copyToClipboardLabel: string;
    step1CancelLabel: string;
    moreCopyActionsLabel: string;
    moreCopyActionsTitle: string;
    moreCopyActionsAriaLabel: string;
    step2Indicator: string;
    handoffHeadline: string;
    handoffInstruction: string;
    prompt1SummaryTitle: string;
    prompt1SummaryNote: string;
    optionalGuideTitle: string;
    optionalGuide: string;
    optionalGuideMediaLabel: string;
    handoffGuideLinkLabel: string;
    aiResponsePlaceholder: string;
    copyRequestedFilesLabel: string;
    doneMessageTitle: string;
    doneMessageDescription: string;
    completionNextStepsTitle: string;
    completionNextSteps: readonly CompletionStep[];
    doneHint: string;
    startAgainLabel: string;
    doneCloseLabel: string;
    workingLabel: string;
    providers: readonly ProviderMenuItem[];
  };

  type ToHostMessage =
    | { type: "step1Submit"; text: string; openProviderId?: string }
    | { type: "step2Submit"; text: string }
    | { type: "startAgain" }
    | { type: "close" }
    | { type: "cancel" }
    | { type: "openHandoffGuide" }
    | { type: "openExecutableRecovery" };

  type ToWebviewMessage =
    | { type: "busy"; busy: boolean; step?: 1 | 2 }
    | { type: "step1Error"; message?: string }
    | {
        type: "executableStatus";
        unavailable: boolean;
        busy?: boolean;
      }
    | {
        type: "showStep2";
        handoffInstruction?: string;
        summaryLines?: readonly string[];
      }
    | { type: "showStep1"; goal?: string }
    | { type: "showDone" }
    | { type: "validationError"; message?: string };
}
