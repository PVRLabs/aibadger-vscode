import * as assert from "assert";
import {
  clearActiveAskFlowState,
  createActiveAskFlowState,
} from "./flowState";

suite("ActiveAskFlowState", () => {
  test("create retains request and prompt1 only in memory", () => {
    const state = createActiveAskFlowState(
      {
        projectRoot: "/ws",
        scope: "pkg",
        request: "goal text",
        focus: "design",
      },
      "PROMPT1 BODY"
    );
    assert.strictEqual(state.request.projectRoot, "/ws");
    assert.strictEqual(state.request.scope, "pkg");
    assert.strictEqual(state.request.request, "goal text");
    assert.strictEqual(state.prompt1, "PROMPT1 BODY");
    assert.strictEqual(state.selectors, undefined);
  });

  test("clear wipes transient fields", () => {
    const state = createActiveAskFlowState(
      { projectRoot: "/ws", request: "goal", focus: "design" },
      "p1"
    );
    state.selectors = "FILE:a.go";
    clearActiveAskFlowState(state);
    assert.strictEqual(state.request.projectRoot, "");
    assert.strictEqual(state.request.request, "");
    assert.strictEqual(state.request.focus, "design");
    assert.strictEqual(state.prompt1, "");
    assert.strictEqual(state.selectors, undefined);
  });
});
