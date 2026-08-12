# Release testing

This guide covers repeatable release smoke tests and manual checks for the AI
Badger VS Code extension. It focuses on common user scenarios and is
intentionally separate from the automated unit suite.

## Before you start

1. Run `npm run verify` from the extension repository.
2. Optionally run the automated Extension Host smoke suite:

   ```bash
   VSCODE_EXECUTABLE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Code" npm test
   ```

   Omit `VSCODE_EXECUTABLE_PATH` when the test runner should manage its own
   VS Code download. This smoke suite checks activation and command/menu
   registration; it does not replace the interactive scenarios below.
3. Open the extension repository in VS Code and start the **Run Extension**
   launch configuration. This opens an Extension Development Host.
4. Open a Git repository with at least one tracked or untracked change in the
   development host.
5. Make sure a compatible `badger` executable is available on `PATH`, or set
   `aiBadger.executablePath`.
6. Keep a known clipboard value available so failed operations can be checked
   for clipboard atomicity.

For provider-opening checks, use a test browser profile or a provider landing
page. The extension must never send prompt text to a provider API or embed it
in a URL.

## Public Marketplace release smoke

Use this short check after Marketplace publication to verify the extension
that users actually receive. Keep the profile, extension directory, workspace,
and repositories disposable and outside the product repository.

Before launching VS Code, create this file in the disposable profile at
`<profile>/User/settings.json`:

```json
{
  "security.workspace.trust.enabled": false
}
```

This setting is required for the isolated smoke fixture. Do not omit it:
otherwise VS Code opens the disposable workspace in Restricted Mode, disables
the extension, and `vscode-test palette` can time out or report misleading
command failures. A sandbox or process permission does not make the VS Code
workspace trusted.

Create a multi-root `.code-workspace` containing two disposable Git
repositories with one uncommitted file in each. Install the public extension
into the isolated extension directory, and confirm that the Marketplace serves
the expected version:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --install-extension pvrlabs.ai-badger --force \
  --extensions-dir <extensions-dir>

"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --list-extensions --show-versions \
  --extensions-dir <extensions-dir>
```

Run the multi-repository portion with the same `vscode-test` commands used for
the v0.0.4 public-release check:

```bash
vscode-test launch <fixture.code-workspace> \
  --user-data-dir <profile> \
  --extensions-dir <extensions-dir>
vscode-test activate
vscode-test palette "AI Badger: Copy Workspace Changes for Review"
vscode-test text page --limit 4000
vscode-test palette "Source Control: Focus on Changes View"
vscode-test controls page --filter "AI Badger"
vscode-test stop
```

Expected result: the installed version is the release being checked; activation
succeeds; workspace review reports that it copied both repositories; Source
Control contains one aggregate workspace action plus Copy All Changes and Deep
Review actions for each repository.

The click helper requires a unique accessible label. Because both repository
rows expose **AI Badger: Deep Review**, relaunch on one disposable repository
before opening the panel:

```bash
vscode-test launch <single-repository> \
  --user-data-dir <profile> \
  --extensions-dir <extensions-dir>
