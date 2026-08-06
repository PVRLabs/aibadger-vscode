/**
 * Normalized request every Explorer entry point produces before CLI generation.
 * Aligned with `badger api prompt` semantics: root + optional scope + goal text.
 * Relative scope is resolved in the extension only; only root is sent on the wire.
 */
export type PromptFocus = "code" | "design";

export type PromptRequest = {
  /** Absolute workspace / Badger project root. */
  projectRoot: string;
  /** Root-relative file or folder scope (`/` separators), when selected. */
  scope?: string;
  /**
   * Free-form user goal (trimmed). The Ask flow maps blank UI goals to the
   * neutral exploration goal before calling the client.
   */
  request: string;
  /** Prompt framing passed to both API operations for one conversation. */
  focus: PromptFocus;
};

/**
 * Extraction request after local selector syntax validation.
 * Carries the original normalized request plus validated selector text.
 * Relative scope remains extension-only; extract receives `--root` only.
 */
export type ExtractRequest = {
  projectRoot: string;
  scope?: string;
  /** Original user goal (same as PromptRequest.request). */
  request: string;
  /** Validated FILE/PREFIX/NEAR lines (nonblank, normalized). */
  selectors: string;
  /** The same focus used to create Prompt 1. */
  focus: PromptFocus;
};

export type ClientFailureKind =
  | "generationFailed"
  | "executableUnavailable"
  | "unsupportedApi"
  | "malformedResult"
  | "cancelled";

export type GeneratePromptSuccess = {
  ok: true;
  /** Complete Prompt 1 text for the clipboard / external AI chat. */
  prompt: string;
};

export type GeneratePromptFailure = {
  ok: false;
  kind: ClientFailureKind;
  /** Short diagnostic safe for UI (no full prompt / source dumps). */
  message: string;
};

export type GeneratePromptResult = GeneratePromptSuccess | GeneratePromptFailure;

export type ExtractPromptSuccess = {
  ok: true;
  /** Complete Prompt 2 text for the clipboard / external AI chat. */
  prompt: string;
};

export type ExtractPromptFailure = {
  ok: false;
  kind: ClientFailureKind;
  /** Short diagnostic safe for UI (no selectors / prompt / source dumps). */
  message: string;
};

export type ExtractPromptResult = ExtractPromptSuccess | ExtractPromptFailure;

/**
 * Replaceable Badger boundary.
 * Production: process client (`createBadgerCliClient`) against the local
 * `badger` CLI API. Tests: injectable in-process mock or a fake `BadgerClient`.
 */
export interface BadgerClient {
  generatePrompt(request: PromptRequest): Promise<GeneratePromptResult>;
  extractPrompt(request: ExtractRequest): Promise<ExtractPromptResult>;
}

export type ReviewMode = "default" | "staged" | "branch" | "commit";

export type ReviewContextRequest = {
  /** Absolute root of exactly one Git repository. */
  repositoryRoot: string;
  mode?: ReviewMode;
  /** Revision required by branch and commit modes. */
  ref?: string;
  /** Optional editable user guidance, transported through a UTF-8 temp file. */
  guidance?: string;
  /** Literal repository-relative paths, transported as a JSON array. */
  selectedPaths?: readonly string[];
  maxPayloadBytes?: number;
  maxFileBytes?: number;
  signal?: AbortSignal;
};

export type ReviewContinuationRequest = {
  repositoryRoot: string;
  /** Selector-only FILE/PREFIX/NEAR input. */
  selectors: string;
  maxPayloadBytes?: number;
  maxFileBytes?: number;
  signal?: AbortSignal;
};

export type ReviewApiCapabilities = {
  reviewContext: boolean;
  reviewContinuation: boolean;
};

export type ReviewCapabilityResult =
  | { ok: true; capabilities: ReviewApiCapabilities }
  | GeneratePromptFailure;

/** Badger-backed operations used by the future Deep Review controller. */
export interface BadgerReviewClient {
  reviewCapabilities(): Promise<ReviewCapabilityResult>;
  reviewContext(request: ReviewContextRequest): Promise<GeneratePromptResult>;
  reviewContinuation(
    request: ReviewContinuationRequest
  ): Promise<GeneratePromptResult>;
}
