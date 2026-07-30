import * as assert from "assert";
import { validateSelectors } from "./selectors";

suite("validateSelectors", () => {
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
