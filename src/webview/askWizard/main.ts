/// <reference lib="dom" />

type VsCodeApi = {
  postMessage(message: AskWizardContract.ToHostMessage): void;
  setState<T>(state: T): void;
  getState<T>(): T | undefined;
};

declare function acquireVsCodeApi(): VsCodeApi;

window.addEventListener("error", () => {
  const error = document.getElementById("step1Error");
  if (error) {
    error.textContent = "Failed to initialize the wizard. Reload the window and try again.";
  }
});

const vscode = acquireVsCodeApi();

const config = readConfig();

const wizardTitle = mustGetElement<HTMLHeadingElement>("wizardTitle");
const headerStep = mustGetElement<HTMLSpanElement>("headerStep");
const badgerVersion = mustGetElement<HTMLSpanElement>("badgerVersion");
const step1 = mustGetElement<HTMLDivElement>("step1");
const step2 = mustGetElement<HTMLDivElement>("step2");
const done = mustGetElement<HTMLDivElement>("done");
const executableWarning =
  mustGetElement<HTMLDivElement>("executableWarning");
const executableWarningMessage =
  mustGetElement<HTMLSpanElement>("executableWarningMessage");
const resolveBadger = mustGetElement<HTMLButtonElement>("resolveBadger");
const goal = mustGetElement<HTMLTextAreaElement>("goal");
const aiResponse = mustGetElement<HTMLTextAreaElement>("aiResponse");
const requestInputPrompt = mustGetElement<HTMLParagraphElement>("requestInputPrompt");
const step1Hint = mustGetElement<HTMLParagraphElement>("step1Hint");
const step1Error = mustGetElement<HTMLParagraphElement>("step1Error");
const step2Error = mustGetElement<HTMLParagraphElement>("step2Error");
const handoffHeadline = mustGetElement<HTMLParagraphElement>("handoffHeadline");
const handoffInstructionEl = mustGetElement<HTMLParagraphElement>("handoffInstruction");
const promptSummary = mustGetElement<HTMLDivElement>("promptSummary");
const promptSummaryTitle = mustGetElement<HTMLParagraphElement>("promptSummaryTitle");
const promptSummaryNote = mustGetElement<HTMLParagraphElement>("promptSummaryNote");
const promptSummaryBody = mustGetElement<HTMLDivElement>("promptSummaryBody");
const guideTitle = mustGetElement<HTMLSpanElement>("guideTitle");
const guideBody = mustGetElement<HTMLParagraphElement>("guideBody");
const guideMedia = mustGetElement<HTMLDivElement>("guideMedia");
const guideMediaLabel = mustGetElement<HTMLSpanElement>("guideMediaLabel");
const guideLink = mustGetElement<HTMLButtonElement>("guideLink");
const doneMessageTitle = mustGetElement<HTMLParagraphElement>("doneMessageTitle");
const doneMessageDescription = mustGetElement<HTMLParagraphElement>(
  "doneMessageDescription"
);
const nextStepsTitle = mustGetElement<HTMLHeadingElement>("nextStepsTitle");
const nextStepsList = mustGetElement<HTMLOListElement>("nextStepsList");
const doneHint = mustGetElement<HTMLParagraphElement>("doneHint");
const step1Copy = mustGetElement<HTMLButtonElement>("step1Copy");
const step1Toggle = mustGetElement<HTMLButtonElement>("step1Toggle");
const step1Menu = mustGetElement<HTMLDivElement>("step1Menu");
const step1Cancel = mustGetElement<HTMLButtonElement>("step1Cancel");
const step2Copy = mustGetElement<HTMLButtonElement>("step2Copy");
const step2Cancel = mustGetElement<HTMLButtonElement>("step2Cancel");
const startAgain = mustGetElement<HTMLButtonElement>("startAgain");
const doneClose = mustGetElement<HTMLButtonElement>("doneClose");
const step1Split = mustGetElement<HTMLDivElement>("step1Split");
const selectorPrimitives = (
  globalThis as typeof globalThis & {
    BadgerSelectorPrimitives?: typeof BadgerSelectorPrimitives;
  }
).BadgerSelectorPrimitives;

let currentStep: 1 | 2 | 3 = 1;
let menuButtons: HTMLButtonElement[] = [];

