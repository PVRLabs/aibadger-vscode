/** Exact product UI strings from issue #125 / plan / extension-spec. */

/** Shared wizard / dialog chrome. */
export const ASK_DIALOG_TITLE = "AI Badger";

/** @deprecated Prefer ASK_DIALOG_TITLE — kept as alias for existing call sites. */
export const REQUEST_INPUT_TITLE = ASK_DIALOG_TITLE;

/** Required question text from the issue. */
export const REQUEST_INPUT_PROMPT = "What do you want help with?";

export const REQUEST_INPUT_PLACEHOLDER =
  "e.g. Explore how configuration loading works";

/** Step 1 of the unified Ask wizard. */
export const STEP1_INDICATOR = "Step 1 of 2";

/**
 * @deprecated Step 1 primary is now COPY_TO_CLIPBOARD_LABEL (split button).
 * Kept so older tests/strings do not break mid-refactor.
 */
export const STEP1_CONTINUE_LABEL = "Continue";

/**
 * Used when the user leaves the goal blank. Short, actionable, model-agnostic.
 * Sent as the real task (not topology-only).
 */
export const DEFAULT_GOAL =
  "Explore this project, summarize the relevant design and behavior, and identify the most useful next steps.";

/**
 * Optional short guidance under Step 1 (self-sufficient with the prompt alone).
 * Blank is allowed: uses DEFAULT_GOAL.
 */
export const STEP1_HINT =
  "Describe what you want to explore, or leave blank for a project overview. Then copy the prompt (or copy and open an AI chat).";

/** Visible on Step 1 when the resolved local Badger process cannot be started. */
export const EXECUTABLE_UNAVAILABLE_WARNING =
  "Badger isn’t available. Install Badger or choose a local executable before generating your prompt.";

/** Opens the native three-option executable recovery dialog. */
export const RESOLVE_BADGER_LABEL = "Fix issue";

/** Resolve blank/whitespace goals to the default task. */
export function effectiveGoal(goal: string): string {
  const trimmed = goal.trim();
  return trimmed === "" ? DEFAULT_GOAL : trimmed;
}

export const PROMPT_COPIED_MESSAGE = "AI Badger prompt copied to clipboard.";

/**
 * Step 1 split primary: generate Prompt 1, copy to clipboard, advance to paste-back.
 * Provider-neutral — open-chat shortcuts live only in the dropdown.
 */
export const COPY_TO_CLIPBOARD_LABEL = "Copy to Clipboard";

/** Dropdown item: generate + copy Prompt 1, open that provider’s public chat page. */
export function copyAndOpenLabel(providerName: string): string {
  return `Copy and Open ${providerName}`;
}

/** Toast after successful copy + system-browser open. */
export function promptCopiedOpenedMessage(providerName: string): string {
  return `Prompt copied. ${providerName} opened.`;
}

/**
 * Toast when clipboard write succeeded but the browser open failed.
 * Copy is never blocked by a failed open.
 */
export function promptCopiedOpenFailedMessage(providerName: string): string {
  return `Prompt copied. Could not open ${providerName}.`;
}

/**
 * Exact success text after Prompt 2 is copied (extension-spec / plan).
 * Shown on the post-copy panel so the user continues in the same AI chat.
 * No “open provider” action on this screen.
 */
export const NEXT_PROMPT_COPIED_TITLE = "Final handoff prompt copied.";

export const NEXT_PROMPT_COPIED_DESCRIPTION =
  "Paste it into the same AI chat to complete the handoff and continue the conversation.";

export const PROMPT2_COPIED_MESSAGE =
  `${NEXT_PROMPT_COPIED_TITLE} ${NEXT_PROMPT_COPIED_DESCRIPTION}`;

/** Compact guidance shown after Prompt 2 is copied. */
export const COMPLETION_NEXT_STEPS_TITLE = "Some ways you can continue";

export const COMPLETION_NEXT_STEPS = [
  {
    title: "Discuss and brainstorm",
    description: "possible approaches with the AI.",
  },
  {
    title: "Refine the solution",
    description: "by asking follow-up questions and comparing alternatives.",
  },
  {
    title: "Create an implementation plan",
    description: "with concrete steps for your coding agent.",
  },
  {
    title: "Add more context when needed",
    description: "by right-clicking files in VS Code and copying them into the chat.",
    comingSoon: true,
  },
] as const;

