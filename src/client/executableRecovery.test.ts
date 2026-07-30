import * as assert from "assert";
import type { BadgerClient, PromptRequest } from "./types";
import { createExecutableRecoveringClient } from "./executableRecovery";

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