registerEventHandlers();
try {
  applyStaticLabels();
  renderProviderMenu();
  showOnly(1);
  updateCopyEnabled();
} catch {
  step1Error.textContent = "Failed to initialize the wizard. Reload the window and try again.";
}

function applyStaticLabels(): void {
  document.title = config.title;
  wizardTitle.textContent = config.title;
  headerStep.textContent = config.step1Indicator;
  requestInputPrompt.textContent = config.requestInputPrompt;
  step1Hint.textContent = config.step1Hint;
  executableWarningMessage.textContent = config.executableUnavailableWarning;
  resolveBadger.textContent = config.resolveBadgerLabel;
  setExecutableStatus(config.executableUnavailable, false);
  goal.placeholder = config.requestInputPlaceholder;
  step1Cancel.textContent = config.step1CancelLabel;
  step1Copy.textContent = config.copyToClipboardLabel;
  step1Toggle.textContent = "▾";
  step1Menu.setAttribute("aria-label", config.moreCopyActionsLabel);
  step1Toggle.setAttribute("aria-label", config.moreCopyActionsAriaLabel);
  step1Toggle.title = config.moreCopyActionsTitle;
  handoffHeadline.textContent = config.handoffHeadline;
  handoffInstructionEl.textContent = config.handoffInstruction;
  promptSummaryTitle.textContent = config.prompt1SummaryTitle;
  promptSummaryNote.textContent = config.prompt1SummaryNote;
  guideTitle.textContent = config.optionalGuideTitle;
  guideBody.textContent = config.optionalGuide;
  guideMediaLabel.textContent = config.optionalGuideMediaLabel;
  guideMedia.setAttribute("aria-label", config.optionalGuideMediaLabel);
  guideLink.textContent = config.handoffGuideLinkLabel;
  aiResponse.placeholder = config.aiResponsePlaceholder;
  step2Cancel.textContent = config.step1CancelLabel;
  step2Copy.textContent = config.copyRequestedFilesLabel;
  doneMessageTitle.textContent = config.doneMessageTitle;
  doneMessageDescription.textContent = config.doneMessageDescription;
  nextStepsTitle.textContent = config.completionNextStepsTitle;
  renderCompletionNextSteps();
  doneHint.textContent = config.doneHint;
  startAgain.textContent = config.startAgainLabel;
  doneClose.textContent = config.doneCloseLabel;
}

function renderCompletionNextSteps(): void {
  nextStepsList.textContent = "";
  for (const [index, step] of config.completionNextSteps.entries()) {
    const item = document.createElement("li");
    item.className = "next-step";

    const marker = document.createElement("span");
    marker.className = "next-step-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = String(index + 1);

    const content = document.createElement("div");
    content.className = "next-step-content";

    const title = document.createElement("strong");
    title.className = "next-step-title";
    title.textContent = step.title;

    const description = document.createElement("span");
    description.className = "next-step-description";
    description.textContent = ` ${step.description}`;

    content.append(title, description);

    item.append(marker, content);
    nextStepsList.appendChild(item);
  }
}

function renderProviderMenu(): void {
  menuButtons = [];
  step1Menu.textContent = "";

  if (config.providers.length === 0) {
    step1Toggle.classList.add("hidden");
    step1Toggle.disabled = true;
    step1Menu.classList.add("hidden");
    step1Copy.classList.remove("split-main");
    step1Copy.classList.add("split-main-only");
    return;
  }

  step1Toggle.classList.remove("hidden");
  step1Toggle.disabled = false;
  step1Menu.classList.remove("hidden");
  step1Copy.classList.add("split-main");
  step1Copy.classList.remove("split-main-only");

  for (const provider of config.providers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-item";
    button.setAttribute("role", "menuitem");
    button.dataset.providerId = provider.id;
    button.textContent = provider.label;
    menuButtons.push(button);
    step1Menu.appendChild(button);
  }
}

function readConfig(): AskWizardContract.WebviewConfig {
  const configElement = document.getElementById("askWizardConfig");
  if (!configElement) {
    throw new Error("Missing ask wizard config.");
  }
  const raw = configElement.textContent ?? "{}";
  return JSON.parse(raw) as AskWizardContract.WebviewConfig;
}

function mustGetElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}

function setHandoffInstruction(instruction: string | undefined): void {
  handoffInstructionEl.textContent =
    typeof instruction === "string" && instruction.trim() !== ""
      ? instruction
      : config.handoffInstruction;
}

