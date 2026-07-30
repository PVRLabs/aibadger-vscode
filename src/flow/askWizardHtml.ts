import * as fs from "fs";
import * as path from "path";

export type AskWizardHtmlParams = {
  title: string;
  logoSrc?: string;
  cspSource: string;
  stylesheetUri: string;
  selectorScriptUri: string;
  scriptUri: string;
  config: AskWizardContract.WebviewConfig;
};

const PLACEHOLDER_KEYS = [
  "TITLE",
  "LOGO_HTML",
  "CSP_SOURCE",
  "STYLESHEET_URI",
  "SELECTOR_SCRIPT_URI",
  "SCRIPT_URI",
  "CONFIG_JSON",
] as const;

export type WizardTemplateKey = (typeof PLACEHOLDER_KEYS)[number];

export type WizardTemplateReplacements = Record<WizardTemplateKey, string>;

const WIZARD_TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "webview",
  "askWizard",
  "index.html"
);

export function buildWizardHtml(params: AskWizardHtmlParams): string {
  return renderWizardTemplate(loadWizardTemplate(), {
    TITLE: escapeHtml(params.title),
    LOGO_HTML: params.logoSrc
      ? `<img class="logo" src="${escapeHtml(params.logoSrc)}" alt="" width="36" height="36" />`
      : "",
    CSP_SOURCE: escapeHtml(params.cspSource),
    STYLESHEET_URI: escapeHtml(params.stylesheetUri),
    SELECTOR_SCRIPT_URI: escapeHtml(params.selectorScriptUri),
    SCRIPT_URI: escapeHtml(params.scriptUri),
    CONFIG_JSON: serializeJsonForHtml(params.config),
  });
}

export function renderWizardTemplate(
  template: string,
  replacements: WizardTemplateReplacements
): string {
  const seen = new Set<WizardTemplateKey>();
  const rendered = template.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
    if (!isWizardTemplateKey(rawKey)) {
      throw new Error(`Unknown wizard template placeholder: ${match}`);
    }
    seen.add(rawKey);
    return replacements[rawKey];
  });

  for (const key of PLACEHOLDER_KEYS) {
    if (!seen.has(key)) {
      throw new Error(`Missing wizard template placeholder: {{${key}}}`);
    }
  }

  return rendered;
}

function loadWizardTemplate(): string {
  return fs.readFileSync(WIZARD_TEMPLATE_PATH, "utf8");
}

function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/[<\u2028\u2029]/g, (char) => {
    if (char === "<") {
      return "\\u003c";
    }
    if (char === "\u2028") {
      return "\\u2028";
    }
    return "\\u2029";
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isWizardTemplateKey(key: string): key is WizardTemplateKey {
  return (PLACEHOLDER_KEYS as readonly string[]).includes(key);
}
