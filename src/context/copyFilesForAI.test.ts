import * as assert from "assert";
import {
  CROSS_WORKSPACE_MESSAGE,
  MAX_COPY_FILE_BYTES,
  MAX_COPY_PAYLOAD_BYTES,
  PER_FILE_EXCLUSION_REASON,
  TOTAL_PAYLOAD_EXCLUSION_REASON,
  UNSUPPORTED_SELECTION_MESSAGE,
  copyFilesForAI,
  copySuccessMessage,
  resolveExplorerSelection,
  type CopyFilesDeps,
  type CopyUri,
} from "./copyFilesForAI";

type TestUri = CopyUri & { workspace: string; relativePath: string };

function uri(
  relativePath: string,
  workspace = "alpha",
  scheme = "file"
): TestUri {
  return {
    workspace,
    relativePath,
    fsPath: `/${workspace}/${relativePath}`,
    toString: () => `${scheme}:///${workspace}/${relativePath}`,
  };
}

type Harness = {
  deps: CopyFilesDeps;
  clipboard: string[];
  infos: string[];
  errors: string[];
  reads: string[];
  setActive(value: TestUri | undefined): void;
  setFolder(value: TestUri): void;
  setContents(value: TestUri, contents: Uint8Array | string): void;
};

function createHarness(): Harness {
  const clipboard: string[] = [];
  const infos: string[] = [];
  const errors: string[] = [];
  const reads: string[] = [];
  const folders = new Map<string, boolean>();
  const contents = new Map<string, Uint8Array>();
  const openDocuments = new Map<string, string>();
  let active: TestUri | undefined;

  const deps: CopyFilesDeps = {
    getActiveFileUri: () => active,
    getWorkspaceFolder: (value) => {
      const test = value as TestUri;
      return { uri: uri("", test.workspace) };
    },
    getRelativePath: (value) => (value as TestUri).relativePath,
    stat: async (value) => ({
      isFile: !folders.get(value.toString()),
    }),
    getOpenDocumentText: (value) => openDocuments.get(value.toString()),
    readFile: async (value) => {
      reads.push(value.toString());
      return contents.get(value.toString()) ?? new TextEncoder().encode("disk");
    },
    writeClipboard: async (text) => {
      clipboard.push(text);
    },
    showInformationMessage: (message) => infos.push(message),
    showErrorMessage: (message) => errors.push(message),
  };

  return {
    deps,
    clipboard,
    infos,
    errors,
    reads,
    setActive(value) {
      active = value;
    },
    setFolder(value) {
      folders.set(value.toString(), true);
    },
    setContents(value, valueContents) {
      if (typeof valueContents === "string") {
        openDocuments.set(value.toString(), valueContents);
      } else {
        contents.set(value.toString(), valueContents);
      }
    },
  };
}

