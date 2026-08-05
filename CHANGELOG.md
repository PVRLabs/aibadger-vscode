# Changelog

All notable changes to the AI Badger VS Code extension are documented here.

## Unreleased

- Added repository-level Git Source Control actions: **AI Badger: Copy All Changes for Review** copies a CLI-free review request for one repository, while **AI Badger: Deep Review** is visible as a clearly marked placeholder pending Badger-side support.
- Added direct-review actions to repository controls and the Changes group, including single-repository fallback behavior when VS Code flattens repository rows. Actions remain Git-scoped, clipboard-first, privacy-aware, and subject to the 256 KiB total / 32 KiB per-file review limits.
- Added **AI Badger: Copy Selected Changes for Review** to Git Source Control file context menus. It copies a CLI-free, selected-file code-review request with the complete Git diff and policy-approved optional full-file context (256 KiB total, 32 KiB per file). Multi-file Source Control selections are included via the SCM rest-argument contract.
- Binary file contents and encoded Git binary patch bodies are excluded from review payloads. Existing selected binaries receive path, change-kind, and inferred-type metadata under `[ADDITIONAL CONTEXT]`; deleted binaries rely on Git's compact deletion summary.

## [0.0.3] - 2026-07-30

- Made direct file copying an immediate, CLI-free action with no follow-up question dialog.
- Promoted **Copy File for AI** and **Copy Selected Files for AI** in file context menus.
- Clarified the final handoff with **Requested code copied** messaging and removed the obsolete “Coming soon” badge.
- Added a product screenshot and documented the distinction between quick file copying and smart Badger context.

## [0.0.2] - 2026-07-29

- Revamped the Marketplace README with clearer benefits, installation steps, workflow guidance, and privacy information.

## [0.0.1] - 2026-07-29

- Initial release of the AI Badger VS Code companion.
