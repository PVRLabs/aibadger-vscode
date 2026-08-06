import * as assert from "assert";
import type { BadgerClient, BadgerReviewClient, PromptRequest } from "./types";
import {
  createExecutableRecoveringClient,
  createReviewExecutableRecoveringClient,
} from "./executableRecovery";

const request: PromptRequest = {
  projectRoot: "/workspace",
  request: "Explain this project.",
  focus: "design",
};

function unavailableClient(calls: string[], executable = "badger"): BadgerClient {
  return {
    async generatePrompt() {
      calls.push(`prompt:${executable}`);
      return {
        ok: false,
        kind: "executableUnavailable",
        message: `Badger executable not found: ${executable}`,
      };
    },
    async extractPrompt() {
      throw new Error("extract should not run");
    },
  };
}

suite("executable recovery client", () => {
  test("retries the original request with the chosen executable", async () => {
    const calls: string[] = [];
    let recoveryCalls = 0;
    const client = createExecutableRecoveringClient({
      createClient(executable) {
        if (!executable) {
          return unavailableClient(calls);
        }
        return {
          async generatePrompt(actualRequest) {
            calls.push(`prompt:${executable}`);
            assert.deepStrictEqual(actualRequest, request);
            return { ok: true, prompt: "generated prompt" };
          },
          async extractPrompt() {
            throw new Error("extract should not run");
          },
        };
      },
      async recoverExecutable() {
        recoveryCalls += 1;
        return "/opt/badger";
      },
    });

    const result = await client.generatePrompt(request);

    assert.deepStrictEqual(result, { ok: true, prompt: "generated prompt" });
    assert.deepStrictEqual(calls, ["prompt:badger", "prompt:/opt/badger"]);
    assert.strictEqual(recoveryCalls, 1);
  });

  test("returns the original failure when recovery is dismissed", async () => {
    const calls: string[] = [];
    const client = createExecutableRecoveringClient({
      createClient: () => unavailableClient(calls),
      async recoverExecutable() {
        return undefined;
      },
    });

    const result = await client.generatePrompt(request);

    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(calls, ["prompt:badger"]);
  });

  test("retries an interrupted extraction with the chosen executable", async () => {
    const calls: string[] = [];
    const extractRequest = {
      ...request,
      selectors: "FILE:README.md",
    };
    const client = createExecutableRecoveringClient({
      createClient(executable) {
        return {
          async generatePrompt() {
            throw new Error("prompt should not run");
          },
          async extractPrompt(actualRequest) {
            calls.push(`extract:${executable ?? "badger"}`);
            assert.deepStrictEqual(actualRequest, extractRequest);
            if (!executable) {
              return {
                ok: false,
                kind: "executableUnavailable",
                message: "Badger executable not found: badger",
              };
            }
            return { ok: true, prompt: "extracted prompt" };
          },
        };
      },
      async recoverExecutable() {
        return "/opt/badger";
      },
    });

    const result = await client.extractPrompt(extractRequest);

    assert.deepStrictEqual(result, { ok: true, prompt: "extracted prompt" });
    assert.deepStrictEqual(calls, ["extract:badger", "extract:/opt/badger"]);
  });

  test("does not offer recovery for an ordinary Badger failure", async () => {
    let recoveryCalls = 0;
    const client = createExecutableRecoveringClient({
      createClient: () => ({
        async generatePrompt() {
          return {
            ok: false,
            kind: "generationFailed",
            message: "Badger failed.",
          };
        },
        async extractPrompt() {
          throw new Error("extract should not run");
        },
      }),
      async recoverExecutable() {
        recoveryCalls += 1;
        return "/opt/badger";
      },
    });

    const result = await client.generatePrompt(request);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(recoveryCalls, 0);
  });

  test("offers upgrade recovery for an unsupported API and retries once", async () => {
    const calls: string[] = [];
    let upgradeRecoveryCalls = 0;
    const client = createExecutableRecoveringClient({
      createClient(executable) {
        return {
          async generatePrompt() {
            calls.push(`prompt:${executable ?? "badger"}`);
            if (!executable) {
              return {
                ok: false,
                kind: "unsupportedApi",
                message: "Installed Badger does not support the required API.",
              };
            }
            return { ok: true, prompt: "generated prompt" };
          },
          async extractPrompt() {
            throw new Error("extract should not run");
          },
        };
      },
      async recoverExecutable() {
        throw new Error("missing-executable recovery should not run");
      },
      async recoverUnsupportedApi() {
        upgradeRecoveryCalls += 1;
        return "/opt/newer-badger";
      },
    });

    const result = await client.generatePrompt(request);

    assert.deepStrictEqual(result, { ok: true, prompt: "generated prompt" });
    assert.deepStrictEqual(calls, [
      "prompt:badger",
      "prompt:/opt/newer-badger",
    ]);
    assert.strictEqual(upgradeRecoveryCalls, 1);
  });

  test("remembers the chosen executable for later operations", async () => {
    const calls: string[] = [];
    const client = createExecutableRecoveringClient({
      createClient(executable) {
        if (!executable) {
          return unavailableClient(calls);
        }
        return {
          async generatePrompt() {
            calls.push(`prompt:${executable}`);
            return { ok: true, prompt: "generated prompt" };
          },
          async extractPrompt() {
            calls.push(`extract:${executable}`);
            return { ok: true, prompt: "extracted prompt" };
          },
        };
      },
      async recoverExecutable() {
        return "/opt/badger";
      },
    });

    await client.generatePrompt(request);
    await client.extractPrompt({
      ...request,
      selectors: "FILE:README.md",
    });

    assert.deepStrictEqual(calls, [
      "prompt:badger",
      "prompt:/opt/badger",
      "extract:/opt/badger",
    ]);
  });
});

