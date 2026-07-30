import type {
  BadgerClient,
  ExtractPromptResult,
  ExtractRequest,
  GeneratePromptResult,
  PromptRequest,
} from "./types";

export type ExecutableRecoveryOptions = {
  /** Build a client for the current configuration or an explicitly chosen path. */
  createClient: (executable?: string) => BadgerClient;
  /**
   * Explain the missing local prerequisite and offer recovery actions.
   * Return a chosen executable path to retry, or undefined for every other action.
   */
  recoverExecutable: () => Promise<string | undefined>;
  /**
   * Explain that the installed Badger lacks the required API capability and
   * offer upgrade / alternate-executable recovery.
   */
  recoverUnsupportedApi?: () => Promise<string | undefined>;
};

/**
 * Retry one failed operation after the user chooses a Badger executable.
 *
 * Recovery is deliberately limited to unavailable executables and recognized
 * missing API capabilities. Ordinary Badger command failures continue through
 * the normal wizard error path.
 */
export function createExecutableRecoveringClient(
  options: ExecutableRecoveryOptions
): BadgerClient {
  let chosenExecutable: string | undefined;

  async function recover<T extends GeneratePromptResult | ExtractPromptResult>(
    run: (client: BadgerClient) => Promise<T>
  ): Promise<T> {
    const result = await run(options.createClient(chosenExecutable));
    if (result.ok) {
      return result;
    }

    const recovery =
      result.kind === "executableUnavailable"
        ? options.recoverExecutable
        : result.kind === "unsupportedApi"
          ? options.recoverUnsupportedApi
          : undefined;
    if (!recovery) {
      return result;
    }

    const executable = await recovery();
    if (!executable) {
      return result;
    }

    chosenExecutable = executable;
    return run(options.createClient(executable));
  }

  return {
    generatePrompt(request: PromptRequest): Promise<GeneratePromptResult> {
      return recover((client) => client.generatePrompt(request));
    },
    extractPrompt(request: ExtractRequest): Promise<ExtractPromptResult> {
      return recover((client) => client.extractPrompt(request));
    },
  };
}
