import type {
  BadgerClient,
  BadgerReviewClient,
  ExtractPromptResult,
  ExtractRequest,
  GeneratePromptResult,
  PromptRequest,
  ReviewContextRequest,
  ReviewContinuationRequest,
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

type RecoverableResult = GeneratePromptResult | ExtractPromptResult;

type RecoveryOptions<TClient> = {
  createClient: (executable?: string) => TClient;
  recoverExecutable: () => Promise<string | undefined>;
  recoverUnsupportedApi?: () => Promise<string | undefined>;
};

function createRecoveryRunner<TClient>(options: RecoveryOptions<TClient>) {
  let chosenExecutable: string | undefined;

  return async function recover<T extends RecoverableResult>(
    run: (client: TClient) => Promise<T>
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
  };
}

/** Reuse stateful CLI clients while still observing changes to the configured path. */
export function createExecutableClientCache<TClient>(
  resolveDefaultExecutable: () => string,
  createClient: (executable: string) => TClient
): (executable?: string) => TClient {
  const clients = new Map<string, TClient>();
  return (executable) => {
    const resolvedExecutable = executable ?? resolveDefaultExecutable();
    if (clients.has(resolvedExecutable)) {
      return clients.get(resolvedExecutable) as TClient;
    }
    const client = createClient(resolvedExecutable);
    clients.set(resolvedExecutable, client);
    return client;
  };
}

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
  const recover = createRecoveryRunner(options);

  return {
    generatePrompt(request: PromptRequest): Promise<GeneratePromptResult> {
      return recover((client) => client.generatePrompt(request));
    },
    extractPrompt(request: ExtractRequest): Promise<ExtractPromptResult> {
      return recover((client) => client.extractPrompt(request));
    },
  };
}

export type ReviewExecutableRecoveryOptions = {
  createClient: (executable?: string) => BadgerReviewClient;
  recoverExecutable: () => Promise<string | undefined>;
  recoverUnsupportedApi?: () => Promise<string | undefined>;
};

/** Apply the same one-retry executable recovery policy to Deep Review calls. */
export function createReviewExecutableRecoveringClient(
  options: ReviewExecutableRecoveryOptions
): BadgerReviewClient {
  const recover = createRecoveryRunner(options);

  return {
    reviewContext(request: ReviewContextRequest): Promise<GeneratePromptResult> {
      return recover((client) => client.reviewContext(request));
    },
    reviewContinuation(
      request: ReviewContinuationRequest
    ): Promise<GeneratePromptResult> {
      return recover((client) => client.reviewContinuation(request));
    },
  };
}
