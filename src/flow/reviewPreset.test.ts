import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

suite("review guidance preset", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../webview/askWizard/reviewPreset.js"), "utf8"), context);
  const preset = context.BadgerReviewPreset as { block: string; apply(text: string, broader: boolean): string };
  test("inserts the block and prevents duplicates", () => {
    assert.strictEqual(preset.apply("", true), preset.block);
    const added = preset.apply("Check errors", true);
    assert.strictEqual(added, `Check errors\n\n${preset.block}`);
    assert.strictEqual(preset.apply(added, true), added);
  });
  test("removes edited contents and preserves surrounding guidance", () => {
    const edited = preset.block.replace("Investigate relevant", "Custom edited relevant");
    assert.strictEqual(preset.apply(`Before\n\n${edited}\n\nAfter`, false), "Before\n\nAfter");
    assert.strictEqual(preset.apply(`${edited}\n\nAfter`, false), "After");
    assert.strictEqual(preset.apply(`Before\n\n${edited}`, false), "Before");
    assert.strictEqual(preset.apply(edited, false), "");
    assert.strictEqual(preset.apply("  Custom\n\nguidance  ", false), "  Custom\n\nguidance  ");
  });
});
