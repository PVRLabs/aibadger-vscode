# Changelog

All notable changes to the AI Badger VS Code extension are documented here.

## [Unreleased]

## [0.1.2] - 2026-08-27

- Added documented Quick Review and Deep Review workflow walkthroughs with
  updated review-first product guidance.

## [0.1.1] - 2026-08-26

- Added basename-derived `[REPOSITORY: <label>]` markers to direct and
  workspace review payloads while preserving Deep Review's verbatim Badger
  output.
- Improved direct review handling for untracked changes by including eligible
  working-tree content while excluding sensitive paths without reading them.
- Expanded direct and workspace review limits to 512 KiB per request and 64 KiB
  per optional file.
- Added copied payload sizes to file-copy, direct-review, and Deep Review
  success notifications.

## [0.1.0] - 2026-08-14

- Refreshed the extension's review-first Marketplace description and product
  branding for the `0.1.0` release.
- Added theme-aware light and dark icons for Copy, Two-Step Copy, repository
  review, workspace review, and Deep Review actions.
- Updated the Ask and Deep Review panels to use the transparent AI Badger logo
  and label the detected local executable version as **Badger CLI**.

## [0.0.4] - 2026-08-11

- Added **AI Badger: Copy Workspace Changes for Review** to the Command Palette and aggregate Source Control **Changes** title. It atomically copies every changed open Git repository in one repository-qualified, CLI-free request, with deterministic duplicate-name labels and fair optional-context budgeting.
- Added functional repository-level **AI Badger: Deep Review**. It reuses the Ask-branded guidance panel, requests a topology-aware review prompt from a compatible local Badger CLI only after explicit Copy, and supports optional selector-only continuation.
- Deep Review requires capabilities first released in Badger `v0.4.0`; compatibility remains capability-based rather than enforced by a hard runtime version gate.
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
