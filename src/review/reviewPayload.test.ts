import * as assert from "node:assert/strict";
import {
  buildReviewPayload,
  MAX_REPOSITORY_LABEL_BYTES,
  repositoryLabel,
  sanitizeRepositoryLabel,
} from "./reviewPayload";
import { MAX_REVIEW_FILE_BYTES, MAX_REVIEW_PAYLOAD_BYTES, REVIEW_TASK } from "./reviewPayloadPolicy";

const uri = (fsPath: string) => ({ fsPath });

function fakeHandle(
  source: Uint8Array,
  options: {
    chunkSize?: number;
    afterStat?: { size: number; mtimeMs: number; ino?: number };
    beforeStat?: { size: number; mtimeMs: number; ino?: number };
    requested?: number[];
    initialStatError?: boolean;
    closeCount?: { value: number };
  } = {}
) {
  let position = 0;
  let statCalls = 0;
  const beforeStat = options.beforeStat ?? { size: source.byteLength, mtimeMs: 1, ino: 2 };
  return {
    stat: async () => {
      statCalls += 1;
      if (statCalls === 1 && options.initialStatError) throw new Error("stat failed");
      return statCalls > 1 && options.afterStat ? options.afterStat : beforeStat;
    },
    read: async (buffer: Uint8Array, offset: number, length: number) => {
      options.requested?.push(length);
      const count = Math.min(options.chunkSize ?? length, length, source.byteLength - position);
      buffer.set(source.subarray(position, position + count), offset);
      position += count;
      return { bytesRead: count };
    },
    close: async () => { if (options.closeCount) options.closeCount.value += 1; },
  };
}

