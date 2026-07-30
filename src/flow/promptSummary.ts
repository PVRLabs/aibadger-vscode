/**
 * Compact Prompt 1 topology / payload summary for Step 2.
 *
 * Derives only from the Prompt 1 text already returned by `api prompt`
 * (plus optional project root / scope from the extension request). Never
 * re-scans the workspace and never includes file contents.
 */

/** Default package names shown in the sample line. */
export const DEFAULT_SAMPLE_PACKAGES = 4;

export type Prompt1SummaryModel = {
  languages?: string;
  primary?: string;
  stack?: string;
  structure?: string;
  packageCount: number;
  /** Sum of `[N files]` counts from source-tree lines when parseable. */
  fileCount?: number;
  samplePackages: string[];
  remainingPackages: number;
  /** UTF-8 byte length of the full Prompt 1 payload. */
  payloadBytes: number;
  /** Basename of project root when provided. */
  projectName?: string;
  /** Root-relative scope when the Ask was file/folder scoped. */
  scope?: string;
};

export type SummarizePrompt1Options = {
  projectRoot?: string;
  scope?: string;
  maxSamples?: number;
};

/**
 * Build a summary model from Prompt 1 text. Returns undefined when nothing
 * useful can be shown beyond an empty shell (caller may still show size-only
 * via a minimal model if desired).
 */
export function summarizePrompt1(
  prompt: string,
  options: SummarizePrompt1Options = {}
): Prompt1SummaryModel | undefined {
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return undefined;
  }

  const payloadBytes = utf8ByteLength(prompt);
  const maxSamples = options.maxSamples ?? DEFAULT_SAMPLE_PACKAGES;
  const header = extractSection(prompt, "PROJECT TOPOLOGY");
  const tree = extractSection(prompt, "SOURCE TREE");

  const languages = matchField(header, "Languages");
  const primary = matchField(header, "Primary");
  const stack = matchField(header, "Stack");
  const structure = matchField(header, "Structure");

  const packages = parseSourceTreePackages(tree);
  const packageCount = packages.length;
  let fileCount: number | undefined;
  if (packageCount > 0) {
    let sum = 0;
    let any = false;
    for (const p of packages) {
      if (p.fileCount !== undefined) {
        sum += p.fileCount;
        any = true;
      }
    }
    if (any) {
      fileCount = sum;
    }
  }

  const samplePackages = packages
    .slice(0, Math.max(0, maxSamples))
    .map((p) => p.name);
  const remainingPackages = Math.max(0, packageCount - samplePackages.length);

  const projectName = options.projectRoot
    ? baseName(options.projectRoot)
    : undefined;
  const scope =
    options.scope && options.scope.trim() !== ""
      ? options.scope.trim()
      : undefined;

  const hasMeta = Boolean(languages || primary || stack || structure);
  const hasTree = packageCount > 0;
  // Always useful: payload size. Prefer showing when we have any orientation.
  if (!hasMeta && !hasTree && payloadBytes === 0) {
    return undefined;
  }

  return {
    ...(languages ? { languages } : {}),
    ...(primary ? { primary } : {}),
    ...(stack ? { stack } : {}),
    ...(structure ? { structure } : {}),
    packageCount,
    ...(fileCount !== undefined ? { fileCount } : {}),
    samplePackages,
    remainingPackages,
    payloadBytes,
    ...(projectName ? { projectName } : {}),
    ...(scope ? { scope } : {}),
  };
}

/**
 * Format a summary model into short display lines for the webview.
 * Does not include the section title/note ("Topology only" / "No source…").
 * Never includes full prompt body or source contents.
 *
 * Scale uses package counts from the topology tree only — not "files included."
 */
export function formatPrompt1SummaryLines(
  model: Prompt1SummaryModel
): string[] {
  const lines: string[] = [];

  const metaParts: string[] = [];
  if (model.languages) {
    metaParts.push(`Languages: ${model.languages}`);
  }
  if (model.primary) {
    metaParts.push(`Primary: ${model.primary}`);
  }
  if (model.stack) {
    metaParts.push(`Stack: ${model.stack}`);
  }
  if (model.structure) {
    metaParts.push(`Structure: ${model.structure}`);
  }
  if (metaParts.length > 0) {
    lines.push(metaParts.join(" · "));
  }

  // Packages + payload only. Avoid "~N files" — it reads as "files included."
  const scaleParts: string[] = [];
  if (model.packageCount > 0) {
    scaleParts.push(
      `~${model.packageCount} package${model.packageCount === 1 ? "" : "s"} in tree`
    );
  }
  scaleParts.push(`payload ${formatByteSize(model.payloadBytes)}`);
  lines.push(scaleParts.join(" · "));

  const locParts: string[] = [];
  if (model.projectName) {
    locParts.push(`Project: ${model.projectName}`);
  }
  if (model.scope) {
    locParts.push(`Scope: ${model.scope}`);
  }
  if (locParts.length > 0) {
    lines.push(locParts.join(" · "));
  }

  if (model.samplePackages.length > 0) {
    let sample = `Packages: ${model.samplePackages.join(", ")}`;
    if (model.remainingPackages > 0) {
      sample += `, and ${model.remainingPackages} more`;
    }
    lines.push(sample);
  }

  return lines;
}

/** Human-readable size (TUI-inspired, simple). */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    const rounded = kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10;
    return `${rounded} KB`;
  }
  const mb = kb / 1024;
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${rounded} MB`;
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Extract text after `[NAME]` until the next top-level `[SECTION]` header
 * (a line that is only `[...]`).
 */
function extractSection(prompt: string, name: string): string {
  const header = `[${name}]`;
  const start = prompt.indexOf(header);
  if (start < 0) {
    return "";
  }
  const bodyStart = start + header.length;
  const rest = prompt.slice(bodyStart);
  const next = rest.search(/\n\[[^\]]+\]/);
  if (next < 0) {
    return rest;
  }
  return rest.slice(0, next);
}

function matchField(section: string, label: string): string | undefined {
  if (!section) {
    return undefined;
  }
  const re = new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "im");
  const m = section.match(re);
  if (!m) {
    return undefined;
  }
  const value = m[1].trim();
  return value.length > 0 ? value : undefined;
}

type ParsedPackage = {
  name: string;
  fileCount?: number;
};

/**
 * Parse `Pkg: name [N files] ...` lines from a source-tree section.
 * Stops at blank-line runs only as structure; ignores Top/Aux file lists
 * (names only on the Pkg line — no contents).
 */
function parseSourceTreePackages(tree: string): ParsedPackage[] {
  if (!tree) {
    return [];
  }
  const out: ParsedPackage[] = [];
  for (const raw of tree.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    // Pkg: path [N files] -> ...
    const m = line.match(/^Pkg:\s*(.+?)\s*\[(\d+)\s+files?\]/i);
    if (m) {
      out.push({ name: m[1].trim(), fileCount: Number(m[2]) });
      continue;
    }
    // Fallback without file count: Pkg: path
    const m2 = line.match(/^Pkg:\s*(\S+)/i);
    if (m2) {
      out.push({ name: m2[1].trim() });
    }
  }
  return out;
}

function baseName(projectRoot: string): string {
  const normalized = projectRoot.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
