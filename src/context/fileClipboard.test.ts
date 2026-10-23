import * as assert from "node:assert/strict";
import { getFileClipboard } from "./fileClipboard";

suite("file clipboard capabilities", () => {
  test("selects the local macOS backend", () => {
    assert.equal(typeof getFileClipboard("darwin", false)?.writeFiles, "function");
  });
  test("does not advertise unimplemented Windows or Linux backends", () => {
    for (const platform of ["win32", "linux", "unknown"]) {
      assert.equal(getFileClipboard(platform, false), undefined);
    }
  });
  test("remote hosts never advertise a desktop clipboard backend", () => {
    for (const platform of ["darwin", "win32", "linux"]) {
      assert.equal(getFileClipboard(platform, true), undefined);
    }
  });
});
