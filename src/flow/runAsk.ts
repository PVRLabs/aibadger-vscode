import type { BadgerClient, PromptRequest } from "../client/types";
import {
  messageForResolveError,
  resolveSelectedResource,
  resolveUnscopedProject,
} from "../scope/resolve";
import type { ResolveScopeDeps, ScopeTarget } from "../scope/types";
import type {
  AskWizardOptions,
  AskWizardResult,
  PreparePromptResult,
} from "./askWizard";
import {
  clearActiveAskFlowState,
  createActiveAskFlowState,
} from "./flowState";
import {
  ASK_DIALOG_TITLE,
  effectiveGoal,
  HANDOFF_GUIDE_URL,
  MISSING_SELECTION_MESSAGE,
  PROMPT2_COPIED_MESSAGE,
  PROMPT_COPIED_MESSAGE,
  promptCopiedOpenFailedMessage,
  promptCopiedOpenedMessage,
} from "./messages";
import {
  orderProviders,
  providerById,
  toMenuItems,
} from "./providers";
import {
  formatPrompt1SummaryLines,
  summarizePrompt1,
} from "./promptSummary";
import { validateSelectors } from "./selectors";
import { PROMPT_FOCUS } from "../client/cliClient";
import { relativeScope } from "../scope/paths";

export type AskEntry =
  | { kind: "project" }
  | { kind: "folder"; resourcePath?: string }
  | {
      kind: "file";
      resourcePath?: string;
      selectedResourcePaths?: readonly string[];
    };

type AskTarget = ScopeTarget & {
  taggedFilePaths?: readonly string[];
};

/** Options passed to the unified Ask wizard. */
export type AskWizardRequest = AskWizardOptions & {
  title?: string;
};

export type AskWizardUiRequest = Omit<AskWizardRequest, "extensionUri">;

export type RunAskUi = {
  /**
   * Single Webview wizard: Step 1 (goal + copy) → Step 2 (AI response) →
   * done panel (continue-in-chat + Start again).
   */
  showAskWizard: (
    options: AskWizardUiRequest
  ) => Promise<AskWizardResult | undefined>;
  writeClipboard: (text: string) => Promise<void>;
  showInformationMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
  /**
   * Open an approved public URL in the system browser.
   * Must not attach prompt text. Returns false if open failed.
   */
  openExternal: (url: string) => Promise<boolean>;
  /** Last “Copy and Open” provider id, if any (ordering only). */
  getLastChatProviderId: () => string | undefined;
  /** Persist last provider id after a successful open. */
  setLastChatProviderId: (id: string) => void;
};

export type RunAskDeps = {
  scope: ResolveScopeDeps;
  ui: RunAskUi;
  client: BadgerClient;
  /** Optional production-only executable preflight and recovery UI bridge. */
  executableRecovery?: {
    isExecutableAvailable: () => Promise<boolean>;
    openRecovery: () => Promise<boolean>;
  };
};

/**
 * Shared runner for all three Explorer entry points.
 * Prompt 1 prepare, extract, and Prompt 2 copy run inside wizard callbacks
 * so the panel can advance to a post-copy “continue chatting” screen.
 */
