# AI Badger for VS Code

![AI Badger](media/ai-badger-logo.jpg)

Generate focused, token-efficient repository context for ChatGPT, Claude, Grok, and other AI chats—directly from the VS Code Explorer.

Select the project, folder, or files that matter, describe what you need, and get context that is easier for an AI chat to use than a dump of the entire repository.

**Local-first · AI-provider independent · No repository uploads**

This extension uses the separately installed, open-source [AI Badger CLI](https://github.com/PVRLabs/aibadger) as its local engine. It does not require an AI-provider API key.

[▶ Try the AI Badger Interactive Demo](https://pvrlabs.xyz/aibadger/demo.html)

<!-- TODO: Replace this interactive demo link with a VS Code-specific GIF showing the Explorer workflow when one is available. -->

## Why AI Badger?

- **Explorer-native workflow:** Start from the project, folder, file, or multi-file selection already in VS Code.
- **Focused context:** Give your AI chat the relevant code and a clear question instead of the whole repository.
- **Local-first processing:** The extension invokes the local CLI on your machine.
- **Works with your AI chat:** Use the generated context with ChatGPT, Claude, Grok, or another AI chat.
- **No provider key in the extension:** You choose where to paste the generated context.

## How it works

1. Select a project, folder, file, or multiple files in the VS Code Explorer.
2. Describe the task you want help with.
3. Copy or continue with the generated focused context in the AI chat you choose.

## Install

1. Install the AI Badger CLI:

   ```bash
   brew install pvrlabs/tap/badger
   ```

   For Windows and other installation methods, see the [AI Badger installation guide](https://github.com/PVRLabs/aibadger/blob/main/docs/install.md).

2. Install **AI Badger** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=pvrlabs.ai-badger).
3. Open a repository in desktop VS Code, then use an AI Badger command from the Explorer context menu or Command Palette.

The extension is desktop-only; it is not a `vscode.dev` web extension.

## What you can do

### Ask about your code

Use these commands to start an AI Badger workflow for a specific scope. The extension collects the relevant repository context and guides you through preparing a focused prompt for your AI chat.

* **AI Badger: Ask About Project** — Start with the entire open project as the available scope.
* **AI Badger: Ask About Folder** — Focus the workflow on the selected folder and its contents.
* **AI Badger: Ask About File…** — Ask a question about one selected file, with relevant repository context available when needed.
* **AI Badger: Ask About Selected Files…** — Start from multiple files selected in the Explorer.

### Copy files with a question

Use these commands when you already know which files should be included. AI Badger formats the selected files together with your question and copies the result for use in an AI chat.

* **AI Badger: Copy Selected File…** — Copy one file together with your question.
* **AI Badger: Copy Selected Files…** — Copy multiple selected files together with your question.

The project command is available from the Explorer toolbar. File and folder commands are available from Explorer and editor context menus where applicable. You can also find most commands in the Command Palette.

## Privacy

- The extension invokes the local AI Badger CLI and does not upload your repository to PVR Labs.
- It does not bundle or host an AI model, and it does not require an AI-provider API key.
- You control what generated context is copied and pasted into ChatGPT, Claude, Grok, or another external AI service.

The extension sends selected paths and workflow input to the local CLI. If you deliberately paste generated context into an external AI service, that service receives what you pasted under its own terms.

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
