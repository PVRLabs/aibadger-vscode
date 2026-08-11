# AIBadger VS Code Agent Guidance

This repository implements the AI Badger VS Code extension. Read `README.md`
and `package.json` only when current product behavior or scripts are needed.

## Scope and context

A `.badger-context` file may identify related read-only context directories.
Do not search them proactively. Consult only specific files needed when the
user, task, or repository points there, or when this repository lacks required
information. Never include private context contents in public source or docs.

Use `repo-map` to locate related repositories when work requires CLI or private
specification context; the context restrictions above still apply.

Keep extension behavior and webview contracts synchronized. Add focused tests
for changed behavior and avoid unrelated package, build, or dependency edits.

## Verification

Use pinned dependencies from `package-lock.json`.

```bash
npm-lite run verify       # compile, lint, and unit tests
npm-lite run test:unit    # compile and unit tests
```

Run `npm test` only when VS Code integration testing is specifically needed;
it launches the integration-test host. Use direct npm for scripts not covered
by `npm-lite`, such as packaging a VSIX.

Keep generated `out/` and other build artifacts out of commits unless tracked
by the repository.