export async function runAsk(entry: AskEntry, deps: RunAskDeps): Promise<void> {
  const target = await resolveEntryTarget(entry, deps);
  if (target === "cancelled") {
    return;
  }
  if (target === undefined) {
    return;
  }

  let flow:
    | ReturnType<typeof createActiveAskFlowState>
    | undefined;

  const chatProviders = toMenuItems(
    orderProviders(deps.ui.getLastChatProviderId())
  );
  let executableUnavailable = false;
  if (deps.executableRecovery) {
    try {
      executableUnavailable =
        !(await deps.executableRecovery.isExecutableAvailable());
    } catch {
      // Fail soft: the real operation retains typed spawn-failure recovery.
    }
  }

  try {
    await deps.ui.showAskWizard({
      title: ASK_DIALOG_TITLE,
      chatProviders,
      executableUnavailable,
      ...(deps.executableRecovery
        ? {
            onOpenExecutableRecovery:
              deps.executableRecovery.openRecovery,
          }
        : {}),
      onOpenHandoffGuide: async () => {
        await deps.ui.openExternal(HANDOFF_GUIDE_URL);
      },
      onPreparePrompt: async (goal, action): Promise<PreparePromptResult> => {
        // Blank goal → neutral exploration task, not topology-only.
        const request: PromptRequest = {
          projectRoot: target.projectRoot,
          request: appendTaggedFileReferences(
            effectiveGoal(goal),
            target.taggedFilePaths
          ),
          focus: PROMPT_FOCUS,
        };
        if (target.scope) {
          request.scope = target.scope;
        }

        const result = await deps.client.generatePrompt(request);
        if (!result.ok) {
          return { ok: false, message: badgerCliFailureMessage(result.message) };
        }

        // Clipboard first — never attach prompt text to an open URL.
        await deps.ui.writeClipboard(result.prompt);

        const openId = action?.openProviderId;
        if (openId) {
          const provider = providerById(openId);
          if (!provider) {
            return { ok: false, message: "Unknown AI chat." };
          }
          const opened = await deps.ui.openExternal(provider.url);
          if (opened) {
            deps.ui.setLastChatProviderId(provider.id);
            deps.ui.showInformationMessage(
              promptCopiedOpenedMessage(provider.name)
            );
          } else {
            deps.ui.showInformationMessage(
              promptCopiedOpenFailedMessage(provider.name)
            );
          }
        } else {
          deps.ui.showInformationMessage(PROMPT_COPIED_MESSAGE);
        }

        // Replace prior flow state when the user starts again.
        if (flow) {
          clearActiveAskFlowState(flow);
        }
        flow = createActiveAskFlowState(request, result.prompt);

        // Compact orientation for Step 2 — fail soft if derivation yields nothing.
        const summary = summarizePrompt1(result.prompt, {
          projectRoot: request.projectRoot,
          scope: request.scope,
        });
        const summaryLines = summary
          ? formatPrompt1SummaryLines(summary)
          : undefined;

        return {
          ok: true,
          ...(result.badgerVersion
            ? { badgerVersion: result.badgerVersion }
            : {}),
          ...(summaryLines && summaryLines.length > 0
            ? { summaryLines }
            : {}),
        };
      },
      validateSelectors: (text) => {
        const validation = validateSelectors(text);
        if (validation.ok) {
          return undefined;
        }
        return validation.message;
      },
      onCopyRequestedFiles: async (_goal, selectorsText) => {
        if (!flow) {
          return "Session expired. Close and try again.";
        }

        const validation = validateSelectors(selectorsText);
        if (!validation.ok) {
          return validation.message;
        }
        flow.selectors = validation.text;

        const extractResult = await deps.client.extractPrompt({
          projectRoot: flow.request.projectRoot,
          request: flow.request.request,
          selectors: flow.selectors,
          focus: flow.request.focus,
          ...(flow.request.scope ? { scope: flow.request.scope } : {}),
        });

        if (!extractResult.ok) {
          return badgerCliFailureMessage(extractResult.message);
        }

        await deps.ui.writeClipboard(extractResult.prompt);
        deps.ui.showInformationMessage(PROMPT2_COPIED_MESSAGE);
        // Wizard stays open on the done panel (continue chatting / start again).
        // No open-provider actions — always recommend the same existing chat.
        return extractResult.badgerVersion
          ? { badgerVersion: extractResult.badgerVersion }
          : undefined;
      },
    });
  } finally {
    if (flow) {
      clearActiveAskFlowState(flow);
    }
  }
}

/** Keep process diagnostics distinguishable from extension/UI failures. */
function badgerCliFailureMessage(message: string): string {
  return `Badger CLI: ${message}`;
}

async function resolveEntryTarget(
  entry: AskEntry,
  deps: RunAskDeps
): Promise<AskTarget | "cancelled" | undefined> {
  if (entry.kind === "project") {
    const resolved = await resolveUnscopedProject(deps.scope);
    if (!resolved.ok) {
      if (resolved.error.kind === "cancelled") {
        return "cancelled";
      }
      deps.ui.showErrorMessage(messageForResolveError(resolved.error.kind));
      return undefined;
    }
    return resolved.target;
  }

  if (!entry.resourcePath) {
    deps.ui.showErrorMessage(MISSING_SELECTION_MESSAGE);
    return undefined;
  }

  const resolved = resolveSelectedResource(entry.resourcePath, deps.scope);
  if (!resolved.ok) {
    if (resolved.error.kind === "cancelled") {
      return "cancelled";
    }
    deps.ui.showErrorMessage(messageForResolveError(resolved.error.kind));
    return undefined;
  }
  if (
    entry.kind !== "file" ||
    !entry.selectedResourcePaths ||
    entry.selectedResourcePaths.length === 0
  ) {
    return resolved.target;
  }

  const taggedFilePaths: string[] = [];
  const seen = new Set<string>();
  for (const resourcePath of entry.selectedResourcePaths) {
    const folder = deps.scope.getWorkspaceFolderForPath(resourcePath);
    if (!folder || folder.fsPath !== resolved.target.projectRoot) {
      deps.ui.showErrorMessage(
        "Selected files must belong to the same workspace folder."
      );
      return undefined;
    }
    const relativePath = relativeScope(resolved.target.projectRoot, resourcePath);
    if (!relativePath || seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);
    taggedFilePaths.push(relativePath);
  }

  return {
    projectRoot: resolved.target.projectRoot,
    ...(taggedFilePaths.length === 1
      ? { scope: taggedFilePaths[0] }
      : {}),
    taggedFilePaths,
  };
}

function taggedReference(relativePath: string): string {
  const escaped = relativePath
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  return `@"${escaped}"`;
}

export function appendTaggedFileReferences(
  goal: string,
  relativePaths: readonly string[] | undefined
): string {
  if (!relativePaths || relativePaths.length === 0) {
    return goal;
  }
  return `${goal}\n\n${relativePaths.map(taggedReference).join("\n")}`;
}
