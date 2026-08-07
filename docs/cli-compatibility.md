# AI Badger CLI compatibility

The extension is a desktop integration for a separately installed AI Badger
CLI. It does not download or bundle the CLI.

Compatibility is capability-based rather than tied to a CLI version number.
The selected `badger` executable must support these non-interactive commands:

```text
badger api prompt --root <project> --focus <code|design> --input <goal-file>
badger api extract --root <project> [--focus <code|design>] --input <selector-file> --goal-file <goal-file>
badger api review-context --root <repository> --include-topology [--input <guidance-file>]
badger api review-continuation --root <repository> --input <selector-file>
```

All commands must return the complete AI-facing prompt or supplemental context
on standard output and
use a nonzero exit status with a short diagnostic on standard error when an
operation fails. The extension passes arguments without a shell and deletes
its temporary UTF-8 input files after each operation.

Deep Review uses `review-context --include-topology` for one Git repository.
Badger owns current Git inspection, topology/source-tree composition, review
limits, and prompt formatting. The extension copies successful stdout verbatim.
It does not fall back to topology-free output when the requested operation or
flag is unsupported; the normal executable recovery flow offers upgrade or
executable selection. Selector-only continuation uses `review-continuation`,
does not resend the initial prompt, and returns only supplemental current-file
context.

The extension first checks whether the configured executable can be started.
Actual compatibility is then checked by running the requested operation. A
missing executable offers installation instructions, executable selection, or
extension settings. A CLI that starts but does not recognize the required API
offers upgrade instructions or selection of another executable. Other command
failures remain visible as operation errors.

Deep Review failures—including no changes, invalid roots or refs, Git errors,
mandatory payload overflow, cancellation, and clipboard failures—leave the
clipboard unchanged and keep the guidance or response available for retry.
The extension never embeds review content in provider URLs, opens a provider
before a successful clipboard write, automatically pastes, persists a review
session, or calls a provider API. Selected-SCM Deep Review is not part of the
current UI; the shipped command is repository-level.

The CLI is resolved in this order:

1. An executable selected during the current extension session.
2. The `AIBADGER_EXECUTABLE` environment variable.
3. The `aiBadger.executablePath` VS Code setting.
4. `badger` on `PATH`.

See the public [AI Badger CLI documentation](https://github.com/PVRLabs/aibadger)
for installation and API details.
