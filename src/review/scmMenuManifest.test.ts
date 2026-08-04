import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
) as {
  contributes: {
    commands?: Array<{ command?: string; title?: string }>;
    menus?: {
      "scm/resourceState/context"?: Array<{ command?: string; when?: string; group?: string }>;
      commandPalette?: Array<{ command?: string; when?: string }>;
    };
  };
};

suite("reviewSelectedChanges SCM menu manifest contract", () => {
  test("is contributed to SCM resource states gated only by scmProvider == git", () => {
    const commands = packageJson.contributes.commands;
    assert.ok(commands?.some(
      (item) =>
        item.command === "aiBadger.reviewSelectedChanges" &&
        item.title === "AI Badger: Copy Selected Changes for Review"
    ));

    const contextMenus = packageJson.contributes.menus?.["scm/resourceState/context"];
    const menuItem = contextMenus?.find(
      (item) => item.command === "aiBadger.reviewSelectedChanges"
    );
    assert.ok(menuItem, "reviewSelectedChanges should be in the SCM resource context menu");
    assert.equal(menuItem.when, "scmProvider == git",
      "the SCM menu must gate only on scmProvider, which the SCM view sets; " +
      "resourceScheme is set by Explorer/editor focus and is false when the " +
      "Source Control view opens first");
  });

  test("is hidden from the command palette", () => {
    const palette = packageJson.contributes.menus?.commandPalette;
    assert.ok(palette?.some(
      (item) => item.command === "aiBadger.reviewSelectedChanges" && item.when === "false"
    ));
  });
});
