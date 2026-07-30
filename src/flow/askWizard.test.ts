import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  buildWizardHtml,
  renderWizardTemplate,
  type AskWizardHtmlParams,
} from "./askWizardHtml";

suite("ask wizard webview html", () => {
  test("compiles Step 1 handlers and selector fallback into the webview bundle", () => {
    const bundle = fs.readFileSync(
      path.join(__dirname, "..", "webview", "askWizard", "main.js"),
      "utf8"
    );
    assert.ok(bundle.includes('type: "step1Submit"'));
    assert.ok(bundle.includes("step1Cancel.addEventListener"));
    assert.ok(bundle.includes('aiResponse.value.trim() === ""'));
  });

  test("injects external resources and safely serializes config", () => {
    const params: AskWizardHtmlParams = {
      title: "{{SCRIPT_URI}}",
      logoSrc: `vscode-webview://test/logo?x={{TITLE}}`,
      cspSource: "vscode-webview://test",
      stylesheetUri: "vscode-webview://test/styles.css",
      selectorScriptUri: "vscode-webview://test/selectorPrimitives.js",
      scriptUri: "vscode-webview://test/main.js",
      config: {
        title: "{{CONFIG_JSON}}",
        requestInputPrompt: "Prompt text",
        requestInputPlaceholder: "Placeholder text",
        step1Indicator: "Step 1 of 2",
        step1Hint: "Hint text",
        executableUnavailable: true,
        executableUnavailableWarning: "Badger is unavailable.",
        resolveBadgerLabel: "Fix issue",
        copyToClipboardLabel: "Copy to Clipboard",
        step1CancelLabel: "Cancel",
        moreCopyActionsLabel: "More copy actions",
        moreCopyActionsTitle: "Copy and open AI chat",
        moreCopyActionsAriaLabel: "More copy actions",
        step2Indicator: "Step 2 of 2",
        handoffHeadline: "Headline",
        handoffInstruction: "Instruction",
        prompt1SummaryTitle: "Topology only",
        prompt1SummaryNote: "No source files included",
        optionalGuideTitle: "See the handoff flow",
        optionalGuide: "Guide text",
        optionalGuideMediaLabel: "Media label",
        handoffGuideLinkLabel: "Read the full handoff guide",
        aiResponsePlaceholder: "Paste response",
        copyRequestedFilesLabel: "Copy requested files",
        doneMessageTitle: "Done title",
        doneMessageDescription: "Done description",
        completionNextStepsTitle: "What next",
        completionNextSteps: [
          { title: "First step", description: "First description" },
        ],
        doneHint: "Done hint",
        startAgainLabel: "Start again",
        doneCloseLabel: "Close",
        workingLabel: "Working…",
        providers: [
          {
            id: "chatgpt",
            label: `Copy and Open ChatGPT </script>`,
          },
        ],
      },
    };

    const html = buildWizardHtml(params);
    assert.ok(html.includes("vscode-webview://test/styles.css"));
    assert.ok(html.includes("vscode-webview://test/main.js"));
    assert.ok(html.includes("vscode-webview://test/selectorPrimitives.js"));
    assert.ok(!html.includes("unsafe-inline"));
    assert.ok(html.includes("<title>{{SCRIPT_URI}}</title>"));
    assert.ok(html.includes("x={{TITLE}}"));
    assert.ok(html.includes('"title":"{{CONFIG_JSON}}"'));

    const match = html.match(
      /<script type="application\/json" id="askWizardConfig">([\s\S]*?)<\/script>/
    );
    assert.ok(match, "config script tag should be present");
    assert.ok(!match[1].includes("vscode-webview://test/main.js"));
    assert.ok(match[1].includes("\\u003c"));

    const config = JSON.parse(match[1] as string) as AskWizardHtmlParams["config"];
    assert.strictEqual(config.title, params.config.title);
    assert.strictEqual(config.providers[0].label, params.config.providers[0].label);
    assert.strictEqual(config.requestInputPrompt, "Prompt text");
    assert.strictEqual(config.completionNextSteps[0].title, "First step");

    const htmlWithoutLogo = buildWizardHtml({
      ...params,
      logoSrc: undefined,
    });
    assert.ok(htmlWithoutLogo.includes("vscode-webview://test/styles.css"));
    assert.ok(htmlWithoutLogo.includes("vscode-webview://test/main.js"));
    assert.ok(!htmlWithoutLogo.includes('href=""'));
    assert.ok(!htmlWithoutLogo.includes('src=""'));
    assert.ok(!htmlWithoutLogo.includes('class="logo"'));
    assert.ok(html.includes('id="executableWarning"'));
    assert.ok(html.includes('class="callout callout--warning hidden"'));
    assert.ok(html.includes('class="callout__icon" aria-hidden="true">⚠️</span>'));
    assert.ok(html.includes('class="completion-status" role="status"'));
    assert.ok(html.includes('class="next-steps" aria-labelledby="nextStepsTitle"'));
    assert.ok(html.includes('class="next-steps__list" id="nextStepsList"'));
    assert.ok(html.includes('class="completion-footer" id="doneHint"'));
    assert.ok(html.includes('"executableUnavailable":true'));

    assert.throws(
      () =>
        renderWizardTemplate("{{TITLE}} {{BROKEN}}", {
          TITLE: "ok",
          LOGO_HTML: "",
          CSP_SOURCE: "csp",
          STYLESHEET_URI: "style",
          SELECTOR_SCRIPT_URI: "selectors",
          SCRIPT_URI: "script",
          CONFIG_JSON: "{}",
        }),
      /Unknown wizard template placeholder/
    );
  });
});
