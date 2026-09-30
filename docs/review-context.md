# Review context details

These details describe the existing clipboard review format and limits. For
workflow instructions, see the [extension README](https://github.com/PVRLabs/aibadger-vscode#what-you-can-do).

## Selected changes

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

## Repository and workspace review

For a multi-repository workspace, choose **AI Badger: Copy Workspace Changes
for Review** from the Command Palette or the aggregate **Changes** title. It
copies one request with an outer review task and a `[REPOSITORY: <label>]`
section for every open Git repository that currently has changes. Labels use
only local repository directory basenames; duplicate basenames may produce
identical labels. The operation has no picker and is atomic: if any included
repository cannot be prepared or the complete request does not fit, the
clipboard is left unchanged.

Direct repository and workspace review use 512 KiB complete-request
limits and 64 KiB per-file limits for optional complete text context. Workspace
review counts section markers and separators in that limit, divides the
optional-context capacity equally among its repository sections, and reports
omitted file context within each section. These flows preserve the authoritative
diff and omit binary contents while retaining compact Git change summaries. A
clean repository or workspace has no changes to copy. Workspace review is
implemented entirely by the extension and does not invoke Badger. Nothing is
shared until you explicitly copy and paste the generated request into an AI chat.

## Deep Review compatibility

Deep Review uses a 512 KiB
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

See the [CLI compatibility guide](cli-compatibility.md) for API capabilities,
executable resolution, and recovery behavior.
