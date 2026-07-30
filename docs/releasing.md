# Releasing AI Badger for VS Code

This repository follows the AI Badger release process in [`aibadger/docs/releasing.md`](https://github.com/PVRLabs/aibadger/blob/main/docs/releasing.md), adapted for a VS Code extension. Releases use exact SemVer versions such as `0.1.0`; release tags use the matching `v0.1.0` form.

## Before releasing

1. Set the exact release version in `package.json`.
2. Add user-facing notes under the matching version in `CHANGELOG.md`.
3. Run `npm ci` and `npm run verify`.
4. Inspect the package list and candidate archive:

   ```bash
   npm run package:contents
   npm run package:vsix
   unzip -l ai-badger-*.vsix
   unzip -p ai-badger-*.vsix extension/package.json
   ```

Confirm that the VSIX contains compiled runtime files and required media, but not tests, fixtures, source maps, caches, credentials, private documents, or local paths. Confirm the packaged manifest's version, publisher, links, icon, and MIT license.

## Release steps

Set the version once:

```bash
RELEASE_VERSION=vX.Y.Z
```

1. Commit the version and changelog changes.
2. Create and push the matching tag with `git tag "${RELEASE_VERSION}"` and `git push origin "${RELEASE_VERSION}"`.
3. Publish the GitHub Release for that tag with the changelog notes and inspected `.vsix` attached.
4. Separately decide whether to publish the same version to the Visual Studio Marketplace. Marketplace publication is manual and requires the authorized `pvrlabs` publisher credentials; CI does not publish it.
5. After publication, verify the GitHub Release, VSIX asset, Marketplace listing, version, links, icon, install instructions, and activation from a clean environment.
6. Prepare the next development version on `main`, following the main AI Badger repository's versioning practice.

Do not commit publishing credentials or add automated Marketplace publishing without a separate release-process decision.
