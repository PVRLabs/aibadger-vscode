import * as assert from "assert";
import { formatAdditionalContext } from "./formatAdditionalContext";

suite("formatAdditionalContext", () => {
  test("formats one file without a question and ends with a newline", () => {
    assert.strictEqual(
      formatAdditionalContext("", [
        { path: "src/extension.ts", contents: "export {};" },
      ]),
      [
        "[ADDITIONAL CONTEXT]",
        "",
        "--- File: src/extension.ts (Full File) ---",
        "export {};",
        "--- End File ---",
        "",
      ].join("\n")
    );
  });

  test("trims and includes a nonempty question", () => {
    assert.strictEqual(
      formatAdditionalContext("  How do these coordinate? \n", [
        { path: "src/a.ts", contents: "a\n" },
      ]),
      [
        "[QUESTION]",
        "How do these coordinate?",
        "",
        "[ADDITIONAL CONTEXT]",
        "",
        "--- File: src/a.ts (Full File) ---",
        "a",
        "--- End File ---",
        "",
      ].join("\n")
    );
  });

  test("omits a whitespace-only question and normalizes Windows paths", () => {
    const output = formatAdditionalContext(" \n\t ", [
      { path: "src\\client\\types.ts", contents: "type T = string;\n" },
    ]);
    assert.ok(!output.includes("[QUESTION]"));
    assert.ok(output.includes("--- File: src/client/types.ts (Full File) ---"));
  });

  test("separates multiple file blocks with one blank line", () => {
    assert.strictEqual(
      formatAdditionalContext(undefined, [
        { path: "a.ts", contents: "a" },
        { path: "b.ts", contents: "b\n" },
      ]),
      [
        "[ADDITIONAL CONTEXT]",
        "",
        "--- File: a.ts (Full File) ---",
        "a",
        "--- End File ---",
        "",
        "--- File: b.ts (Full File) ---",
        "b",
        "--- End File ---",
        "",
      ].join("\n")
    );
  });

  test("lists excluded files without including their contents", () => {
    const output = formatAdditionalContext(
      undefined,
      [{ path: "small.ts", contents: "included" }],
      [
        {
          path: "assets\\large.txt",
          reason: "contents exceed the limit",
        },
      ]
    );
    assert.ok(output.includes("[EXCLUDED FILES]"));
    assert.ok(
      output.includes(
        "- assets/large.txt (contents exceed the limit)"
      )
    );
    assert.ok(output.includes("their contents were excluded from this prompt"));
  });

  test("formats compact binary metadata without binary contents", () => {
    assert.strictEqual(
      formatAdditionalContext(undefined, [
        { path: "assets/hero.png", binaryType: "PNG", size: "220 KB" },
      ]),
      [
        "[ADDITIONAL CONTEXT]",
        "",
        "--- File: assets/hero.png (Binary File) ---",
        "Type: PNG",
        "Size: 220 KB",
        "--- End File ---",
        "",
      ].join("\n")
    );
  });
});