/** Longer guidance on the post-copy “done” panel. */
export const DONE_PANEL_HINT =
  "Close this panel when you’re finished, or start again with the same request.";

export const MISSING_SELECTION_MESSAGE =
  "AI Badger: Select a file or folder in the Explorer, then try again.";

/** @deprecated Prefer ASK_DIALOG_TITLE. */
export const HANDOFF_DIALOG_TITLE = ASK_DIALOG_TITLE;

/**
 * Step 2 status line after a successful Prompt 1 copy.
 * Kept separate from the instruction so Step 2 is not triple-explained.
 */
export const HANDOFF_HEADLINE = "Prompt copied to clipboard.";

/**
 * Default Step 2 instruction (copy-only path). One line; demo tip is optional.
 */
export const HANDOFF_INSTRUCTION =
  "Paste it into an AI chat, then paste the AI’s response below. The AI will ask for specific files to fully answer your question.";

/**
 * Combined default handoff (headline + instruction) for tests / legacy call sites.
 */
export const HANDOFF_MESSAGE = `${HANDOFF_HEADLINE} ${HANDOFF_INSTRUCTION}`;

/**
 * Step 2 instruction after “Copy and Open &lt;provider&gt;”: chat is already open.
 */
export function handoffInstructionAfterOpen(providerName: string): string {
  return `Paste it into the opened ${providerName} window, then paste the AI’s response below. The AI will ask for specific files to fully answer your question.`;
}

/**
 * Full handoff after open (headline fixed + provider-specific instruction).
 */
export function handoffMessageAfterOpen(providerName: string): string {
  return `${HANDOFF_HEADLINE} ${handoffInstructionAfterOpen(providerName)}`;
}

/** Step indicator for the paste-back stage. */
export const HANDOFF_STEP_INDICATOR = "Step 2 of 2";

/**
 * @deprecated Numbered Step 2 list removed — one instruction + optional demo tip.
 * Kept empty so older tests/import sites can migrate without breaking.
 */
export const HANDOFF_STEPS = [] as const;

/**
 * @deprecated Numbered list removed; use handoffInstructionAfterOpen.
 */
export function handoffStepsAfterOpen(
  _providerName: string
): readonly string[] {
  return [];
}

/** Multline AI-response field placeholder. */
export const AI_RESPONSE_PLACEHOLDER =
  "Paste the AI response here (FILE: / PREFIX: / NEAR: lines)";

/**
 * Step 2 section title for the compact Prompt 1 topology / payload summary.
 * Shown only after a successful Step 1 copy when summary lines are available.
 * Lead with the privacy promise: structure only, no source.
 */
export const PROMPT1_SUMMARY_TITLE = "Topology only";

/**
 * Always-visible subtitle under the summary title.
 * Short, scannable: nothing from the repo body is on the clipboard yet.
 */
export const PROMPT1_SUMMARY_NOTE = "No source files included";

/**
 * Primary action on step 2: extract + copy the requested-files prompt.
 * Enabled only when the textarea contains selector-like content (e.g. FILE:).
 */
export const COPY_REQUESTED_FILES_LABEL = "Copy requested files";

/** @deprecated Prefer COPY_REQUESTED_FILES_LABEL. */
export const HANDOFF_CONTINUE_LABEL = COPY_REQUESTED_FILES_LABEL;

export const HANDOFF_CANCEL_LABEL = "Cancel";

/** Post-copy panel: return to step 1 with the previous goal retained. */
export const START_AGAIN_LABEL = "Start again";

/** Post-copy panel: close the wizard. */
export const DONE_CLOSE_LABEL = "Close";

/**
 * Optional, collapsible visual guide (step 2). It starts collapsed and is never required.
 * When a real animation ships, it carries the workflow detail; the short
 * instruction above stays a short paragraph.
 */
export const HANDOFF_OPTIONAL_GUIDE_TITLE = "See the handoff flow";

export const HANDOFF_OPTIONAL_GUIDE = "";

export const HANDOFF_OPTIONAL_GUIDE_MEDIA_LABEL = "";

export const HANDOFF_GUIDE_LINK_LABEL = "Read the full handoff guide";

export const HANDOFF_GUIDE_URL =
  "https://github.com/PVRLabs/aibadger/blob/main/docs/handoff.md";