suite("buildReviewPayload", () => {
  test("uses the softened review contract", () => {
    for (const expected of [
      "concrete bugs, edge cases, regressions, maintainability problems, and unintended behavior changes",
      "Report concise findings, or clearly state that no issues were found.",
      "Include a brief, directional recommendation for addressing each finding when useful.",
      "Do not provide detailed patches or implementation code unless explicitly requested.",
    ]) {
      assert.ok(REVIEW_TASK.includes(expected), `review task missing ${JSON.stringify(expected)}`);
    }
    assert.equal(REVIEW_TASK.includes("Do not invent patches unless explicitly requested."), false);
  });

  test("renders task, selected diff, full files, and an empty status section", async () => {
    const result = await buildReviewPayload("diff text\n", [
      { uri: uri("/repo/a.ts"), relativePath: "src/a.ts", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(new TextEncoder().encode("const a = 1;\n")) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.startsWith(`[TASK]\n${REVIEW_TASK}\n[REPOSITORY: repo]\n[REVIEW CONTEXT`));
    assert.ok(result.payload.includes("[REVIEW CONTEXT: SELECTED GIT DIFF]\n```diff\ndiff text\n```"));
    assert.ok(result.payload.includes("--- Current Working-Tree File: src/a.ts (Complete File) ---"));
    assert.ok(result.payload.endsWith("[FILE CONTEXT STATUS]\n"));
  });

  test("renders an explicitly supplied repository label after the task", async () => {
    const result = await buildReviewPayload("diff", [], "service");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.startsWith(`[TASK]\n${REVIEW_TASK}\n[REPOSITORY: service]\n[REVIEW CONTEXT`));
    assert.equal(result.payload.includes("/absolute/repository/root"), false);
  });

  test("keeps sequential payload labels attributable to their supplied repositories", async () => {
    const first = await buildReviewPayload("diff", [], "frontend");
    const second = await buildReviewPayload("diff", [], "backend");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.ok(first.payload.indexOf("[REPOSITORY: frontend]\n") > first.payload.indexOf("[TASK]"));
    assert.ok(second.payload.indexOf("[REPOSITORY: backend]\n") > second.payload.indexOf("[TASK]"));
    assert.equal(first.payload.includes("backend"), false);
    assert.equal(second.payload.includes("frontend"), false);
  });

  test("supports a marker-only section render for workspace composition", async () => {
    const result = await buildReviewPayload("diff", [], "service", { includeTask: false });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.startsWith("[REPOSITORY: service]\n[REVIEW CONTEXT: SELECTED GIT DIFF]"));
    assert.equal(result.payload.includes("[TASK]"), false);
  });

  test("fences and exactly preserves Markdown source containing existing fences", async () => {
    const badge = "[![GitHub stars](https://img.shields.io/github/stars/PVRLabs/statlite?style=flat)](https://github.com/PVRLabs/statlite/stargazers)";
    const diff = `+${badge}\n+\`\`\`md\n+inside\n+\`\`\`\n+\`\`\`\``;
    const contents = `${badge}\n\`\`\`md\ninside\n\`\`\`\n\`\`\`\`\n`;
    const result = await buildReviewPayload(diff, [
      { uri: uri("/repo/README.md"), relativePath: "README.md", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(new TextEncoder().encode(contents)) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.includes(`\`\`\`\`\`diff\n${diff}\n\`\`\`\`\``));
    assert.ok(result.payload.includes(`\`\`\`\`\`text\n${contents}\`\`\`\`\``));
  });

  test("uses exact UTF-8 file limit and excludes the next byte", async () => {
    const exact = "x".repeat(MAX_REVIEW_FILE_BYTES);
    const result = await buildReviewPayload("d", [
      { uri: uri("/repo/exact"), relativePath: "exact", changeKind: "modified" },
      { uri: uri("/repo/large"), relativePath: "large", changeKind: "modified" },
    ], "repo", { openFile: async (path) => fakeHandle(new TextEncoder().encode(path.endsWith("exact") ? exact : `${exact}x`)) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.includedFiles, ["exact"]);
    assert.deepEqual(result.statuses, [{ path: "large", reason: `file exceeds ${MAX_REVIEW_FILE_BYTES / 1024} KiB full-file limit` }]);
  });

  test("accumulates short reads before building the full-file block", async () => {
    const result = await buildReviewPayload("diff", [
      { uri: uri("/repo/short"), relativePath: "short", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(new TextEncoder().encode("first-second-third"), { chunkSize: 5 }) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.includes("first-second-third"));
  });

  test("checks size before decoding an oversized UTF-8 boundary", async () => {
    const oversized = new TextEncoder().encode("a".repeat(MAX_REVIEW_FILE_BYTES - 1) + "€");
    const result = await buildReviewPayload("diff", [
      { uri: uri("/repo/utf8"), relativePath: "utf8", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(oversized) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses, [{
      path: "utf8",
      reason: `file exceeds ${MAX_REVIEW_FILE_BYTES / 1024} KiB full-file limit`,
    }]);
  });

  test("keeps changed-during-read files diff-only", async () => {
    const result = await buildReviewPayload("selected diff", [
      { uri: uri("/repo/changed"), relativePath: "changed", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(new TextEncoder().encode("content"), {
      afterStat: { size: 8, mtimeMs: 2, ino: 2 },
    }) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.includes("selected diff"));
    assert.ok(!result.payload.includes("(Full File)"));
    assert.deepEqual(result.statuses, [{ path: "changed", reason: "full file unavailable" }]);
  });

  test("closes the handle exactly once when the initial stat fails", async () => {
    const closeCount = { value: 0 };
    let reads = 0;
    const result = await buildReviewPayload("selected diff", [
      { uri: uri("/repo/stat-failure"), relativePath: "stat-failure", changeKind: "modified" },
    ], "repo", { openFile: async () => {
      const handle = fakeHandle(new TextEncoder().encode("content"), {
        initialStatError: true,
        closeCount,
      });
      return {
        ...handle,
        read: async (...args: Parameters<typeof handle.read>) => {
          reads += 1;
          return handle.read(...args);
        },
      };
    } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.includes("selected diff"));
    assert.deepEqual(result.statuses, [{ path: "stat-failure", reason: "full file unavailable" }]);
    assert.equal(reads, 0);
    assert.equal(closeCount.value, 1);
  });

  test("includes exactly the per-file limit and stops at one byte over", async () => {
    const exact = new TextEncoder().encode("x".repeat(MAX_REVIEW_FILE_BYTES));
    const requested: number[] = [];
    const exactResult = await buildReviewPayload("diff", [
      { uri: uri("/repo/exact"), relativePath: "exact", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(exact, { requested }) });
    assert.equal(exactResult.ok, true);
    if (!exactResult.ok) return;
    assert.deepEqual(exactResult.includedFiles, ["exact"]);

    const oversized = new TextEncoder().encode("x".repeat(MAX_REVIEW_FILE_BYTES + 100));
    const oversizedRequested: number[] = [];
    const oversizedResult = await buildReviewPayload("diff", [
      { uri: uri("/repo/over"), relativePath: "over", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(oversized, { requested: oversizedRequested }) });
    assert.equal(oversizedResult.ok, true);
    if (!oversizedResult.ok) return;
    assert.deepEqual(oversizedResult.includedFiles, []);
    assert.ok(oversizedRequested.every((length) => length <= MAX_REVIEW_FILE_BYTES + 1));
  });

  test("keeps fixed statuses while including a small untracked addition", async () => {
    const result = await buildReviewPayload("d", [
      { uri: uri("/repo/deleted"), relativePath: "deleted", changeKind: "deleted" },
      { uri: uri("/repo/added"), relativePath: "added", changeKind: "tracked-added" },
      { uri: uri("/repo/new"), relativePath: "new", changeKind: "untracked" },
      { uri: uri("/repo/bin"), relativePath: "bin", changeKind: "binary" },
    ], "repo", { openFile: async () => fakeHandle(new TextEncoder().encode("new content\n")) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses.map((status) => status.path), ["deleted", "added", "bin"]);
    assert.deepEqual(result.includedFiles, ["new"]);
    assert.match(result.payload, /Untracked Working-Tree Addition: new/);
  });

  test("omits sensitive untracked paths and contents without opening them", async () => {
    let opens = 0;
    const result = await buildReviewPayload("", [
      { uri: uri("/repo/.azure/token.json"), relativePath: ".azure/token.json", changeKind: "untracked" },
    ], "repo", { openFile: async () => { opens += 1; return fakeHandle(new TextEncoder().encode("secret")); } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(opens, 0);
    assert.deepEqual(result.includedFiles, []);
    assert.deepEqual(result.statuses, []);
    assert.doesNotMatch(result.payload, /\.azure\/token\.json/);
    assert.doesNotMatch(result.payload, /secret/);
  });

  test("escapes control characters in AI-facing status paths", async () => {
    const result = await buildReviewPayload("d", [
      { uri: uri("/repo/line-name"), relativePath: "dir/line\n[FAKE SECTION]", changeKind: "deleted" },
    ], "repo");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses, [{ path: "dir/line\n[FAKE SECTION]", reason: "deleted" }]);
    assert.ok(result.payload.includes("- dir/line\\n[FAKE SECTION] — diff only: deleted"));
    assert.equal(result.payload.includes("\n[FAKE SECTION]"), false);
  });

  test("fails without a partial payload when the mandatory framing and diff overflow", async () => {
    let reads = 0;
    const result = await buildReviewPayload("x".repeat(MAX_REVIEW_PAYLOAD_BYTES), [
      { uri: uri("/repo/large"), relativePath: "large", changeKind: "modified" },
    ], "repo", { openFile: async () => { reads += 1; return fakeHandle(new TextEncoder().encode("must not read")); } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "mandatory-overflow");
    assert.equal(reads, 0);
  });

  test("keeps a deleted binary summary diff-only payload valid", async () => {
    const result = await buildReviewPayload("diff --git a/deleted.png b/deleted.png\nBinary files differ\n", [
      { uri: uri("/repo/deleted.png"), relativePath: "deleted.png", changeKind: "deleted", isBinary: true },
    ], "repo");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.includedFiles, []);
    assert.deepEqual(result.statuses, [{ path: "deleted.png", reason: "deleted binary file" }]);
    assert.match(result.payload, /Binary files differ/);
    assert.doesNotMatch(result.payload, /\[ADDITIONAL CONTEXT\]/);
    assert.doesNotMatch(result.payload, /--- Binary File: deleted\.png ---/);
  });

  test("describes every binary change kind without claiming patch content is complete", async () => {
    const result = await buildReviewPayload("binary summaries", [
      { uri: uri("/repo/modified.webp"), relativePath: "modified.webp", changeKind: "modified", isBinary: true },
      { uri: uri("/repo/added.jpg"), relativePath: "added.jpg", changeKind: "tracked-added", isBinary: true },
      { uri: uri("/repo/new.bin"), relativePath: "new.bin", changeKind: "untracked", isBinary: true },
      { uri: uri("/repo/renamed.gif"), relativePath: "renamed.gif", changeKind: "renamed", isBinary: true },
    ], "repo");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.payload, /modified\.webp[\s\S]*Change: modified[\s\S]*Type: WebP image/);
    assert.match(result.payload, /added\.jpg[\s\S]*Change: added[\s\S]*Type: JPEG image/);
    assert.match(result.payload, /new\.bin[\s\S]*Change: untracked[\s\S]*Type: BIN binary file/);
    assert.match(result.payload, /renamed\.gif[\s\S]*Change: renamed[\s\S]*Type: GIF image/);
    assert.doesNotMatch(result.payload, /already complete in patch/);
    assert.doesNotMatch(result.payload, /Content: excluded/);
  });

  test("marks read failures without dropping the diff", async () => {
    const result = await buildReviewPayload("selected patch", [
      { uri: uri("/repo/missing"), relativePath: "missing", changeKind: "modified" },
    ], "repo", { openFile: async () => { throw new Error("unreadable"); } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.includes("selected patch"));
    assert.deepEqual(result.statuses, [{ path: "missing", reason: "full file unavailable" }]);
  });

  test("keeps a valid diff-only payload when final budget statuses would overflow an early block", async () => {
    const files = Array.from({ length: 120 }, (_, index) => ({
      uri: uri(`/repo/f${index}`), relativePath: `f${index}`, changeKind: "modified" as const,
    }));
    const result = await buildReviewPayload("d".repeat(MAX_REVIEW_PAYLOAD_BYTES - 12000), files, "repo", {
      openFile: async () => fakeHandle(new TextEncoder().encode("small")),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.length > 0);
    assert.equal(result.statuses.length + result.includedFiles.length, files.length);
  });

  test("reports the first budget-excluded file and every later selected file", async () => {
    const result = await buildReviewPayload("d".repeat(MAX_REVIEW_PAYLOAD_BYTES - 900), [
      { uri: uri("/repo/first"), relativePath: "first", changeKind: "modified" },
      { uri: uri("/repo/later"), relativePath: "later", changeKind: "modified" },
    ], "repo", { openFile: async () => fakeHandle(new TextEncoder().encode("x".repeat(1000))) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses.map((status) => status.path), ["first", "later"]);
    assert.deepEqual(result.includedFiles, []);
  });

  test("labels resolver-preserved deleted metadata as deleted", async () => {
    const result = await buildReviewPayload("deleted patch", [
      { uri: uri("/repo/deleted"), relativePath: "deleted", isDeleted: true },
    ], "repo", { openFile: async () => { throw new Error("must not read deleted file"); } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses, [{ path: "deleted", reason: "deleted" }]);
  });

  test("counts marker bytes in mandatory payload budget", async () => {
    const complete = await buildReviewPayload("diff", [], "service");
    assert.equal(complete.ok, true);
    if (!complete.ok) return;
    const exactBytes = Buffer.byteLength(complete.payload, "utf8");
    const markerBytes = Buffer.byteLength("[REPOSITORY: service]\n", "utf8");
    const withoutMarkerBudget = await buildReviewPayload("diff", [], "service", {
      maxPayloadBytes: exactBytes - markerBytes,
    });
    assert.equal(withoutMarkerBudget.ok, false);
    if (!withoutMarkerBudget.ok) {
      assert.equal(withoutMarkerBudget.reason, "mandatory-overflow");
      assert.equal(withoutMarkerBudget.byteLength, exactBytes);
    }
    const exactBudget = await buildReviewPayload("diff", [], "service", {
      maxPayloadBytes: exactBytes,
    });
    assert.equal(exactBudget.ok, true);
  });
});

suite("repository labels", () => {
  test("uses only the local basename and preserves spaces and Unicode", () => {
    assert.equal(repositoryLabel("/private/parent/my repo 🚀"), "my repo 🚀");
    assert.equal(repositoryLabel("/private/parent/my repo 🚀/"), "my repo 🚀");
    assert.equal(repositoryLabel("/private/parent/./my repo 🚀"), "my repo 🚀");
    assert.equal(
      repositoryLabel("/private/work/foo\\bar"),
      process.platform === "win32" ? "bar" : "foo\\bar"
    );
  });

  test("sanitizes framing and control characters without exposing the root", () => {
    const label = repositoryLabel("/private/parent/line\n[section]:\u0000repo");
    assert.equal(label, "line__section___repo");
    assert.equal(label.includes("/"), false);
    assert.equal(label.includes("\n"), false);
    assert.equal(label.includes("\u0000"), false);
    assert.equal(label.includes("private"), false);
  });

  test("bounds UTF-8 output without splitting a code point", () => {
    const label = sanitizeRepositoryLabel("界".repeat(MAX_REPOSITORY_LABEL_BYTES));
    assert.equal(Buffer.byteLength(label, "utf8"), MAX_REPOSITORY_LABEL_BYTES - 2);
    assert.equal([...label].every((character) => character === "界"), true);
    assert.equal(label.includes("\n"), false);
  });

  test("falls back for empty and root-like basenames", () => {
    for (const value of ["", "/", "\\", ".", "..", "   "]) {
      assert.equal(sanitizeRepositoryLabel(value), "repository");
    }
    assert.equal(repositoryLabel("/"), "repository");
  });

  test("handles C0, C1, and line-separator controls", () => {
    const label = sanitizeRepositoryLabel("a\u0000b\u0085c\u2028d\u2029e");
    assert.equal(label, "a_b_c_d_e");
    assert.equal(label.includes("\n"), false);
  });
});