vscode-test activate
vscode-test palette "Source Control: Focus on Changes View"
vscode-test click --aria-label "AI Badger: Deep Review"
vscode-test text page --limit 4000
vscode-test stop
```

Expected result: the page text includes **AI Badger: Deep Review**. The Deep
Review UI is an editor webview, so `vscode-test text panel` is not the correct
inspection command and can report that no active panel frame is visible.

## Core scenarios

### 1. Deep Review surfaces

Verify **AI Badger: Deep Review** is available from:

- the repository row in Source Control;
- the **Changes** group inline action and context menu;
- the single-repository Source Control title fallback.

Invoke each surface and confirm it targets the repository represented by that
surface. The command should not appear for non-Git Source Control providers.

### 2. Repository isolation

Open two Git repositories with different changes. Invoke Deep Review from each
repository in turn.

Expected result: each request contains only the invoked repository's state.
There is no aggregation, active-editor fallback, first-workspace fallback, or
guessing when multiple repositories are ambiguous.

### 2a. Workspace-wide direct review

Open a disposable multi-root workspace containing at least two changed Git
repositories, including two repositories with the same folder name and the
same changed relative path when practical. Confirm **AI Badger: Copy Workspace
Changes for Review** appears once beside the aggregate **Changes** title, does
not appear on repository rows, and is available from the Command Palette.

Invoke both surfaces. Expected result: one clipboard request contains a
deterministic, repository-qualified section for every changed open repository;
duplicate names are numbered, same-named files stay in their own sections, and
clean repositories are absent. The action opens no wizard or provider and does
not run Badger. If one repository fails preparation, the aggregate request is
too large, or the clipboard write fails, the previous clipboard value remains
unchanged and no success message appears.

### 3. Guidance panel and consent boundary

Open Deep Review, edit the optional guidance, close it, and open it again.
Before Copy or Copy-and-Open, confirm that:

- no Badger process runs;
- no Git inspection occurs;
- the clipboard is unchanged;
- no provider opens;
- guidance is not persisted after the panel session ends.

### 4. Initial Copy

With repository changes present, enter guidance and choose **Copy**.

Expected result:

- Badger runs exactly when Copy is activated;
- the clipboard contains one complete Badger-generated request;
- the request includes `[PROJECT TOPOLOGY]` and `[SOURCE TREE]` when supported;
- guidance, review status, authoritative diff, and eligible file context are
  present;
- the extension copies Badger output verbatim and does not reformat it;
- no browser or provider opens automatically.

### 5. Copy-and-Open providers

Repeat the initial operation with every provider listed in **Copy and open AI
chat**.

Expected result: the clipboard write completes before the provider landing page
opens. A provider-open failure still leaves the copied request available and
does not claim that the provider opened. No prompt, selector, repository root,
or file content appears in the provider URL.

### 6. Optional continuation

After the initial request is copied, test these response types:

- normal findings text: the flow finishes locally without another Badger call;
- selector-only `FILE:` lines;
- selector-only `PREFIX:` lines;
- selector-only `NEAR:` lines;
- multiline selector-only input.

For valid selector-only input, **Continue Review** copies supplemental current
context without resending the initial prompt. The supplemental context may
reflect newer filesystem state.

Also test empty input, malformed selectors, and mixed prose/selectors. These
responses should remain editable, show a concise error, make no Badger call,
and leave the clipboard unchanged.

## Failure and recovery scenarios

Use the same repository and preserve a known clipboard value before each test.

| Scenario | Expected behavior |
| --- | --- |
| Missing Badger executable | Clear installation/configuration guidance; no clipboard write. |
| Incompatible or old Badger | Existing executable recovery offers upgrade or another executable; no silent topology-free fallback. |
| Clean repository | Clear no-change message; clipboard unchanged. |
| Invalid repository or Git failure | Concise inline error; guidance remains available for retry. |
| Badger generation failure | No partial clipboard write, no provider launch, retry remains possible. |
| Cancellation | No clipboard write or provider launch; the panel remains safe to retry. |
| Clipboard write failure | Error is shown; provider does not open and success is not reported. |
| Multiple repositories without a repository-specific target | Explicit ambiguity error; no repository is guessed. |

## Direct review sanity check

In Source Control, select one or more changed files and run **AI Badger: Copy
Selected Changes for Review**. Confirm the selected Git diff is present, small
eligible file context may be included, unrelated changes are absent, and the
action does not invoke Badger or open a wizard. Then run **AI Badger: Copy All
Changes for Review** and confirm it includes all changes for exactly one
repository. Finally run **AI Badger: Copy Workspace Changes for Review** and
confirm it includes every changed open Git repository without changing either
repository-scoped action's target.

## Results template

Record the following for each manual pass:

```text
Date:
VS Code version:
Extension commit/version:
Badger executable/version:
OS:
Repository fixture:

Passed scenarios:
Failed scenarios:
Observed errors:
Screenshots/logs:
Clipboard/provider privacy check:
```

Do not paste review prompts, repository contents, absolute roots, or provider
URLs into shared issue reports. Redact those values from screenshots and logs.
