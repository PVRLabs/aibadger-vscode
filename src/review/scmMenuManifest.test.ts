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
      "scm/sourceControl"?: Array<{ command?: string; when?: string; group?: string }>;
      "scm/resourceGroup/context"?: Array<{ command?: string; when?: string; group?: string }>;
      "scm/title"?: Array<{ command?: string; when?: string; group?: string }>;
      "view/title"?: Array<{ command?: string; when?: string; group?: string }>;
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

  test("contributes repository review actions only to Git Source Control", () => {
    const commands = packageJson.contributes.commands;
    assert.ok(commands?.some(
      (item) => item.command === "aiBadger.copyAllChangesForReview" &&
        item.title === "AI Badger: Copy All Changes for Review"
    ));
    assert.ok(commands?.some(
      (item) => item.command === "aiBadger.deepReview" &&
        item.title === "AI Badger: Deep Review"
    ));
    assert.ok(commands?.some(
      (item) => item.command === "aiBadger.copyWorkspaceChangesForReview" &&
        item.title === "AI Badger: Copy Workspace Changes for Review"
    ));
    const sourceControlMenus = packageJson.contributes.menus?.["scm/sourceControl"];
    assert.ok(sourceControlMenus);
    for (const command of ["aiBadger.copyAllChangesForReview", "aiBadger.deepReview"]) {
      const item: { command?: string; when?: string; group?: string } | undefined =
        sourceControlMenus?.find((candidate) => candidate.command === command);
      assert.equal(item?.when, "scmProvider == git");
    }
    const titleMenus = packageJson.contributes.menus?.["scm/title"];
    assert.ok(titleMenus?.some((item) => item.command === "aiBadger.copyAllChangesForReview"));
    assert.ok(titleMenus?.some((item) => item.command === "aiBadger.deepReview"));
    assert.ok(titleMenus?.some((item) =>
      item.command === "aiBadger.copyWorkspaceChangesForReview" &&
      item.when === undefined &&
      item.group === "navigation@92"
    ));
    assert.equal(sourceControlMenus.some((item) =>
      item.command === "aiBadger.copyWorkspaceChangesForReview"
    ), false, "workspace review must not render on every repository row");
    assert.ok(packageJson.contributes.menus?.commandPalette?.some((item) =>
      item.command === "aiBadger.copyWorkspaceChangesForReview" && item.when === undefined
    ));
    const groupMenus = packageJson.contributes.menus?.["scm/resourceGroup/context"];
    assert.equal(
      groupMenus?.find((item) => item.command === "aiBadger.copyAllChangesForReview")?.group,
      "inline@90"
    );
    assert.equal(
      groupMenus?.find((item) => item.command === "aiBadger.deepReview")?.group,
      "inline@91"
    );
    assert.equal(
      groupMenus?.filter((item) => item.command === "aiBadger.copyAllChangesForReview").length,
      2
    );
    assert.equal(
      groupMenus?.filter((item) => item.command === "aiBadger.deepReview").length,
      2
    );
    assert.ok(groupMenus?.some(
      (item) => item.command === "aiBadger.copyAllChangesForReview" &&
        item.group === "navigation@90"
    ));
    assert.ok(groupMenus?.some(
      (item) => item.command === "aiBadger.deepReview" &&
        item.group === "navigation@91"
    ));
  });
});
