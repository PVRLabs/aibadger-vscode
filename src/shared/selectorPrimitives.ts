/**
 * Dependency-free selector primitives shared by the CommonJS extension host
 * and the plain-script webview. This file intentionally has no imports or
 * exports so TypeScript emits a browser-loadable script.
 */
// A global namespace is deliberate: the same emitted file must work as a
// browser script and as a side-effect-loaded CommonJS host dependency.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace BadgerSelectorPrimitives {
  export type SelectorType = "FILE" | "PREFIX" | "NEAR";

  export type ParsedSelector = {
    type: SelectorType;
    path: string;
    literal: string;
    line: number;
    raw: string;
  };

  export type ValidationResult =
    | { ok: true; text: string; selectors: ParsedSelector[] }
    | { ok: false; line?: number; message: string };

  const SELECTOR_TYPES = new Set<string>(["FILE", "PREFIX", "NEAR"]);

  export function hasSelectorLikeContent(text: string): boolean {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "") {
        continue;
      }
      const colon = trimmed.indexOf(":");
      if (
        colon > 0 &&
        SELECTOR_TYPES.has(trimmed.slice(0, colon).trim().toUpperCase())
      ) {
        return true;
      }
    }
    return false;
  }

  const parseSelectorLine = (
    raw: string,
    line: number
  ): { ok: true; selector: ParsedSelector } | Exclude<ValidationResult, { ok: true }> => {
    const colon = raw.indexOf(":");
    if (colon <= 0) {
      return {
        ok: false,
        line,
        message: `Line ${line}: expected FILE:, PREFIX:, or NEAR: selector.`,
      };
    }

    const typeRaw = raw.slice(0, colon).trim().toUpperCase();
    const value = raw.slice(colon + 1).trim();
    if (!SELECTOR_TYPES.has(typeRaw)) {
      return {
        ok: false,
        line,
        message: `Line ${line}: unknown operator "${raw.slice(0, colon).trim()}". Use FILE, PREFIX, or NEAR.`,
      };
    }

    const type = typeRaw as SelectorType;
    if (!value) {
      return {
        ok: false,
        line,
        message: `Line ${line}: missing path after ${type}:.`,
      };
    }
    if (type === "FILE") {
      return {
        ok: true,
        selector: { type, path: value, literal: "", line, raw: `${type}:${value}` },
      };
    }

    const hash = value.indexOf("#");
    if (hash < 0) {
      return {
        ok: false,
        line,
        message: `Line ${line}: ${type} requires path#literal (missing "#").`,
      };
    }
    const path = value.slice(0, hash).trim();
    const literal = value.slice(hash + 1).trim();
    if (!path) {
      return {
        ok: false,
        line,
        message: `Line ${line}: missing path before "#" in ${type} selector.`,
      };
    }
    if (!literal) {
      return {
        ok: false,
        line,
        message: `Line ${line}: missing literal after "#" in ${type} selector.`,
      };
    }
    return {
      ok: true,
      selector: { type, path, literal, line, raw: `${type}:${path}#${literal}` },
    };
  };

  export function validateSelectors(input: string): ValidationResult {
    const lines = input.split(/\r?\n/);
    const selectors: ParsedSelector[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = index + 1;
      const raw = lines[index].trim();
      if (raw === "") {
        continue;
      }
      const parsed = parseSelectorLine(raw, line);
      if (!parsed.ok) {
        return parsed;
      }
      selectors.push(parsed.selector);
    }

    if (selectors.length === 0) {
      return {
        ok: false,
        message: "Paste at least one FILE, PREFIX, or NEAR line.",
      };
    }
    return {
      ok: true,
      text: selectors.map((selector) => selector.raw).join("\n"),
      selectors,
    };
  }

}

(
  globalThis as typeof globalThis & {
    BadgerSelectorPrimitives: typeof BadgerSelectorPrimitives;
  }
).BadgerSelectorPrimitives = BadgerSelectorPrimitives;
