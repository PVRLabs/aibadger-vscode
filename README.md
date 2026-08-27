# AI Badger for VS Code

![AI Badger for VS Code Deep Review workflow](https://raw.githubusercontent.com/PVRLabs/aibadger-vscode/main/media/ai-badger-vscode-deep-review.jpg)

Bring focused repository context into ChatGPT, Claude, Grok, or another AI chat, directly from VS Code.

Start with **Copy All Changes for Review** for a fast review of Git changes. Use **Deep Review** when you need repository-aware context. You can also review selected or workspace changes, or ask about focused code from the VS Code Explorer.

**Local-first · AI-provider independent · No automatic uploads**

[▶ Try the AI Badger VS Code Demo](https://pvrlabs.xyz/aibadger/vscode-demo.html)

[Read: Reviewing AI-Generated Code in VS Code with AI Badger](https://pvrlabs.xyz/articles/reviewing-ai-generated-code-vscode-aibadger.html)

## Why AI Badger?

- **Review-first workflow:** Review selected changes, all changes in a repository, or changes across the workspace.
- **Repository-aware review:** Deep Review uses the local Badger CLI to add focused topology and source context when needed.
- **Focused context:** Give your AI chat the relevant code and a clear question instead of the whole repository.
- **Local-first processing:** Review and context preparation happen in VS Code or through the CLI on your machine.

## How it works

- **Review changes:** From Source Control, [copy all changes](#copy-all-changes-for-review) for a direct review request or use [Deep Review](#deep-review) when repository-aware context is needed, then paste the request into your AI chat.
- **Copy files:** Select files in the Explorer, [copy them with project-relative paths](#copy-files-for-an-ai-chat), and paste them into your AI chat.
- **Ask about code:** Start from a project, folder, file, or selection and use the [guided smart-context workflow](#ask-about-your-code).

## Install

1. Install **AI Badger** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=pvrlabs.ai-badger).
2. Open a repository in desktop VS Code. Quick file copy works from the Explorer, and Ask About workflows can start from a project, folder, or file.
3. For the recommended review workflow, open the Source Control view for a Git repository with changes and choose **AI Badger: Copy All Changes for Review**. Use **AI Badger: Deep Review** when you need repository-aware context.
4. To use Deep Review or the exploratory Ask About workflows, install the AI Badger CLI:

   ```bash
   brew install pvrlabs/tap/badger
   ```

   For Windows and other installation methods, see the [AI Badger installation guide](https://github.com/PVRLabs/aibadger/blob/main/docs/install.md).

Direct repository and workspace review do not require the CLI. The extension is desktop-only; it is not a `vscode.dev` web extension.

## What you can do

Review workflows are the primary use case. Start in Source Control with **Copy All Changes for Review**. Use **Copy Selected Changes for Review** for a narrower scope or **Deep Review** when repository-aware context is needed; the detailed review flows are described below. The Explorer workflows remain useful when you already know which code to share or want to ask a broader question.

### Copy files for an AI chat

Use these commands when you already know which files should be included. AI
Badger formats the selected files with their project-relative paths and copies
them immediately. Nothing is shared until you paste it.

| Icon | Explorer action | Scope |
| --- | --- | --- |
| <img src="media/copy-readme.png" alt="Direct copy" width="16" height="16"> | **AI Badger: Copy File for AI** | One selected file. |
| <img src="media/copy-readme.png" alt="Direct copy" width="16" height="16"> | **AI Badger: Copy Selected Files for AI** | Multiple selected files. |

### Ask about your code

Use these commands to start the smart-context workflow for a specific scope. These commands require the local Badger CLI.

* **AI Badger: Ask About Project** — Start with the entire open project as the available scope.
* **AI Badger: Ask About Folder** — Focus the workflow on the selected folder and its contents.
* **AI Badger: Ask About File…** — Ask a question about one selected file, with relevant repository context available when needed.
* **AI Badger: Ask About Selected Files…** — Start from multiple files selected in the Explorer.

The project command is available from the Explorer toolbar. File and folder commands are available from Explorer and editor context menus where applicable. You can also find most commands in the Command Palette.

### Copy selected changes for review

In a Git repository, select one or more changed files in Source Control, right-click, and choose **AI Badger: Copy Selected Changes for Review**. The extension copies a review request containing the selected files' complete Git diff. Small, readable modified, renamed, and non-sensitive untracked text files may also be included in full. Tracked additions and deleted files remain represented by Git's diff; binary contents are excluded; unavailable, changed, or oversized files are reported without full content; and sensitive untracked paths are omitted. Git's staged, unstaged, mixed, deleted, renamed, and untracked changes are represented by the selected diff, and unrelated files are not included.

Each direct review request places `[REPOSITORY: <label>]` after the task
framing and immediately before the repository review context. The label is
the sanitized local repository directory basename only; it is bounded to 128
UTF-8 bytes, kept on one line, and uses `repository` for an empty or root-like
basename. It is display metadata, not a repository identity. The marker, all
framing, and the diff count toward the 512 KiB request limit; optional full-file
context remains limited to 64 KiB per file. Binary file contents and Git
binary patch bodies are excluded; the selected diff retains Git's compact
binary-change summary. For added, untracked, modified, and renamed binaries
that still exist, `[ADDITIONAL CONTEXT]` records the path, change kind, and
inferred type. Deleted binaries rely on Git's deletion summary. If the
mandatory framing and diff exceed 512 KiB, select fewer files. Nothing is
shared until you paste the clipboard contents into an AI chat.

### Copy all changes for review

From a Git repository in the Source Control view, choose **AI Badger: Copy All Changes for Review**. The action copies one self-contained review request for that repository's current staged, unstaged, untracked, renamed, and deleted changes. It does not require the Badger CLI and never includes changes from another repository.

![Quick Review workflow: copy Git changes and paste them into an AI chat](media/badger-review-flow.webp)

For a multi-repository workspace, choose **AI Badger: Copy Workspace Changes
for Review** from the Command Palette or the aggregate **Changes** title. It
copies one request with an outer review task and a `[REPOSITORY: <label>]`
section for every open Git repository that currently has changes. Labels use
only local repository directory basenames; duplicate basenames may produce
identical labels. The operation has no picker and is atomic: if any included
repository cannot be prepared or the complete request does not fit, the
clipboard is left unchanged.

These Git Source Control actions are available from the repository actions and
the **Changes** group. Both require an explicit user action; nothing is sent
anywhere automatically.

| Icon | Source Control action | Current behavior |
| --- | --- | --- |
| <img src="media/copy-readme.png" alt="Direct copy" width="16" height="16"> | **AI Badger: Copy All Changes for Review** | Copies the repository review request to the clipboard. |
| <img src="media/copy-readme.png" alt="Direct copy" width="16" height="16"> | **AI Badger: Copy Workspace Changes for Review** | Copies all changed open Git repositories as one marked, repository-scoped request. |

Direct repository and workspace review use 512 KiB complete-request
limits and 64 KiB per-file limits for optional complete text context. Workspace
review counts section markers and separators in that limit, divides the
optional-context capacity equally among its repository sections, and reports
omitted file context within each section. These flows preserve the authoritative
diff and omit binary contents while retaining compact Git change summaries. A
clean repository or workspace has no changes to copy. Workspace review is
implemented entirely by the extension and does not invoke Badger. Nothing is
shared until you explicitly copy and paste the generated request into an AI chat.

### Deep Review

![Deep Review workflow: generate a repository-aware review and provide requested context](media/badger-deep-review-flow.webp)

**AI Badger: Deep Review** opens editable guidance and, after Copy, asks the
local Badger CLI for a topology-aware review request. Deep Review uses a 512 KiB
complete-request limit and a 64 KiB per-file limit for optional complete text
context. These Badger-owned limits may be explicitly overridden by a caller;
successful marked CLI output is copied verbatim and is not double-framed by the
extension. The flow preserves the authoritative diff and omits binary contents
while retaining compact Git change summaries.

Badger CLI v0.4.0 is the first released version supporting the separate Deep
Review operations `api review-context --include-topology` and
`api review-continuation`; compatibility remains capability-based, and missing
or incompatible executables use the normal recovery flow without a
topology-free fallback. Nothing is shared until you explicitly copy and paste
the generated request into an AI chat.

Deep Review may receive final findings immediately. If the AI instead responds with only valid `FILE:`, `PREFIX:`, or `NEAR:` selectors, choose **Continue Review** to copy current supplemental context from the same repository. Findings-only responses finish locally; mixed or malformed responses remain editable. Supplemental context is stateless and may reflect newer filesystem state than the initial review request.

After a successful local Badger operation, the reusable assisted-flow header shows the detected Badger version. The indicator is best-effort and never appears before Badger has successfully run.

## Privacy

- Direct file copying reads only the selected files and writes the formatted context to your local clipboard.
- Direct repository and workspace review run locally in the extension, inspect only the explicitly targeted open Git repositories, and write one completed request to the clipboard only after every repository succeeds.
- Smart context invokes the local AI Badger CLI and does not upload your repository to PVR Labs.
- It does not bundle or host an AI model, and it does not require an AI-provider API key.
- You control what generated context is copied and pasted into ChatGPT, Claude, Grok, or another external AI service.

Smart context sends selected paths and workflow input to the local CLI. If you deliberately paste generated context into an external AI service, that service receives what you pasted under its own terms.

## Configuration and troubleshooting

- Verify the CLI with `badger --version`.
- If you installed the CLI while VS Code was open, restart VS Code so it can see the updated `PATH`.
- Set `aiBadger.executablePath` to the full path of `badger` when it is not on the expected `PATH`.
- If an operation is reported as incompatible, upgrade the AI Badger CLI.

See the [CLI compatibility guide](https://github.com/PVRLabs/aibadger-vscode/blob/main/docs/cli-compatibility.md) for capability requirements and executable resolution details.

## Support

Report Explorer, command, setup, webview, or VS Code integration issues in the [extension repository](https://github.com/PVRLabs/aibadger-vscode/issues). Report CLI or generated-context issues in the [main AI Badger repository](https://github.com/PVRLabs/aibadger/issues).

## Development

```bash
npm ci
npm run verify
```

See the [release guide](https://github.com/PVRLabs/aibadger-vscode/blob/main/docs/releasing.md) for packaging and publishing details.

AI Badger for VS Code is published by [PVR Labs](https://github.com/PVRLabs).
