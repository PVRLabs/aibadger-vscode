// Plain script shared by the webview and unit tests.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace BadgerReviewPreset {
  const start = "[AI Badger: Broader context]";
  const end = "[/AI Badger: Broader context]";
  export const block = `${start}\nInvestigate relevant unchanged files and cross-file interactions. Proactively request additional context when it could reveal regressions or unintended behavior, even if the supplied context appears sufficient. Keep findings focused on the selected changes.\n${end}`;

  export function apply(guidance: string, broader: boolean): string {
    if (broader && guidance.includes(start) && guidance.includes(end)) {
      return guidance;
    }
    let result = guidance;
    let from = result.indexOf(start);
    while (from >= 0) {
      const to = result.indexOf(end, from + start.length);
      if (to < 0) { break; }
      const before = result.slice(0, from).replace(/[ \t]*\r?\n(?:[ \t]*\r?\n)*[ \t]*$/, "");
      const after = result.slice(to + end.length).replace(/^[ \t]*(?:\r?\n[ \t]*)+/, "");
      result = before && after ? `${before}\n\n${after}` : before + after;
      from = result.indexOf(start);
    }
    return broader ? (result.trim() ? `${result.trimEnd()}\n\n${block}` : block) : result;
  }
}

(globalThis as typeof globalThis & { BadgerReviewPreset: typeof BadgerReviewPreset }).BadgerReviewPreset = BadgerReviewPreset;
