# AI Badger CLI compatibility

The extension is a desktop integration for a separately installed AI Badger
CLI. It does not download or bundle the CLI.

Compatibility is capability-based rather than tied to a CLI version number.
The selected `badger` executable must support these non-interactive commands:

```text
badger api prompt --root <project> --focus <code|design> --input <goal-file>
badger api extract --root <project> [--focus <code|design>] --input <selector-file> --goal-file <goal-file>
```

Both commands must return the complete AI-facing prompt on standard output and
use a nonzero exit status with a short diagnostic on standard error when an
operation fails. The extension passes arguments without a shell and deletes
its temporary UTF-8 input files after each operation.

The extension first checks whether the configured executable can be started.
Actual compatibility is then checked by running the requested operation. A
missing executable offers installation instructions, executable selection, or
extension settings. A CLI that starts but does not recognize the required API
offers upgrade instructions or selection of another executable. Other command
failures remain visible as operation errors.

The CLI is resolved in this order:

1. An executable selected during the current extension session.
2. The `AIBADGER_EXECUTABLE` environment variable.
3. The `aiBadger.executablePath` VS Code setting.
4. `badger` on `PATH`.

See the public [AI Badger CLI documentation](https://github.com/PVRLabs/aibadger)
for installation and API details.
