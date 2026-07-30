import * as assert from "assert";
import {
  ASK_FILES_SELECTION_MESSAGE,
  ASK_FILES_STAT_MESSAGE,
  resolveAskFileSelection,
  type AskSelectionDeps,
} from "./askSelection";
import type { SelectionUri } from "../selection/explorerSelection";

function uri(fsPath: string): SelectionUri {
  return {
    fsPath,
    toString: () => `file://${fsPath}`,
  };
}

function deps(
  activeFileUri?: SelectionUri,
  stat: AskSelectionDeps["stat"] = async () => ({ isFile: true })
): AskSelectionDeps {
  return {
    getActiveFileUri: () => activeFileUri,
    stat,
  };
}

suite("resolveAskFileSelection", () => {
  test("uses the full ordered Explorer selection when the clicked file is selected", async () => {
    const first = uri("/work/b.ts");
    const second = uri("/work/a.ts");

    const result = await resolveAskFileSelection(
      first,
      [second, first],
      deps()
    );

    assert.deepStrictEqual(result, {
      ok: true,
      entry: {
        kind: "file",
        resourcePath: "/work/a.ts",
        selectedResourcePaths: ["/work/a.ts", "/work/b.ts"],
      },
    });
  });

  test("uses only a clicked file outside the current Explorer selection", async () => {
    const clicked = uri("/work/c.ts");
    const result = await resolveAskFileSelection(
      clicked,
      [uri("/work/a.ts"), uri("/work/b.ts")],
      deps()
    );

    assert.deepStrictEqual(result, {
      ok: true,
      entry: {
        kind: "file",
        resourcePath: "/work/c.ts",
        selectedResourcePaths: ["/work/c.ts"],
      },
    });
  });

  test("deduplicates Explorer selection without changing its order", async () => {
    const first = uri("/work/a.ts");
    const duplicate = uri("/work/a.ts");
    const second = uri("/work/b.ts");
    const result = await resolveAskFileSelection(
      first,
      [first, duplicate, second],
      deps()
    );

    assert.ok(result.ok);
    assert.deepStrictEqual(result.entry.selectedResourcePaths, [
      "/work/a.ts",
      "/work/b.ts",
    ]);
  });

  test("falls back to the active editor for non-Explorer invocation", async () => {
    const active = uri("/work/active.ts");
    const result = await resolveAskFileSelection(undefined, undefined, deps(active));

    assert.deepStrictEqual(result, {
      ok: true,
      entry: {
        kind: "file",
        resourcePath: "/work/active.ts",
        selectedResourcePaths: ["/work/active.ts"],
      },
    });
  });

  test("preserves the missing-selection entry when no active file exists", async () => {
    const result = await resolveAskFileSelection(undefined, undefined, deps());
    assert.deepStrictEqual(result, { ok: true, entry: { kind: "file" } });
  });

  test("rejects a mixed file and folder selection", async () => {
    const folder = uri("/work/src");
    const result = await resolveAskFileSelection(
      folder,
      [uri("/work/a.ts"), folder],
      deps(undefined, async (candidate) => ({
        isFile: candidate.fsPath.endsWith(".ts"),
      }))
    );

    assert.deepStrictEqual(result, {
      ok: false,
      message: ASK_FILES_SELECTION_MESSAGE,
    });
  });

  test("maps stat failures to a stable user-facing error", async () => {
    const result = await resolveAskFileSelection(
      uri("/work/deleted.ts"),
      undefined,
      deps(undefined, async () => {
        throw new Error("ENOENT");
      })
    );

    assert.deepStrictEqual(result, {
      ok: false,
      message: ASK_FILES_STAT_MESSAGE,
    });
  });
});
