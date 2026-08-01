import * as assert from "node:assert/strict";
import {
  resolveScmSelection,
  resolveScmUris,
  type ScmResource,
  type ScmUri,
} from "./scmSelection";

function uri(path: string, scheme = "file"): ScmUri {
  return { fsPath: path, scheme, toString: () => `${scheme}://${path}` };
}

function resource(path: string, scheme = "file"): ScmResource {
  return { resourceUri: uri(path, scheme) };
}

const deps = {
  stat: async (item: ScmUri) => ({ isFile: !item.fsPath.endsWith("/") }),
  getRepositoryRoot: async (item: ScmUri) => item.fsPath.startsWith("/other/") ? "/other" : "/repo",
  getRelativePath: (item: ScmUri, root: string) => item.fsPath.slice(root.length + 1),
};

suite("resolveScmUris", () => {
  test("uses the clicked resource when VS Code supplies no multi-selection", () => {
    const result = resolveScmUris(resource("/repo/a.ts"), undefined);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), ["/repo/a.ts"]);
  });

  test("uses the ordered selected resources when the clicked resource is included", () => {
    const result = resolveScmUris(resource("/repo/b.ts"), [
      resource("/repo/b.ts"),
      resource("/repo/a.ts"),
    ]);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), [
      "/repo/b.ts",
      "/repo/a.ts",
    ]);
  });

  test("uses only the clicked resource when it is outside the supplied selection", () => {
    const result = resolveScmUris(resource("/repo/c.ts"), [
      resource("/repo/a.ts"),
      resource("/repo/a.ts"),
    ]);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), ["/repo/c.ts"]);
  });

  test("deduplicates selected resources without changing order", () => {
    const result = resolveScmUris(undefined, [
      resource("/repo/b.ts"),
      resource("/repo/a.ts"),
      resource("/repo/b.ts"),
    ]);
    assert.deepStrictEqual(result.ok && result.uris.map((item) => item.fsPath), [
      "/repo/b.ts",
      "/repo/a.ts",
    ]);
  });

  test("rejects non-file resources and empty invocation", () => {
    assert.deepStrictEqual(resolveScmUris(resource("repo/a", "git"), undefined), {
      ok: false,
      reason: "non-file-resource",
    });
    assert.deepStrictEqual(resolveScmUris(undefined, undefined), {
      ok: false,
      reason: "no-files",
    });
  });
});

suite("resolveScmSelection", () => {
  test("returns one repository root and relative paths", async () => {
    const result = await resolveScmSelection(resource("/repo/b.ts"), [
      resource("/repo/b.ts"),
      resource("/repo/a.ts"),
    ], deps);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.repositoryRoot, "/repo");
      assert.deepStrictEqual(
        result.value.files.map((file) => [file.uri.fsPath, file.relativePath]),
        [["/repo/b.ts", "b.ts"], ["/repo/a.ts", "a.ts"]]
      );
    }
  });

  test("rejects folders, missing files, invalid paths, and cross-repository selections", async () => {
    assert.deepStrictEqual(
      await resolveScmSelection(resource("/repo/folder/"), undefined, deps),
      { ok: false, reason: "folder" }
    );
    assert.deepStrictEqual(
      await resolveScmSelection(resource("/missing/a.ts"), undefined, {
        ...deps,
        stat: async () => { throw { code: "ENOENT" }; },
      }),
      { ok: false, reason: "missing-file" }
    );
    assert.deepStrictEqual(
      await resolveScmSelection(resource("/unknown/a.ts"), undefined, {
        ...deps,
        getRepositoryRoot: async () => undefined,
      }),
      { ok: false, reason: "repository-root-unresolved" }
    );
    assert.deepStrictEqual(
      await resolveScmSelection(resource("/repo/a.ts"), undefined, {
        ...deps,
        getRelativePath: () => "../outside.ts",
      }),
      { ok: false, reason: "invalid-path" }
    );
    assert.deepStrictEqual(
      await resolveScmSelection(resource("/repo/a.ts"), [resource("/repo/a.ts"), resource("/other/b.ts")], deps),
      { ok: false, reason: "cross-repository" }
    );
  });

  test("allows a marked deleted SCM resource to resolve after it leaves disk", async () => {
    const result = await resolveScmSelection({
      ...resource("/repo/deleted.ts"),
      isDeleted: true,
    }, undefined, {
      ...deps,
      stat: async () => { throw { code: "ENOENT" }; },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.files.map((file) => file.relativePath), ["deleted.ts"]);
      assert.equal(result.value.files[0].isDeleted, true);
    }
  });

  test("does not preserve stale deleted metadata when the file exists", async () => {
    const result = await resolveScmSelection({
      ...resource("/repo/recreated.ts"),
      isDeleted: true,
    }, undefined, deps);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.files[0].isDeleted, undefined);
  });

  test("normalizes Windows separators before validating traversal", async () => {
    const result = await resolveScmSelection(resource("/repo/a.ts"), undefined, {
      ...deps,
      getRelativePath: () => "..\\outside.ts",
    });
    assert.deepStrictEqual(result, { ok: false, reason: "invalid-path" });
  });

  test("rejects drive-absolute paths and preserves stat failures", async () => {
    assert.deepStrictEqual(
      await resolveScmSelection(resource("/repo/a.ts"), undefined, {
        ...deps,
        getRelativePath: () => "C:\\outside.ts",
      }),
      { ok: false, reason: "invalid-path" }
    );
    assert.deepStrictEqual(
      await resolveScmSelection(resource("/repo/a.ts"), undefined, {
        ...deps,
        stat: async () => { throw { code: "EACCES" }; },
      }),
      { ok: false, reason: "stat-failed" }
    );
  });

  test("deduplicates by normalized repository-relative path", async () => {
    const result = await resolveScmSelection(resource("/repo/a.ts"), [
      resource("/repo/a.ts"),
      resource("/repo/a.ts"),
    ], deps);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.value.files.map((file) => file.relativePath), ["a.ts"]);
    }
  });
});
