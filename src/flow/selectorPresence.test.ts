import * as assert from "assert";
import { hasSelectorLikeContent } from "./selectors";

suite("hasSelectorLikeContent", () => {
  test("false for empty and prose", () => {
    assert.strictEqual(hasSelectorLikeContent(""), false);
    assert.strictEqual(hasSelectorLikeContent("   \n"), false);
    assert.strictEqual(
      hasSelectorLikeContent("Here are the files you need:"),
      false
    );
  });

  test("true when FILE: PREFIX: or NEAR: appears on a line", () => {
    assert.strictEqual(hasSelectorLikeContent("FILE:README.md"), true);
    assert.strictEqual(hasSelectorLikeContent("prefix:x.go#y"), true);
    assert.strictEqual(hasSelectorLikeContent("  NEAR:a.go#// x"), true);
    assert.strictEqual(
      hasSelectorLikeContent("intro\nFILE:a.go\n"),
      true
    );
  });

  test("false for incomplete operator without colon form", () => {
    assert.strictEqual(hasSelectorLikeContent("FILE"), false);
    assert.strictEqual(hasSelectorLikeContent("FILE README"), false);
  });
});
