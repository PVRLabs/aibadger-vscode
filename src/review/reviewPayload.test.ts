import * as assert from "node:assert/strict";
import { buildReviewPayload } from "./reviewPayload";
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
  test("renders task, selected diff, full files, and an empty status section", async () => {
    const result = await buildReviewPayload("diff text\n", [
      { uri: uri("/repo/a.ts"), relativePath: "src/a.ts", changeKind: "modified" },
    ], { openFile: async () => fakeHandle(new TextEncoder().encode("const a = 1;\n")) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.startsWith(`[TASK]\n${REVIEW_TASK}`));
    assert.ok(result.payload.includes("[REVIEW CONTEXT: SELECTED GIT DIFF]\ndiff text"));
    assert.ok(result.payload.includes("--- File: src/a.ts (Full File) ---"));
    assert.ok(result.payload.endsWith("[FILE CONTEXT STATUS]\n"));
  });

  test("uses exact UTF-8 file limit and excludes the next byte", async () => {
    const exact = "x".repeat(MAX_REVIEW_FILE_BYTES);
    const result = await buildReviewPayload("d", [
      { uri: uri("/repo/exact"), relativePath: "exact", changeKind: "modified" },
      { uri: uri("/repo/large"), relativePath: "large", changeKind: "modified" },
    ], { openFile: async (path) => fakeHandle(new TextEncoder().encode(path.endsWith("exact") ? exact : `${exact}x`)) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.includedFiles, ["exact"]);
    assert.deepEqual(result.statuses, [{ path: "large", reason: `file exceeds ${MAX_REVIEW_FILE_BYTES / 1024} KiB full-file limit` }]);
  });

  test("accumulates short reads before building the full-file block", async () => {
    const result = await buildReviewPayload("diff", [
      { uri: uri("/repo/short"), relativePath: "short", changeKind: "modified" },
    ], { openFile: async () => fakeHandle(new TextEncoder().encode("first-second-third"), { chunkSize: 5 }) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.includes("first-second-third"));
  });

  test("checks size before decoding an oversized UTF-8 boundary", async () => {
    const oversized = new TextEncoder().encode("a".repeat(MAX_REVIEW_FILE_BYTES - 1) + "€");
    const result = await buildReviewPayload("diff", [
      { uri: uri("/repo/utf8"), relativePath: "utf8", changeKind: "modified" },
    ], { openFile: async () => fakeHandle(oversized) });
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
    ], { openFile: async () => fakeHandle(new TextEncoder().encode("content"), {
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
    ], { openFile: async () => {
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
    ], { openFile: async () => fakeHandle(exact, { requested }) });
    assert.equal(exactResult.ok, true);
    if (!exactResult.ok) return;
    assert.deepEqual(exactResult.includedFiles, ["exact"]);

    const oversized = new TextEncoder().encode("x".repeat(MAX_REVIEW_FILE_BYTES + 100));
    const oversizedRequested: number[] = [];
    const oversizedResult = await buildReviewPayload("diff", [
      { uri: uri("/repo/over"), relativePath: "over", changeKind: "modified" },
    ], { openFile: async () => fakeHandle(oversized, { requested: oversizedRequested }) });
    assert.equal(oversizedResult.ok, true);
    if (!oversizedResult.ok) return;
    assert.deepEqual(oversizedResult.includedFiles, []);
    assert.ok(oversizedRequested.every((length) => length <= MAX_REVIEW_FILE_BYTES + 1));
  });

  test("keeps diff-only statuses for deleted, added, untracked, and binary files", async () => {
    const result = await buildReviewPayload("d", [
      { uri: uri("/repo/deleted"), relativePath: "deleted", changeKind: "deleted" },
      { uri: uri("/repo/added"), relativePath: "added", changeKind: "tracked-added" },
      { uri: uri("/repo/new"), relativePath: "new", changeKind: "untracked" },
      { uri: uri("/repo/bin"), relativePath: "bin", changeKind: "binary" },
    ]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses.map((status) => status.path), ["deleted", "added", "new", "bin"]);
  });

  test("fails without a partial payload when the mandatory framing and diff overflow", async () => {
    let reads = 0;
    const result = await buildReviewPayload("x".repeat(MAX_REVIEW_PAYLOAD_BYTES), [
      { uri: uri("/repo/large"), relativePath: "large", changeKind: "modified" },
    ], { openFile: async () => { reads += 1; return fakeHandle(new TextEncoder().encode("must not read")); } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "mandatory-overflow");
    assert.equal(reads, 0);
  });

  test("marks read failures without dropping the diff", async () => {
    const result = await buildReviewPayload("selected patch", [
      { uri: uri("/repo/missing"), relativePath: "missing", changeKind: "modified" },
    ], { openFile: async () => { throw new Error("unreadable"); } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.payload.includes("selected patch"));
    assert.deepEqual(result.statuses, [{ path: "missing", reason: "full file unavailable" }]);
  });

  test("keeps a valid diff-only payload when final budget statuses would overflow an early block", async () => {
    const files = Array.from({ length: 120 }, (_, index) => ({
      uri: uri(`/repo/f${index}`), relativePath: `f${index}`, changeKind: "modified" as const,
    }));
    const result = await buildReviewPayload("d".repeat(MAX_REVIEW_PAYLOAD_BYTES - 12000), files, {
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
    ], { openFile: async () => fakeHandle(new TextEncoder().encode("x".repeat(1000))) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses.map((status) => status.path), ["first", "later"]);
    assert.deepEqual(result.includedFiles, []);
  });

  test("labels resolver-preserved deleted metadata as deleted", async () => {
    const result = await buildReviewPayload("deleted patch", [
      { uri: uri("/repo/deleted"), relativePath: "deleted", isDeleted: true },
    ], { openFile: async () => { throw new Error("must not read deleted file"); } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.statuses, [{ path: "deleted", reason: "deleted" }]);
  });
});