suite("Deep Review executable recovery client", () => {
  function reviewClient(
    executable: string | undefined,
    calls: string[]
  ): BadgerReviewClient {
    const label = executable ?? "badger";
    return {
      async reviewCapabilities() {
        calls.push(`capabilities:${label}`);
        return executable
          ? { ok: true, capabilities: { reviewContext: true, reviewContinuation: true } }
          : {
              ok: false,
              kind: "executableUnavailable",
              message: "Badger executable not found",
            };
      },
      async reviewContext() {
        calls.push(`context:${label}`);
        return executable
          ? { ok: true, prompt: "review" }
          : {
              ok: false,
              kind: "executableUnavailable",
              message: "Badger executable not found",
            };
      },
      async reviewContinuation() {
        calls.push(`continuation:${label}`);
        return { ok: true, prompt: "supplemental" };
      },
    };
  }

  test("retries review capability and generation calls with one chosen executable", async () => {
    const calls: string[] = [];
    const client = createReviewExecutableRecoveringClient({
      createClient: (executable) => reviewClient(executable, calls),
      recoverExecutable: async () => "/opt/badger",
    });
    const capabilities = await client.reviewCapabilities();
    const context = await client.reviewContext({ repositoryRoot: "/repo" });
    const continuation = await client.reviewContinuation({
      repositoryRoot: "/repo",
      selectors: "FILE:README.md",
    });
    assert.strictEqual(capabilities.ok, true);
    assert.deepStrictEqual(context, { ok: true, prompt: "review" });
    assert.deepStrictEqual(continuation, { ok: true, prompt: "supplemental" });
    assert.deepStrictEqual(calls, [
      "capabilities:badger",
      "capabilities:/opt/badger",
      "context:/opt/badger",
      "continuation:/opt/badger",
    ]);
  });

  test("does not recover cancellation", async () => {
    let recoveryCalls = 0;
    const client = createReviewExecutableRecoveringClient({
      createClient: () => ({
        async reviewCapabilities() {
          return { ok: true, capabilities: { reviewContext: true, reviewContinuation: true } };
        },
        async reviewContext() {
          return { ok: false, kind: "cancelled", message: "cancelled" };
        },
        async reviewContinuation() {
          return { ok: false, kind: "cancelled", message: "cancelled" };
        },
      }),
      recoverExecutable: async () => {
        recoveryCalls += 1;
        return "/opt/badger";
      },
    });
    const result = await client.reviewContext({ repositoryRoot: "/repo" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(recoveryCalls, 0);
  });

  test("recovers an installed executable that lacks review-context", async () => {
    const calls: string[] = [];
    const client = createReviewExecutableRecoveringClient({
      createClient: (executable) => ({
        async reviewCapabilities() {
          const label = executable ?? "badger";
          calls.push(`capabilities:${label}`);
          return executable
            ? { ok: true, capabilities: { reviewContext: true, reviewContinuation: true } }
            : { ok: true, capabilities: { reviewContext: false, reviewContinuation: false } };
        },
        async reviewContext() {
          return { ok: true, prompt: "review" };
        },
        async reviewContinuation() {
          return { ok: true, prompt: "supplemental" };
        },
      }),
      recoverExecutable: async () => {
        throw new Error("unavailable recovery should not run");
      },
      recoverUnsupportedApi: async () => "/opt/new-badger",
    });

    const result = await client.reviewCapabilities();

    assert.deepStrictEqual(result, {
      ok: true,
      capabilities: { reviewContext: true, reviewContinuation: true },
    });
    assert.deepStrictEqual(calls, [
      "capabilities:badger",
      "capabilities:/opt/new-badger",
    ]);
  });
});
