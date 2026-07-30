import type { PromptRequest } from "../client/types";

/**
 * Minimal transient in-memory state for the active Ask flow.
 *
 * Retains the normalized request (and Prompt 1 text) only until the user
 * cancels, submits a blank AI response, or the flow completes. Never log or
 * persist these fields to disk, workspace state, or output channels.
 */
export type ActiveAskFlowState = {
  /** Normalized request from scope resolution + user goal. */
  request: PromptRequest;
  /** Exact Prompt 1 text already written to the clipboard. */
  prompt1: string;
  /**
   * Validated selector text once the user submits a valid AI response.
   * Undefined until syntax validation succeeds.
   */
  selectors?: string;
};

/** Create flow state after a successful Prompt 1 generation. */
export function createActiveAskFlowState(
  request: PromptRequest,
  prompt1: string
): ActiveAskFlowState {
  return { request, prompt1 };
}

/**
 * Clear sensitive fields in place so callers can drop references without
 * leaving residual strings on a shared object.
 */
export function clearActiveAskFlowState(state: ActiveAskFlowState): void {
  state.request = {
    projectRoot: "",
    request: "",
    focus: "design",
  };
  state.prompt1 = "";
  delete state.selectors;
}
