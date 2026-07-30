# AI Badger for VS Code

AI Badger is the official VS Code companion for the separately installed
[AI Badger CLI](https://github.com/PVRLabs/aibadger). It helps you select
relevant project context, generate a focused prompt locally, and continue in
the AI chat tool of your choice.

Install the CLI first using the [AI Badger installation guide](https://github.com/PVRLabs/aibadger/blob/main/docs/install.md), then install this extension from a VSIX or the Visual Studio Marketplace when it is published.

## Two-step workflow

1. Install `badger` and make it available on `PATH`, or configure its full executable path in VS Code settings.
2. Open a project, choose an AI Badger command from the Explorer or Command Palette, answer the workflow prompts, and paste the generated context into ChatGPT, Claude, or another AI chat.

The extension runs the local CLI and does not download, install, or host an AI model.

## Commands

- `AI Badger: Ask About Project`
- `AI Badger: Ask About Folder`
- `AI Badger: Ask About File…`
- `AI Badger: Ask About Selected Files…`
- `AI Badger: Copy Selected File…`
- `AI Badger: Copy Selected Files…`

Most commands are also available from Explorer and editor context menus.

## Settings and compatibility

`aiBadger.executablePath` optionally selects the local Badger executable. Leave it empty to use `badger` on `PATH`. The `AIBADGER_EXECUTABLE` environment variable can override this setting for local development and tests.

The extension requires the non-interactive `badger api prompt` and `badger api extract` operations described in the [CLI compatibility contract](docs/cli-compatibility.md). Missing or incompatible operations result in an actionable setup or upgrade message.

## Privacy and troubleshooting

AI Badger runs locally. This extension sends selected project paths and workflow input to the local CLI process; it does not transmit project content to a service, download dependencies at runtime, or install an AI provider. The generated prompt is copied or shown for you to paste into the AI service you choose.

If a command cannot find Badger, run `badger --version`, confirm that VS Code can see the same `PATH`, or set `aiBadger.executablePath` to the executable's full path. If an API operation is unavailable, upgrade the [AI Badger CLI](https://github.com/PVRLabs/aibadger) or select a compatible executable.

Report extension commands, setup detection, webview, and VS Code integration issues at [aibadger-vscode issues](https://github.com/PVRLabs/aibadger-vscode/issues). Report CLI/API, topology, file-selection, and generated-context issues at [aibadger issues](https://github.com/PVRLabs/aibadger/issues).

If AI Badger is useful, consider [starring the main AI Badger repository](https://github.com/PVRLabs/aibadger) to help others find it.

## Development

Requirements: Node.js, npm, and a supported desktop VS Code installation. The extension invokes a local executable and is not a web extension for `vscode.dev`.

```bash
npm ci
npm run verify
```

Use `npm run test` for extension-host tests when VS Code test-host execution is available. Use `npm run package:contents` to inspect VSIX files and `npm run package:vsix` to create one. See [docs/releasing.md](docs/releasing.md) for the manual release process.