function setExecutableStatus(unavailable: boolean, busy: boolean): void {
  executableWarning.classList.toggle("hidden", !unavailable);
  resolveBadger.disabled = busy;
  resolveBadger.textContent = busy ? config.workingLabel : config.resolveBadgerLabel;
}

function setBadgerVersion(version: string | undefined): void {
  const value = typeof version === "string" ? version.trim() : "";
  badgerVersion.textContent = value ? `Badger ${value}` : "";
  badgerVersion.classList.toggle("hidden", value === "");
}

function setSummaryLines(lines: readonly string[] | undefined): void {
  const list = Array.isArray(lines)
    ? lines.filter((line) => typeof line === "string" && line.trim() !== "")
    : [];
  if (list.length === 0) {
    promptSummaryBody.textContent = "";
    promptSummary.classList.add("hidden");
    return;
  }

  promptSummaryBody.textContent = "";
  for (const line of list) {
    const paragraph = document.createElement("p");
    paragraph.className = "summary-line";
    paragraph.textContent = line;
    promptSummaryBody.appendChild(paragraph);
  }
  promptSummary.classList.remove("hidden");
}

function closeStep1Menu(): void {
  if (config.providers.length === 0) {
    return;
  }
  step1Menu.classList.add("hidden");
  step1Toggle.setAttribute("aria-expanded", "false");
}

function openStep1Menu(): void {
  if (config.providers.length === 0) {
    return;
  }
  step1Menu.classList.remove("hidden");
  step1Toggle.setAttribute("aria-expanded", "true");
}

function focusActive(): void {
  if (currentStep === 1) {
    goal.focus();
  } else if (currentStep === 2) {
    aiResponse.focus();
  } else {
    doneClose.focus();
  }
}

function updateCopyEnabled(): void {
  // Step 1 must remain usable if the optional shared selector script failed
  // to load. Step 2 still performs authoritative validation in the host.
  step2Copy.disabled = config.optionalSelectorContinuation
    ? aiResponse.value.trim() === ""
    : selectorPrimitives
      ? !selectorPrimitives.hasSelectorLikeContent(aiResponse.value)
      : aiResponse.value.trim() === "";
}

function setStep1Busy(busy: boolean): void {
  step1Copy.disabled = busy;
  step1Copy.textContent = busy ? config.workingLabel : config.copyToClipboardLabel;
  step1Toggle.disabled = busy || config.providers.length === 0;
  if (busy) {
    closeStep1Menu();
  }
  for (const button of menuButtons) {
    button.disabled = busy;
  }
  step1Cancel.disabled = busy;
  goal.disabled = busy;
}

function setBusy(busy: boolean, step?: 1 | 2): void {
  if (step === 1 || step === undefined) {
    setStep1Busy(busy);
  }
  if (step === 2 || step === undefined) {
    aiResponse.disabled = busy;
    step2Cancel.disabled = busy;
    if (busy) {
      step2Copy.disabled = true;
      step2Copy.textContent = config.workingLabel;
    } else {
      step2Copy.textContent = config.copyRequestedFilesLabel;
      updateCopyEnabled();
    }
  }
}

function updateHeaderStep(which: 1 | 2 | 3): void {
  if (which === 1) {
    headerStep.textContent = config.step1Indicator;
    headerStep.classList.remove("hidden");
  } else if (which === 2) {
    headerStep.textContent = config.step2Indicator;
    headerStep.classList.remove("hidden");
  } else {
    headerStep.textContent = "";
    headerStep.classList.add("hidden");
  }
}

function showOnly(which: 1 | 2 | 3): void {
  step1.classList.toggle("hidden", which !== 1);
  step2.classList.toggle("hidden", which !== 2);
  done.classList.toggle("hidden", which !== 3);
  currentStep = which;
  updateHeaderStep(which);
  closeStep1Menu();
  focusActive();
  setTimeout(focusActive, 0);
}

function showStep2(
  handoffInstruction: string | undefined,
  summaryLines: readonly string[] | undefined,
  version?: string
): void {
  setBadgerVersion(version);
  step1Error.textContent = "";
  step2Error.textContent = "";
  aiResponse.value = "";
  setHandoffInstruction(handoffInstruction);
  setSummaryLines(summaryLines);
  updateCopyEnabled();
  showOnly(2);
}

