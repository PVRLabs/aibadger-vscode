import * as assert from "node:assert/strict";
import { resolveScmSelection, type ScmResource, type ScmUri } from "./scmSelection";

function uri(path: string, scheme = "file"): ScmUri {
  return { fsPath: path, scheme, toString: () => `${scheme}://${path}` };
}

function resource(path: string, scheme = "file"): ScmResource {
  return { resourceUri: uri(path, scheme) };
}

suite("resolveScmSelection", () => {
  test("uses the clicked resource when VS Code supplies no multi-selection", () => {
    const result = resolveScmSelection(resource("/repo/a.ts"), undefined);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), ["/repo/a.ts"]);
  });

  test("uses the ordered selected resources when the clicked resource is included", () => {
    const result = resolveScmSelection(resource("/repo/b.ts"), [
      resource("/repo/b.ts"),
      resource("/repo/a.ts"),
    ]);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), [
      "/repo/b.ts",
      "/repo/a.ts",
    ]);
  });

  test("ignores a multi-selection that belongs to another SCM context", () => {
    const result = resolveScmSelection(resource("/repo/c.ts"), [
      resource("/repo/a.ts"),
      resource("/repo/a.ts"),
    ]);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), ["/repo/c.ts"]);
  });

  test("deduplicates selected resources without changing order", () => {
    const result = resolveScmSelection(undefined, [
      resource("/repo/b.ts"),
      resource("/repo/a.ts"),
      resource("/repo/b.ts"),
    ]);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), [
      "/repo/b.ts",
      "/repo/a.ts",
    ]);
  });

  test("rejects non-file SCM resources", () => {
    assert.deepStrictEqual(resolveScmSelection(resource("repo/a", "git"), undefined), {
      ok: false,
      reason: "non-file-resource",
    });
  });

  test("rejects an empty invocation", () => {
    assert.deepStrictEqual(resolveScmSelection(undefined, undefined), {
      ok: false,
      reason: "no-files",
    });
  });
});
