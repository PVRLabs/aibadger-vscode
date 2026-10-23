import * as assert from "assert";
import { copyNativeAttachments, type NativeAttachmentDeps, type AttachmentUri } from "./copyNativeAttachments";

const uri = (name: string, scheme = "file"): AttachmentUri => ({
  scheme, fsPath: `/tmp/${name}`, toString: () => `${scheme}:///tmp/${name}`,
});
function harness() {
  const writes: string[][] = [];
  const deps: NativeAttachmentDeps = {
    isFile: async () => true,
    clipboard: { writeFiles: async paths => { writes.push([...paths]); } },
  };
  return { deps, writes };
}
suite("copy images for AI", () => {
  test("copies only images in selection order, deduplicating", async () => {
    const { deps, writes } = harness();
    const files = ["red.PNG", "green.jpg", "blue.jpeg", "image.webp", "animation.gif", "code.ts", "document.pdf", "raw.bin"].map(name => uri(name));
    assert.deepStrictEqual(await copyNativeAttachments(files[0], [...files, files[0]], deps), { copied: 5, skipped: 3 });
    assert.deepStrictEqual(writes, [files.slice(0, 5).map(file => file.fsPath)]);
  });
  test("attachment action filters mixed selections to the document whitelist", async () => {
    const { deps, writes } = harness();
    const files = ["a.pdf", "b.ZIP", "c.docx", "d.pptx", "e.xlsx", "pic.png", "notes.md", "data.sqlite", "old.tar", "vector.svg"].map(name => uri(name));
    assert.deepStrictEqual(await copyNativeAttachments(files[0], files, deps, "attachment"), { copied: 5, skipped: 5 });
    assert.deepStrictEqual(writes, [files.slice(0, 5).map(file => file.fsPath)]);
  });
  test("excludes sensitive paths from both categories", async () => {
    for (const category of ["image", "attachment"] as const) {
      const { deps, writes } = harness();
      const ext = category === "image" ? "png" : "pdf";
      const files = [uri(`.azure/secret.${ext}`), uri(`.env.${ext}`), uri(`safe.${ext}`)];
      assert.deepStrictEqual(await copyNativeAttachments(files[0], files, deps, category), { copied: 1, skipped: 2 });
      assert.deepStrictEqual(writes, [[files[2].fsPath]]);
    }
  });
  test("excluded formats leave clipboard unchanged", async () => {
    for (const name of ["vector.svg", "db.sqlite", "old.tar", "notes.md"]) {
      for (const category of ["image", "attachment"] as const) {
        const { deps, writes } = harness();
        await assert.rejects(copyNativeAttachments(uri(name), undefined, deps, category));
        assert.deepStrictEqual(writes, []);
      }
    }
  });
  test("clicked file outside selection takes precedence", async () => {
    const { deps, writes } = harness();
    const clicked = uri("clicked.png");
    await copyNativeAttachments(clicked, [uri("stale.png")], deps);
    assert.deepStrictEqual(writes, [[clicked.fsPath]]);
  });
  test("rejects selections with no local files without changing clipboard", async () => {
    for (const files of [[], [uri("a.png", "vscode-remote")]]) {
      const { deps, writes } = harness();
      await assert.rejects(copyNativeAttachments(files[0], files, deps));
      assert.deepStrictEqual(writes, []);
    }
  });
  test("copies mixed file types and reports skipped folders and remote files", async () => {
    const { deps, writes } = harness();
    deps.isFile = async file => !file.fsPath.endsWith("folder.png");
    const files = [uri("code.ts"), uri("a.png"), uri("folder.png"), uri("remote.jpg", "vscode-remote"), uri("b.webp")];
    assert.deepStrictEqual(await copyNativeAttachments(files[0], files, deps), { copied: 2, skipped: 3 });
    assert.deepStrictEqual(writes, [[files[1].fsPath, files[4].fsPath]]);
  });
  test("validates all files before writing", async () => {
    const { deps, writes } = harness();
    deps.isFile = async file => !file.fsPath.endsWith("folder.png");
    await assert.rejects(copyNativeAttachments(undefined, [uri("folder.png")], deps), /No eligible files/);
    deps.isFile = async () => { throw new Error("File no longer exists"); };
    await assert.rejects(copyNativeAttachments(uri("gone.png"), undefined, deps));
    assert.deepStrictEqual(writes, []);
  });
  test("skips missing and inaccessible files while copying valid files in order", async () => {
    const { deps, writes } = harness();
    const files = ["a.png", "missing.png", "b.jpg", "denied.webp"].map(name => uri(name));
    deps.isFile = async file => {
      if (file.fsPath.endsWith("missing.png")) throw new Error("File not found");
      if (file.fsPath.endsWith("denied.webp")) throw new Error("Permission denied");
      return true;
    };
    assert.deepStrictEqual(await copyNativeAttachments(files[0], files, deps), { copied: 2, skipped: 2 });
    assert.deepStrictEqual(writes, [[files[0].fsPath, files[2].fsPath]]);
  });
  test("rejects unavailable clipboard backends before validating selection", async () => {
    const { deps, writes } = harness();
    deps.clipboard = undefined;
    deps.isFile = async () => { throw new Error("Must not validate files"); };
    await assert.rejects(copyNativeAttachments(uri("a.png"), undefined, deps), /unavailable in this environment/);
    assert.deepStrictEqual(writes, []);
  });
  test("does not report success when clipboard write fails", async () => {
    const { deps } = harness();
    deps.clipboard = { writeFiles: async () => { throw new Error("Clipboard verification failed"); } };
    await assert.rejects(copyNativeAttachments(uri("a.png"), undefined, deps), /Clipboard verification failed/);
  });
});
