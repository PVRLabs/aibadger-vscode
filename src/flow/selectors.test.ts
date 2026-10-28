import * as assert from "assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSelectors } from "./selectors";

suite("validateSelectors", () => {
  for (const [name, count] of [["lines", 10], ["inline", 16]] as const) {
    test(`preserves the exact ChatGPT ${name} fixture paths as ${count} selectors`, () => {
      const input = readFileSync(join(__dirname, "../../test/fixtures", `chatgpt-${name}.txt`), "utf8");
      for (const text of [input, input.replace(/\r?\n/g, "\r\n")]) {
        const result = validateSelectors(text);
        assert.ok(result.ok);
        if (!result.ok) { return; }
        assert.strictEqual(result.selectors.length, count);
        assert.strictEqual(result.text.split("\n").length, count);
        assert.strictEqual(result.text.replace(/\n/g, " "), input.trim().replace(/\r?\n/g, " "));
        assert.deepStrictEqual(result.selectors.map(s => `FILE:${s.path}`), result.text.split("\n"));
        if (name === "inline") {
          assert.strictEqual(result.selectors[8].path, String.raw`internal/diagnose/command\_windows\_test.go`);
        } else {
          assert.strictEqual(result.selectors[0].path, "cmd/badger/main.go\\");
        }
      }
    });
  }

  test("splits FILE markers without rewriting spaces, escapes, or separators", () => {
    const result = validateSelectors(String.raw`FILE:docs/my file.md FILE:src\main\_test.go` + "\\\r\nFILE:other.go");
    assert.ok(result.ok);
    if (!result.ok) { return; }
    assert.deepStrictEqual(result.selectors.map(s => s.path), ["docs/my file.md", String.raw`src\main\_test.go` + "\\", "other.go"]);
    assert.deepStrictEqual(result.selectors.map(s => s.line), [1, 1, 2]);
  });

  test("leaves FILE text inside patterns and path components unchanged", () => {
    const input = "PREFIX:a.go#literal FILE:b.go FILE:c.go\nNEAR:b.go#FILE:x FILE:y\nFILE:docs/FILE:notes.md";
    const result = validateSelectors(input);
    assert.ok(result.ok);
    if (!result.ok) { return; }
    assert.strictEqual(result.selectors.length, 3);
    assert.strictEqual(result.text, input);
  });

  test("reports empty inline references on their original input line", () => {
    for (const input of ["FILE:a.go FILE:", "FILE: FILE:b.go"]) {
      const result = validateSelectors("FILE:ok.go\n" + input);
      assert.ok(!result.ok);
      if (result.ok) { return; }
      assert.strictEqual(result.line, 2);
      assert.ok(result.message.includes("missing path"));
    }
  });

  test("accepts all three forms and multiline input", () => {
    const input = [
      "FILE:README.md",
      "PREFIX:cmd/demo/main.go#func main",
      "NEAR:internal/greeting/greeting.go#// Hello",
    ].join("\n");

    const result = validateSelectors(input);
    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.selectors.length, 3);
    assert.deepStrictEqual(
      result.selectors.map((s) => s.type),
      ["FILE", "PREFIX", "NEAR"]
    );
    assert.strictEqual(result.selectors[0].path, "README.md");
    assert.strictEqual(result.selectors[1].path, "cmd/demo/main.go");
    assert.strictEqual(result.selectors[1].literal, "func main");
    assert.strictEqual(result.selectors[2].literal, "// Hello");
    assert.strictEqual(
      result.text,
      "FILE:README.md\nPREFIX:cmd/demo/main.go#func main\nNEAR:internal/greeting/greeting.go#// Hello"
    );
  });

  test("ignores blank lines between selectors", () => {
    const result = validateSelectors(
      "\nFILE:a.go\n\n  \nPREFIX:b.go#pkg\n\n"
    );
    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.selectors.length, 2);
    assert.strictEqual(result.selectors[0].line, 2);
    assert.strictEqual(result.selectors[1].line, 5);
  });

  test("keeps extra # characters inside PREFIX/NEAR literals", () => {
    const result = validateSelectors(
      "PREFIX:path/file.go#foo#bar#baz\nNEAR:x.go#a#b"
    );
    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.selectors[0].literal, "foo#bar#baz");
    assert.strictEqual(result.selectors[1].literal, "a#b");
    assert.strictEqual(result.selectors[0].raw, "PREFIX:path/file.go#foo#bar#baz");
  });

  test("normalizes operator case", () => {
    const result = validateSelectors("file:docs/a.md\nprefix:x.go#y\nnear:z.go#w");
    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepStrictEqual(
      result.selectors.map((s) => s.type),
      ["FILE", "PREFIX", "NEAR"]
    );
    assert.ok(result.text.startsWith("FILE:"));
  });

  test("rejects empty / whitespace-only input as no selectors", () => {
    for (const input of ["", "   ", "\n\n\t\n"]) {
      const result = validateSelectors(input);
      assert.strictEqual(result.ok, false);
      if (result.ok) {
        return;
      }
      assert.ok(result.message.toLowerCase().includes("at least one"));
    }
  });

  test("rejects missing path for FILE", () => {
    const result = validateSelectors("FILE:");
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.line, 1);
    assert.ok(result.message.includes("missing path"));
  });

  test("rejects PREFIX/NEAR without #", () => {
    for (const line of ["PREFIX:only/path.go", "NEAR:only/path.go"]) {
      const result = validateSelectors(line);
      assert.strictEqual(result.ok, false);
      if (result.ok) {
        return;
      }
      assert.ok(result.message.includes('missing "#"') || result.message.includes("path#literal"));
    }
  });

  test("rejects PREFIX/NEAR with missing path or literal around #", () => {
    const missingPath = validateSelectors("PREFIX:#literal");
    assert.strictEqual(missingPath.ok, false);
    if (!missingPath.ok) {
      assert.ok(missingPath.message.toLowerCase().includes("path"));
    }

    const missingLiteral = validateSelectors("NEAR:path.go#");
    assert.strictEqual(missingLiteral.ok, false);
    if (!missingLiteral.ok) {
      assert.ok(missingLiteral.message.toLowerCase().includes("literal"));
    }

    const onlyHash = validateSelectors("PREFIX:#");
    assert.strictEqual(onlyHash.ok, false);
  });

  test("rejects unknown operators and identifies the failing line", () => {
    const result = validateSelectors(
      "FILE:ok.go\nMAP:something\nNEAR:x.go#y"
    );
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.line, 2);
    assert.ok(result.message.includes("Line 2"));
    assert.ok(result.message.toLowerCase().includes("unknown"));
  });

  test("rejects lines without a colon operator form", () => {
    const result = validateSelectors("just some prose from the AI");
    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.line, 1);
    assert.ok(result.message.includes("FILE:"));
  });

  test("does not access filesystem — nonsense paths are syntactically valid", () => {
    const result = validateSelectors(
      "FILE:/no/such/absolute/path\nPREFIX:does-not-exist.go#func Nowhere"
    );
    assert.strictEqual(result.ok, true);
  });
});