function showStep1(goalText: string | undefined): void {
  setBadgerVersion(undefined);
  step1Error.textContent = "";
  step2Error.textContent = "";
  if (typeof goalText === "string") {
    goal.value = goalText;
  }
  aiResponse.value = "";
  setHandoffInstruction(undefined);
  setSummaryLines([]);
  updateCopyEnabled();
  showOnly(1);
}

function showDone(): void {
  step2Error.textContent = "";
  showOnly(3);
}

function submitStep1(openProviderId?: string): void {
  step1Error.textContent = "";
  closeStep1Menu();
  const message: AskWizardContract.ToHostMessage = {
    type: "step1Submit",
    text: goal.value,
  };
  if (openProviderId) {
    message.openProviderId = openProviderId;
  }
  vscode.postMessage(message);
}

function registerEventHandlers(): void {
if (step1Copy) {
  step1Copy.addEventListener("click", () => submitStep1());
}
if (step1Toggle && step1Menu) {
  step1Toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (step1Menu.classList.contains("hidden")) {
      openStep1Menu();
    } else {
      closeStep1Menu();
    }
  });
  step1Menu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("button[data-provider-id]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const providerId = button.getAttribute("data-provider-id");
    if (!providerId) {
      return;
    }
    submitStep1(providerId);
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      closeStep1Menu();
      return;
    }
    if (step1Split.contains(target)) {
      return;
    }
    closeStep1Menu();
  });
}
step1Cancel.addEventListener("click", () => {
  vscode.postMessage({ type: "cancel" });
});
step2Copy.addEventListener("click", () => {
  if (step2Copy.disabled) {
    return;
  }
  step2Error.textContent = "";
  vscode.postMessage({ type: "step2Submit", text: aiResponse.value });
});
step2Cancel.addEventListener("click", () => {
  vscode.postMessage({ type: "cancel" });
});
startAgain.addEventListener("click", () => {
  vscode.postMessage({ type: "startAgain" });
});
doneClose.addEventListener("click", () => {
  vscode.postMessage({ type: "close" });
});
guideLink.addEventListener("click", () => {
  vscode.postMessage({ type: "openHandoffGuide" });
});
resolveBadger.addEventListener("click", () => {
  if (!resolveBadger.disabled) {
    vscode.postMessage({ type: "openExecutableRecovery" });
  }
});
aiResponse.addEventListener("input", updateCopyEnabled);
aiResponse.addEventListener("paste", () => setTimeout(updateCopyEnabled, 0));

function onKey(event: KeyboardEvent, submit: () => void): void {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    submit();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (step1Menu && !step1Menu.classList.contains("hidden")) {
      closeStep1Menu();
      return;
    }
    vscode.postMessage({ type: "cancel" });
  }
}

goal.addEventListener("keydown", (event) => onKey(event, () => submitStep1()));
aiResponse.addEventListener("keydown", (event) =>
  onKey(event, () => {
    if (!step2Copy.disabled) {
      step2Copy.click();
    }
  })
);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && currentStep !== 3) {
    event.preventDefault();
    if (step1Menu && !step1Menu.classList.contains("hidden")) {
      closeStep1Menu();
      return;
    }
    vscode.postMessage({ type: "cancel" });
  }
});

window.addEventListener("message", (event) => {
  const msg = event.data as AskWizardContract.ToWebviewMessage | undefined;
  if (!msg || typeof msg !== "object" || !("type" in msg)) {
    return;
  }
  if (msg.type === "busy") {
    setBusy(!!msg.busy, msg.step);
  }
  if (msg.type === "step1Error") {
    step1Error.textContent = msg.message || "Something went wrong.";
    focusActive();
  }
  if (msg.type === "executableStatus") {
    setExecutableStatus(!!msg.unavailable, !!msg.busy);
  }
  if (msg.type === "showStep2") {
    showStep2(msg.handoffInstruction, msg.summaryLines, msg.badgerVersion);
  }
  if (msg.type === "showStep1") {
    showStep1(msg.goal || "");
  }
  if (msg.type === "showDone") {
    showDone();
  }
  if (msg.type === "badgerVersion") {
    setBadgerVersion(msg.version);
  }
  if (msg.type === "validationError") {
    step2Error.textContent = msg.message || "Invalid AI response.";
    focusActive();
  }
});
}