suite("copyFilesForAI", () => {
  test("uses a 500 KiB direct-copy per-file limit", () => {
    assert.strictEqual(MAX_COPY_FILE_BYTES, 500 * 1024);
    assert.ok(PER_FILE_EXCLUSION_REASON.includes("500 KiB"));
  });

  test("uses full ordered multi-selection when clicked file is selected", () => {
    const a = uri("a.ts");
    const b = uri("b.ts");
    const selection = resolveExplorerSelection(b, [b, a, b], undefined);
    assert.deepStrictEqual(selection.uris, [b, a]);
    assert.strictEqual(selection.preserveOrder, true);
  });

  test("uses only clicked file when it is outside the selection", () => {
    const clicked = uri("clicked.ts");
    const selection = resolveExplorerSelection(clicked, [uri("a.ts")], undefined);
    assert.deepStrictEqual(selection.uris, [clicked]);
  });

  test("ignores non-array contextual arguments from editor menus", () => {
    const clicked = uri("clicked.ts");
    const selection = resolveExplorerSelection(
      clicked,
      { unexpected: true } as unknown as TestUri[],
      uri("active.ts")
    );
    assert.deepStrictEqual(selection.uris, [clicked]);
  });

  test("falls back to the active file for Command Palette invocation", async () => {
    const harness = createHarness();
    harness.setActive(uri("src/active.ts"));
    await copyFilesForAI(undefined, undefined, harness.deps);
    assert.strictEqual(harness.clipboard.length, 1);
    assert.ok(harness.clipboard[0].includes("src/active.ts"));
  });

  test("copies one open file and finishes without another interaction", async () => {
    const harness = createHarness();
    const file = uri("src/extension.ts");
    harness.setContents(file, "unsaved");
    await copyFilesForAI(file, [file], harness.deps);
    assert.deepStrictEqual(harness.infos, [copySuccessMessage(1)]);
    assert.strictEqual(harness.clipboard.length, 1);
    assert.ok(harness.clipboard[0].includes("unsaved"));
    assert.strictEqual(harness.reads.length, 0);
  });

  test("copies multiple files once in selection order", async () => {
    const harness = createHarness();
    const a = uri("src/a.ts");
    const b = uri("src/b.ts");
    await copyFilesForAI(b, [b, a], harness.deps);
    assert.strictEqual(harness.clipboard.length, 1);
    assert.ok(harness.clipboard[0].indexOf("src/b.ts") < harness.clipboard[0].indexOf("src/a.ts"));
    assert.ok(!harness.clipboard[0].includes("[QUESTION]"));
    assert.deepStrictEqual(harness.infos, [copySuccessMessage(2)]);
  });

  test("rejects files from different workspace folders", async () => {
    const harness = createHarness();
    const a = uri("a.ts", "alpha");
    const b = uri("b.ts", "beta");
    await copyFilesForAI(a, [a, b], harness.deps);
    assert.deepStrictEqual(harness.errors, [CROSS_WORKSPACE_MESSAGE]);
  });

  test("rejects folders", async () => {
    const harness = createHarness();
    const folder = uri("src");
    harness.setFolder(folder);
    await copyFilesForAI(folder, undefined, harness.deps);
    assert.deepStrictEqual(harness.errors, [UNSUPPORTED_SELECTION_MESSAGE]);
  });

  test("rejects an empty selection", async () => {
    const harness = createHarness();
    await copyFilesForAI(undefined, undefined, harness.deps);
    assert.deepStrictEqual(harness.errors, [UNSUPPORTED_SELECTION_MESSAGE]);
  });

  test("copies compact metadata for invalid UTF-8 and NUL binary files", async () => {
    for (const [name, bytes, expectedType] of [
      ["image.png", new Uint8Array([0xff, 0xfe]), "PNG"],
      ["archive.zip", new Uint8Array([0x61, 0, 0x62]), "ZIP"],
    ] as const) {
      const harness = createHarness();
      const file = uri(name);
      harness.setContents(file, bytes);
      await copyFilesForAI(file, undefined, harness.deps);
      assert.deepStrictEqual(harness.errors, []);
      assert.strictEqual(harness.clipboard.length, 1);
      assert.ok(
        harness.clipboard[0].includes(`--- File: ${name} (Binary File) ---`)
      );
      assert.ok(harness.clipboard[0].includes(`Type: ${expectedType}`));
      assert.ok(harness.clipboard[0].includes("Size: "));
    }
  });

  test("copies metadata for an oversized binary without its bytes", async () => {
    const harness = createHarness();
    const file = uri("large.bin");
    const bytes = new Uint8Array(MAX_COPY_FILE_BYTES + 1).fill(0x61);
    bytes[bytes.length - 1] = 0;
    harness.setContents(file, bytes);
    await copyFilesForAI(file, undefined, harness.deps);
    assert.deepStrictEqual(harness.errors, []);
    assert.strictEqual(harness.clipboard.length, 1);
    assert.ok(harness.clipboard[0].includes("(Binary File)"));
    assert.ok(harness.clipboard[0].includes("Type: BIN"));
    assert.ok(harness.clipboard[0].includes("Size: 512 KB"));
  });

  test("lists a per-file oversized file as excluded", async () => {
    const harness = createHarness();
    const file = uri("large.txt");
    harness.setContents(
      file,
      new Uint8Array(MAX_COPY_FILE_BYTES + 1).fill("a".charCodeAt(0))
    );
    await copyFilesForAI(file, undefined, harness.deps);
    assert.deepStrictEqual(harness.errors, []);
    assert.strictEqual(harness.clipboard.length, 1);
    assert.ok(harness.clipboard[0].includes("[EXCLUDED FILES]"));
    assert.ok(harness.clipboard[0].includes(`large.txt (${PER_FILE_EXCLUSION_REASON})`));
    assert.ok(!harness.clipboard[0].includes("--- File: large.txt"));
  });

  test("lists later files excluded to enforce the complete payload limit", async () => {
    const harness = createHarness();
    const files = Array.from({ length: 5 }, (_, index) =>
      uri(`file-${index}.txt`)
    );
    for (const file of files) {
      harness.setContents(
        file,
        new Uint8Array(MAX_COPY_FILE_BYTES).fill("a".charCodeAt(0))
      );
    }
    await copyFilesForAI(files[0], files, harness.deps);
    assert.ok(MAX_COPY_PAYLOAD_BYTES < files.length * MAX_COPY_FILE_BYTES);
    assert.deepStrictEqual(harness.errors, []);
    assert.strictEqual(harness.clipboard.length, 1);
    assert.ok(
      Buffer.byteLength(harness.clipboard[0], "utf8") <= MAX_COPY_PAYLOAD_BYTES
    );
    assert.ok(harness.clipboard[0].includes("[EXCLUDED FILES]"));
    assert.ok(harness.clipboard[0].includes(TOTAL_PAYLOAD_EXCLUSION_REASON));
  });
});
