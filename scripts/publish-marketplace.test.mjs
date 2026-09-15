import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOptions,
  validateArchiveFiles,
  validateManifest,
  validatePackagedManifest,
  validateTag,
} from "./publish-marketplace.mjs";

test("parses Marketplace publish options", () => {
  assert.deepEqual(parseOptions(["--dry-run", "--azure-credential"]), {
    azureCredential: true,
    dryRun: true,
    help: false,
  });
  assert.equal(parseOptions(["--help"]).help, true);
  assert.throws(() => parseOptions(["--unknown"]), /Unknown option/);
});

test("derives the stable release tag and VSIX asset name", () => {
  assert.deepEqual(validateManifest({ publisher: "pvrlabs", name: "ai-badger", version: "0.1.3" }), {
    version: "0.1.3",
    tag: "v0.1.3",
    asset: "ai-badger-0.1.3.vsix",
  });
  assert.throws(() => validateManifest({ publisher: "other", name: "ai-badger", version: "0.1.3" }), /publisher/);
  assert.throws(() => validateManifest({ publisher: "pvrlabs", name: "ai-badger", version: "0.1.3-beta" }), /stable SemVer/);
});

test("requires the matching exact release tag", () => {
  assert.doesNotThrow(() => validateTag("0.1.3", "v0.1.3"));
  assert.throws(() => validateTag("0.1.3", "v0.1.2"), /Expected release tag v0.1.3/);
});

test("checks required runtime files and rejects development or secret files", () => {
  const required = [
    "extension/package.json",
    "extension/out/extension.js",
    "extension/LICENSE",
    "extension/media/ai-badger-icon.png",
  ];
  assert.deepEqual(validateArchiveFiles(required), required);
  assert.throws(() => validateArchiveFiles(required.slice(1)), /missing required files/);
  assert.throws(() => validateArchiveFiles([...required, "extension/out/extension.js.map"]), /excluded files/);
  assert.throws(() => validateArchiveFiles([...required, "extension/.env"]), /excluded files/);
});

test("checks the publisher, extension name, and version inside the VSIX", () => {
  const expected = { name: "ai-badger", version: "0.1.3" };
  assert.doesNotThrow(() => validatePackagedManifest({ ...expected, publisher: "pvrlabs" }, expected));
  assert.throws(() => validatePackagedManifest({ ...expected, publisher: "other" }, expected), /publisher/);
  assert.throws(() => validatePackagedManifest({ ...expected, version: "0.1.2", publisher: "pvrlabs" }, expected), /version/);
});
