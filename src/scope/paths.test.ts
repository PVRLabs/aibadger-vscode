import * as assert from "assert";
import * as path from "path";
import { isPathInsideRoot, relativeScope } from "./paths";

suite("relativeScope", () => {
  const root = path.join(path.sep, "projects", "aibadger");

  test("returns undefined for the project root itself", () => {
    assert.strictEqual(relativeScope(root, root), undefined);
  });

  test("returns posix-relative path for a nested folder", () => {
    const folder = path.join(root, "internal", "scanner");
    assert.strictEqual(relativeScope(root, folder), "internal/scanner");
  });

  test("returns posix-relative path for a nested file", () => {
    const file = path.join(root, "cmd", "badger", "main.go");
    assert.strictEqual(relativeScope(root, file), "cmd/badger/main.go");
  });

  test("returns undefined for a path outside the root", () => {
    const outside = path.join(path.sep, "other", "repo", "file.go");
    assert.strictEqual(relativeScope(root, outside), undefined);
  });
});

suite("isPathInsideRoot", () => {
  const root = path.join(path.sep, "projects", "aibadger");

  test("true for root and nested paths", () => {
    assert.strictEqual(isPathInsideRoot(root, root), true);
    assert.strictEqual(
      isPathInsideRoot(root, path.join(root, "pkg", "x.go")),
      true
    );
  });

  test("false for sibling paths", () => {
    assert.strictEqual(
      isPathInsideRoot(root, path.join(path.sep, "projects", "other")),
      false
    );
  });
});
