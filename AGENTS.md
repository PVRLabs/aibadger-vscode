# AIBadger VS Code Agent Guidance

## Project overview

This repository contains the AI Badger VS Code extension. The extension is a
TypeScript project with compiled extension code, webview assets, ESLint checks,
unit tests, and optional VS Code integration tests.

Read `README.md` and `package.json` for the current product behavior and npm
scripts.

## Agent-Friendly CLI Usage

Prefer low-noise tools when available on `PATH`.

- Use `npm-lite run verify` for the supported compile, lint, and unit-test
  verification workflow.
- Use `npm-lite run test:unit` for the supported compile and unit-test workflow.
- Use direct `npm` only for scripts not covered by `npm-lite`, such as
  `npm run package:vsix` or `npm test` for the VS Code integration-test host.
- If a command is excessively noisy, misleading, hard to parse, or otherwise
  agent-unfriendly, report it with `agent-complaint`.
- Do not run extra commands just to collect profiling data.
- Do not include secrets, source code, sensitive paths, or large output in
  complaints.
- Run `agent-complaint --help` for usage.

## Build and test

Use the repository's pinned dependencies from `package-lock.json`.

```bash
npm-lite run verify
npm-lite run test:unit
```

The integration-test workflow launches a VS Code test host and remains a
direct npm command:

```bash
npm test
```

Keep generated `out/` content and other build artifacts out of commits unless
the repository explicitly tracks them.

## Change guidance

- Keep extension behavior and webview contracts synchronized.
- Add or update focused tests for changed behavior.
- Preserve the existing TypeScript, ESLint, Mocha, and VS Code test setup.
- Avoid unrelated package, build, or dependency changes.
