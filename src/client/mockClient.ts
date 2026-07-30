import type {
  BadgerClient,
  ExtractPromptResult,
  ExtractRequest,
  GeneratePromptResult,
  PromptRequest,
} from "./types";

/**
 * Deterministic in-process client for unit tests and local harnesses.
 * Production activation uses `createBadgerCliClient` (local `badger` CLI).
 */
export function createInProcessMockClient(): BadgerClient {
  return {
    async generatePrompt(request: PromptRequest): Promise<GeneratePromptResult> {
      const prompt = formatMockPrompt(request);
      return { ok: true, prompt };
    },
    async extractPrompt(request: ExtractRequest): Promise<ExtractPromptResult> {
      const prompt = formatMockExtractPrompt(request);
      return { ok: true, prompt };
    },
  };
}

export function formatMockPrompt(request: PromptRequest): string {
  // Shape mirrors real `api prompt` topology sections so summary derivation
  // can be exercised in flow tests without invoking Badger.
  const lines = [
    "[PROJECT TOPOLOGY]",
    "Languages: Go",
    "Primary: Go",
    "Stack: Go Modules",
    "Structure: Single-Module",
    "",
    "[SOURCE TREE]",
    "Pkg: . [2 files] -> Top: README.md (1KB)",
    "Pkg: internal/scanner [3 files] -> Top: scanner.go (2KB)",
    "Pkg: cmd/demo [1 files] -> Top: main.go (500B)",
    "",
    "[TASK]",
    request.request,
    "",
    "[CONSTRAINT]",
    "Mock client — process BadgerClient uses the local badger CLI API.",
    request.scope ? `Scope note: ${request.scope}` : "Scope note: (project)",
  ];
  return lines.join("\n");
}

export function formatMockExtractPrompt(request: ExtractRequest): string {
  const lines = [
    "[PROJECT TOPOLOGY]",
    "Mock extract topology",
    "",
    "[TASK]",
    request.request,
    "",
    "[OUTPUT CONSTRAINT]",
    "Use the provided context to answer the task.",
    "",
    "[CONTEXT]",
    request.selectors,
  ];
  return lines.join("\n");
}
