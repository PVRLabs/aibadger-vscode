import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GITHUB_REPOSITORY = "PVRLabs/aibadger-vscode";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseOptions(args) {
  const options = { azureCredential: false, dryRun: false, help: false };
  for (const arg of args) {
    if (arg === "--azure-credential") options.azureCredential = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export function validateManifest(manifest) {
  if (manifest.publisher !== "pvrlabs") {
    throw new Error(`Expected publisher pvrlabs, found ${manifest.publisher ?? "(missing)"}`);
  }
  if (typeof manifest.version !== "string" || !SEMVER.test(manifest.version)) {
    throw new Error(`Expected an exact stable SemVer version, found ${manifest.version ?? "(missing)"}`);
  }
  if (!manifest.name || !/^[a-z0-9-]+$/.test(manifest.name)) {
    throw new Error(`Expected a lowercase package name, found ${manifest.name ?? "(missing)"}`);
  }
  return { version: manifest.version, tag: `v${manifest.version}`, asset: `${manifest.name}-${manifest.version}.vsix` };
}

export function validateTag(version, tag) {
  const expected = `v${version}`;
  if (tag !== expected) throw new Error(`Expected release tag ${expected}, found ${tag || "(none)"}`);
}

export function validateArchiveFiles(entries) {
  const files = new Set(entries.map((entry) => entry.replace(/^\.\//, "").replace(/\/$/, "")));
  const required = [
    "extension/package.json",
    "extension/out/extension.js",
    "extension/LICENSE",
    "extension/media/ai-badger-icon.png",
  ];
  const missing = required.filter((entry) => !files.has(entry));
  if (missing.length) throw new Error(`VSIX is missing required files: ${missing.join(", ")}`);

  const forbidden = entries.filter((entry) =>
    /(^|\/)(?:src|test|tests|fixtures|docs|node_modules)(\/|$)/i.test(entry) ||
    /\.(?:ts|map)$/i.test(entry) ||
    /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.badger-context|credentials?(?:\..*)?)$/i.test(entry) ||
    /\.(?:pem|key|p12)$/i.test(entry),
  );
  if (forbidden.length) throw new Error(`VSIX contains excluded files: ${forbidden.join(", ")}`);

  return entries;
}

export function validatePackagedManifest(manifest, expected) {
  if (manifest.publisher !== "pvrlabs") {
    throw new Error(`VSIX publisher must be pvrlabs, found ${manifest.publisher ?? "(missing)"}`);
  }
  if (manifest.version !== expected.version) {
    throw new Error(`VSIX version must be ${expected.version}, found ${manifest.version ?? "(missing)"}`);
  }
  if (manifest.name !== expected.name) {
    throw new Error(`VSIX name must be ${expected.name}, found ${manifest.name ?? "(missing)"}`);
  }
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
  return capture ? result.stdout.trim() : "";
}

function readJsonFromArchive(archive, entry) {
  const text = execFileSync("unzip", ["-p", archive, entry], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(text);
}

async function confirmPublication(tag, version) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Refusing to publish without an interactive terminal. Run this command locally and confirm the tag.");
  }
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`Type ${tag} to publish AI Badger ${version} to the Marketplace: `);
    return answer.trim() === tag;
  } finally {
    prompt.close();
  }
}

async function main(args) {
  const options = parseOptions(args);
  if (options.help) {
    console.log("Usage: npm run publish:marketplace [-- --azure-credential] [--dry-run]");
    console.log("Downloads the VSIX attached to the matching GitHub Release, validates it, then publishes it.");
    return;
  }

  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const release = validateManifest(manifest);
  if (options.azureCredential && process.env.VSCE_PAT) {
    throw new Error("Unset VSCE_PAT when using --azure-credential; vsce cannot use both authentication methods at once");
  }
  validateTag(release.version, run("git", ["describe", "--exact-match", "--tags", "HEAD"], { capture: true }));

  const status = run("git", ["status", "--porcelain", "--untracked-files=all"], { capture: true });
  if (status) throw new Error("The working tree must be clean before Marketplace publication");

  const commit = run("git", ["rev-parse", "HEAD"], { capture: true });
  const tagCommit = run("git", ["rev-parse", `refs/tags/${release.tag}^{commit}`], { capture: true });
  if (commit !== tagCommit) throw new Error(`${release.tag} does not point at HEAD`);

  const releaseInfo = JSON.parse(run("gh", [
    "release", "view", release.tag,
    "--repo", GITHUB_REPOSITORY,
    "--json", "tagName,isDraft,isPrerelease,assets",
  ], { capture: true }));
  validateTag(release.version, releaseInfo.tagName);
  if (releaseInfo.isDraft || releaseInfo.isPrerelease) {
    throw new Error(`${release.tag} must be a published stable GitHub Release`);
  }
  const matchingAssets = (releaseInfo.assets ?? []).filter((asset) => asset.name === release.asset);
  if (matchingAssets.length !== 1) {
    throw new Error(`Expected exactly one ${release.asset} asset on GitHub Release ${release.tag}`);
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "ai-badger-marketplace-"));
  try {
    run("gh", [
      "release", "download", release.tag,
      "--repo", GITHUB_REPOSITORY,
      "--pattern", release.asset,
      "--dir", tempDir,
    ]);
    const downloaded = readdirSync(tempDir).filter((entry) => entry === release.asset);
    if (downloaded.length !== 1) throw new Error(`Could not download the expected asset ${release.asset}`);
    const archive = path.join(tempDir, release.asset);

    const entries = run("unzip", ["-Z1", archive], { capture: true }).split(/\r?\n/).filter(Boolean);
    validateArchiveFiles(entries);
    const packagedManifest = readJsonFromArchive(archive, "extension/package.json");
    validatePackagedManifest(packagedManifest, { ...release, name: manifest.name });

    console.log(`Validated ${release.asset} (${createHash("sha256").update(readFileSync(archive)).digest("hex")})`);
    console.log("VSIX contents:");
    for (const entry of entries) console.log(`  ${entry}`);

    run("npm", ["run", "verify"]);
    if (options.dryRun) {
      console.log(`Preflight passed for ${release.tag}; Marketplace publication was skipped (--dry-run).`);
      return;
    }

    if (!(await confirmPublication(release.tag, release.version))) {
      console.log("Marketplace publication cancelled.");
      return;
    }

    const publishArgs = ["--packagePath", archive];
    if (options.azureCredential) publishArgs.push("--azure-credential");
    run("npm", ["run", "vsce:publish", "--", ...publishArgs]);
    console.log(`Published ${manifest.publisher}.${manifest.name}@${release.version} to the Visual Studio Marketplace.`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Marketplace publication failed: ${error.message}`);
    process.exitCode = 1;
  });
}
