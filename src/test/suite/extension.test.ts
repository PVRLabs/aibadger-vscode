import * as assert from "assert";
import * as vscode from "vscode";

suite("AI Badger extension shell", () => {
  test("extension activates", async () => {
    const ext = vscode.extensions.getExtension("pvrlabs.ai-badger");
    assert.ok(ext, "extension should be present");
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test("commands are registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("aiBadger.askAboutProject"));
    assert.ok(commands.includes("aiBadger.askAboutFolder"));
    assert.ok(commands.includes("aiBadger.askAboutFile"));
    assert.ok(commands.includes("aiBadger.askAboutSelectedFiles"));
    assert.ok(commands.includes("aiBadger.copyFileWithQuestion"));
    assert.ok(commands.includes("aiBadger.copyFilesWithQuestion"));
    assert.ok(commands.includes("aiBadger.reviewSelectedChanges"));
  });

  test("Review Selected Changes is contributed only to Git SCM resources", () => {
    const ext = vscode.extensions.getExtension("pvrlabs.ai-badger");
    const contextMenus = ext?.packageJSON.contributes?.menus?.["scm/resourceState/context"];
    assert.ok(contextMenus?.some(
      (item: { command?: string; when?: string }) =>
        item.command === "aiBadger.reviewSelectedChanges" &&
        item.when === "scmProvider == git && resourceScheme == file"
    ));
    const palette = ext?.packageJSON.contributes?.menus?.commandPalette;
    assert.ok(palette?.some(
      (item: { command?: string; when?: string }) =>
        item.command === "aiBadger.reviewSelectedChanges" && item.when === "false"
    ));
  });

  test("copy command is contributed to the Explorer file context menu", () => {
    const ext = vscode.extensions.getExtension("pvrlabs.ai-badger");
    const contextMenus = ext?.packageJSON.contributes?.menus?.["explorer/context"];
    assert.ok(
      contextMenus?.some(
        (item: { command?: string; when?: string }) =>
          item.command === "aiBadger.copyFileWithQuestion" &&
          item.when?.includes("!listMultiSelection")
      )
    );
    assert.ok(
      contextMenus?.some(
        (item: { command?: string; when?: string }) =>
          item.command === "aiBadger.copyFilesWithQuestion" &&
          item.when?.includes("listMultiSelection")
      )
    );
  });

  test("Explorer uses distinct single-file and multi-file Ask labels", () => {
    const ext = vscode.extensions.getExtension("pvrlabs.ai-badger");
    const contextMenus = ext?.packageJSON.contributes?.menus?.["explorer/context"];
    assert.ok(
      contextMenus?.some(
        (item: { command?: string; when?: string }) =>
          item.command === "aiBadger.askAboutFile" &&
          item.when?.includes("!listMultiSelection")
      )
    );
    assert.ok(
      contextMenus?.some(
        (item: { command?: string; when?: string }) =>
          item.command === "aiBadger.askAboutSelectedFiles" &&
          item.when?.includes("listMultiSelection")
      )
    );
  });

  test("editor tab context menu exposes single-file Ask and Copy actions", () => {
    const ext = vscode.extensions.getExtension("pvrlabs.ai-badger");
    const contextMenus =
      ext?.packageJSON.contributes?.menus?.["editor/title/context"];
    assert.ok(
      contextMenus?.some(
        (item: { command?: string; when?: string }) =>
          item.command === "aiBadger.askAboutFile" &&
          item.when?.includes("resourceScheme == file")
      )
    );
    assert.ok(
      contextMenus?.some(
        (item: { command?: string; when?: string }) =>
          item.command === "aiBadger.copyFileWithQuestion" &&
          item.when?.includes("resourceScheme == file")
      )
    );
  });
});
