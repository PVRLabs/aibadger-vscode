import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { ATTACHMENT_EXTENSIONS, COPY_IMAGE_COMMAND, COPY_IMAGES_COMMAND, COPY_ATTACHMENT_COMMAND, COPY_ATTACHMENTS_COMMAND } from "./copyNativeAttachments";

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")) as {
  activationEvents: string[];
  contributes: { menus: Record<string, { command: string; when?: string; group?: string }[]> };
};
suite("native attachment menus", () => {
  test("menu whitelists match runtime filtering, with text copy first", () => {
    assert.deepEqual(manifest.activationEvents, [], "commands must activate lazily");
    const menus = manifest.contributes.menus["explorer/context"];
    for (const [command, category, multi] of [
      [COPY_IMAGE_COMMAND, "image", false], [COPY_IMAGES_COMMAND, "image", true],
      [COPY_ATTACHMENT_COMMAND, "attachment", false], [COPY_ATTACHMENTS_COMMAND, "attachment", true],
    ] as const) {
      const menu = menus.find(item => item.command === command);
      assert.ok(menu?.when);
      assert.ok(menu.when.includes("isMac && !remoteName"));
      assert.ok(menu.when.includes("resourceScheme == file && !explorerResourceIsFolder"));
      assert.ok(menu.when.endsWith(multi ? "&& listMultiSelection" : "&& !listMultiSelection"));
      const pattern = menu.when.match(/resourceExtname =~ \/(.*?)\/i/);
      assert.ok(pattern);
      const regex = new RegExp(pattern[1], "i");
      for (const ext of [...ATTACHMENT_EXTENSIONS.image, ...ATTACHMENT_EXTENSIONS.attachment, ".svg", ".sqlite", ".db", ".tar", ".gz", ".ts", ".md"]) {
        const allowed: readonly string[] = ATTACHMENT_EXTENSIONS[category];
        assert.equal(regex.test(ext), allowed.includes(ext), `${command}: ${ext}`);
        assert.equal(regex.test(ext.toUpperCase()), allowed.includes(ext), `${command}: uppercase ${ext}`);
      }
      const text = menus.find(item => item.command === (multi ? "aiBadger.copyFilesForAI" : "aiBadger.copyFileForAI"));
      assert.ok(text?.group && menu.group && text.group < menu.group);
      assert.ok(manifest.contributes.menus.commandPalette.some(item => item.command === command && item.when === "false"));
    }
  });
});
