import * as assert from "assert";
import * as path from "path";
import {
  messageForResolveError,
  resolveSelectedResource,
  resolveUnscopedProject,
} from "./resolve";
import type { ResolveScopeDeps, WorkspaceFolderRef } from "./types";

const rootA = path.join(path.sep, "ws", "alpha");
const rootB = path.join(path.sep, "ws", "beta");

const folderA: WorkspaceFolderRef = { name: "alpha", fsPath: rootA };
const folderB: WorkspaceFolderRef = { name: "beta", fsPath: rootB };

function depsFor(
  folders: readonly WorkspaceFolderRef[],
  pick?: (folders: readonly WorkspaceFolderRef[]) => Promise<WorkspaceFolderRef | undefined>
): ResolveScopeDeps {
  return {
    getWorkspaceFolders: () => folders,
    getWorkspaceFolderForPath: (resourcePath: string) => {
      const resolved = path.resolve(resourcePath);
      return folders.find((f) => {
        const root = path.resolve(f.fsPath);
        const rel = path.relative(root, resolved);
        return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
      });
    },
    pickWorkspaceFolder:
      pick ??
      (async () => {
        throw new Error("pickWorkspaceFolder should not be called");
      }),
  };
}

suite("resolveUnscopedProject (toolbar / project)", () => {
  test("single-root uses that folder with no scope", async () => {
    const result = await resolveUnscopedProject(depsFor([folderA]));
    assert.deepStrictEqual(result, {
      ok: true,
      target: { projectRoot: rootA },
    });
  });

  test("no workspace returns noWorkspace", async () => {
    const result = await resolveUnscopedProject(depsFor([]));
    assert.deepStrictEqual(result, {
      ok: false,
      error: { kind: "noWorkspace" },
    });
  });

  test("multi-root uses picker selection", async () => {
    const result = await resolveUnscopedProject(
      depsFor([folderA, folderB], async () => folderB)
    );
    assert.deepStrictEqual(result, {
      ok: true,
      target: { projectRoot: rootB },
    });
  });

  test("multi-root picker decline is cancelled", async () => {
    const result = await resolveUnscopedProject(
      depsFor([folderA, folderB], async () => undefined)
    );
    assert.deepStrictEqual(result, {
      ok: false,
      error: { kind: "cancelled" },
    });
  });
});

suite("resolveSelectedResource (file / folder)", () => {
  test("selected nested folder keeps workspace root and relative scope", () => {
    const selected = path.join(rootA, "internal", "scanner");
    const result = resolveSelectedResource(selected, depsFor([folderA]));
    assert.deepStrictEqual(result, {
      ok: true,
      target: { projectRoot: rootA, scope: "internal/scanner" },
    });
  });

  test("selected nested file keeps workspace root and relative scope", () => {
    const selected = path.join(rootA, "cmd", "main.go");
    const result = resolveSelectedResource(selected, depsFor([folderA]));
    assert.deepStrictEqual(result, {
      ok: true,
      target: { projectRoot: rootA, scope: "cmd/main.go" },
    });
  });

  test("selected item in multi-root uses containing root", () => {
    const selected = path.join(rootB, "pkg", "x.ts");
    const result = resolveSelectedResource(
      selected,
      depsFor([folderA, folderB])
    );
    assert.deepStrictEqual(result, {
      ok: true,
      target: { projectRoot: rootB, scope: "pkg/x.ts" },
    });
  });

  test("selected workspace root itself has no scope", () => {
    const result = resolveSelectedResource(rootA, depsFor([folderA]));
    assert.deepStrictEqual(result, {
      ok: true,
      target: { projectRoot: rootA },
    });
  });

  test("outside workspace selection fails", () => {
    const outside = path.join(path.sep, "tmp", "elsewhere", "file.go");
    const result = resolveSelectedResource(outside, depsFor([folderA]));
    assert.deepStrictEqual(result, {
      ok: false,
      error: { kind: "outsideWorkspace" },
    });
  });
});

suite("messageForResolveError", () => {
  test("messages are concise and distinct", () => {
    assert.ok(messageForResolveError("noWorkspace").includes("No workspace"));
    assert.ok(
      messageForResolveError("outsideWorkspace").includes("outside")
    );
  });
});
