import * as assert from "assert";
import {
  formatByteSize,
  formatPrompt1SummaryLines,
  summarizePrompt1,
} from "./promptSummary";

const MULTI_MODULE_PROMPT = `[PROJECT TOPOLOGY]
Languages: Go, Python
Primary: Go
Stack: Go Modules
Structure: Multi-Module

[SOURCE TREE]
Pkg: . [5 files] -> Top: README.md (3KB)
Pkg: cmd/badger [6 files] -> Top: main.go (15KB)
Pkg: internal/scanner [28 files] -> Top: scanner.go (24KB)
Pkg: pkg/badger [12 files] -> Top: api.go (6KB)
Pkg: docs [9 files] -> Top: api.md (2KB)

[TASK]
Explain the API

[CONSTRAINT]
Reply with FILE: / PREFIX: / NEAR: lines only.
`;

const MINIMAL_PROMPT = `[PROJECT TOPOLOGY]
Languages: TypeScript

[SOURCE TREE]
Pkg: src [3 files] -> Top: index.ts (1KB)

[TASK]
hi
`;

const NO_TOPOLOGY_PROMPT = `Just some free text without topology sections.

[TASK]
goal
`;

suite("summarizePrompt1", () => {
  test("parses multi-module topology and caps samples", () => {
    const model = summarizePrompt1(MULTI_MODULE_PROMPT, {
      projectRoot: "/ws/aibadger",
      scope: "internal/scanner",
      maxSamples: 3,
    });
    assert.ok(model);
    assert.strictEqual(model!.languages, "Go, Python");
    assert.strictEqual(model!.primary, "Go");
    assert.strictEqual(model!.stack, "Go Modules");
    assert.strictEqual(model!.structure, "Multi-Module");
    assert.strictEqual(model!.packageCount, 5);
    assert.strictEqual(model!.fileCount, 5 + 6 + 28 + 12 + 9);
    assert.deepStrictEqual(model!.samplePackages, [
      ".",
      "cmd/badger",
      "internal/scanner",
    ]);
    assert.strictEqual(model!.remainingPackages, 2);
    assert.strictEqual(model!.projectName, "aibadger");
    assert.strictEqual(model!.scope, "internal/scanner");
    assert.ok(model!.payloadBytes > 100);
  });

  test("handles single-language minimal topology", () => {
    const model = summarizePrompt1(MINIMAL_PROMPT, {
      projectRoot: "/tmp/app",
    });
    assert.ok(model);
    assert.strictEqual(model!.languages, "TypeScript");
    assert.strictEqual(model!.packageCount, 1);
    assert.strictEqual(model!.fileCount, 3);
    assert.deepStrictEqual(model!.samplePackages, ["src"]);
    assert.strictEqual(model!.remainingPackages, 0);
    assert.strictEqual(model!.projectName, "app");
    assert.strictEqual(model!.scope, undefined);
  });

  test("size-only fallback when topology sections missing", () => {
    const model = summarizePrompt1(NO_TOPOLOGY_PROMPT);
    assert.ok(model);
    assert.strictEqual(model!.packageCount, 0);
    assert.ok(model!.payloadBytes > 0);
    assert.deepStrictEqual(model!.samplePackages, []);
  });

  test("empty prompt yields undefined", () => {
    assert.strictEqual(summarizePrompt1(""), undefined);
    assert.strictEqual(summarizePrompt1("   \n"), undefined);
  });

  test("does not embed task or constraint body into model fields", () => {
    const model = summarizePrompt1(MULTI_MODULE_PROMPT);
    assert.ok(model);
    const blob = JSON.stringify(model);
    assert.ok(!blob.includes("Explain the API"));
    assert.ok(!blob.includes("Reply with FILE"));
    // Sample names only — not Top: file list contents as freeform dump of source
    assert.ok(!blob.includes("main.go (15KB)"));
  });
});

suite("formatPrompt1SummaryLines", () => {
  test("formats multi-module summary without full prompt", () => {
    const model = summarizePrompt1(MULTI_MODULE_PROMPT, {
      projectRoot: "/ws/aibadger",
      scope: "cmd/badger",
      maxSamples: 3,
    })!;
    const lines = formatPrompt1SummaryLines(model);
    assert.ok(lines.some((l) => l.includes("Languages: Go, Python")));
    assert.ok(lines.some((l) => l.includes("package") && l.includes("in tree")));
    assert.ok(lines.some((l) => /payload \d/.test(l) || l.includes("KB")));
    assert.ok(lines.some((l) => l.includes("Project: aibadger")));
    assert.ok(lines.some((l) => l.includes("Scope: cmd/badger")));
    assert.ok(lines.some((l) => l.startsWith("Packages:")));
    assert.ok(lines.some((l) => l.includes("and 2 more")));
    const joined = lines.join("\n");
    assert.ok(!joined.includes("[TASK]"));
    assert.ok(!joined.includes("Explain the API"));
    // Must not imply source was copied (no bare "~N files" scale line).
    assert.ok(!/\b~\d+ files\b/.test(joined));
  });

  test("size-only model still produces a payload line", () => {
    const lines = formatPrompt1SummaryLines({
      packageCount: 0,
      samplePackages: [],
      remainingPackages: 0,
      payloadBytes: 2048,
    });
    assert.deepStrictEqual(lines, ["payload 2 KB"]);
  });
});

suite("formatByteSize", () => {
  test("formats B, KB, MB", () => {
    assert.strictEqual(formatByteSize(0), "0 B");
    assert.strictEqual(formatByteSize(500), "500 B");
    assert.strictEqual(formatByteSize(1024), "1 KB");
    assert.strictEqual(formatByteSize(3584), "3.5 KB");
    assert.strictEqual(formatByteSize(1024 * 1024), "1 MB");
  });
});
