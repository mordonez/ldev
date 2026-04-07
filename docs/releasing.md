# Releasing

This project is prepared to make packaging and release validation boring for public npm releases.

## Release Strategy

Current release outputs:

- public npm package `@mordonezdev/ldev`
- npm package tarball from `npm pack`, for example `mordonezdev-ldev-0.1.0.tgz`
- SHA-256 checksums file, for example `mordonezdev-ldev-0.1.0-checksums.txt`
- GitHub Release assets for tagged releases

## Normal Flow

1. Merge changes into `main`
2. Let Release Please open or update the release PR
3. Merge the release PR when the release notes and version look correct
4. Run the manual release workflow as a dry run if you want final confidence before publishing
5. Publish the GitHub Release
6. Publish to npm when the release is approved

## CI Guarantees

CI already checks:

- `npm run check`
- a dedicated runtime-smoke workflow that exercises a real Docker-based path on Linux
- real `npm pack` success
- package size guardrail
- generated checksum artifact upload

The release workflow re-runs validation, builds the package tarball again, generates checksums again, and then:

- uploads workflow artifacts on manual dry runs
- attaches the tarball and checksums to GitHub Releases on real releases
- publishes to npm only when explicitly enabled

## Manual Dry Run

Use the `Release packaging` workflow from GitHub Actions:

- leave `publish_to_npm` as `false`
- confirm the workflow uploads a `.tgz` and matching checksum file
- confirm the package contents and checksum look correct

This is the safe way to validate the full release path without making the package public.

## npm Publish Gate

Release-triggered npm publish is gated behind the repository variable:

```text
NPM_PUBLISH_ENABLED=true
```

Without that variable, a GitHub Release still gets the packaged tarball and checksums, but npm publish is skipped.

Manual workflow dispatch can also publish if `publish_to_npm=true`, but that should only be used once the final public-release decision is made.

## Public npm Release Checklist

Use this checklist for a release that updates the public npm package.

Recommended execution model:

- use a **dedicated release PR** for release-only changes
- do not hide release decisions inside unrelated feature work

### Preconditions

- `main` is green
- the runtime-smoke workflow is green
- `npm pack` is green in CI
- install docs match the real package name
- rollback docs still work for the current package name
- support docs, security policy, and issue forms are already in place
- the support matrix and product compatibility docs still reflect reality
- the release notes are ready for public users, not only internal maintainers

### Dedicated release PR contents

The dedicated PR should contain only the changes needed for the release decision.

That usually means:

- package metadata updates in `package.json`
- user-facing docs that must match the published package
- release notes or maintainer notes if needed

Do **not** mix that PR with unrelated feature work.

### Manual preflight before merging the release PR

1. run `npm run check`
2. run `npm pack`
3. confirm the tarball contents are correct
4. confirm the package name in docs, README, and install examples is exact
5. confirm `ldev --version` reports the release version from the built artifact
6. confirm `npx @mordonezdev/ldev@<version> --help` is the intended public invocation

### Publication step

After the dedicated PR is merged:

1. confirm `NPM_PUBLISH_ENABLED=true` is set only when you are ready
2. publish the GitHub Release or run the manual release workflow with explicit sign-off
3. verify the package is visible on npm
4. verify `npm install -g @mordonezdev/ldev` works from a clean machine or clean environment
5. verify `npx @mordonezdev/ldev --version` resolves to the published version

### Immediate post-publication checks

- npm package page is reachable
- install docs are still truthful
- GitHub Release contains the tarball and checksums
- rollback commands still point to the right package name
- there is no mismatch between published version and release notes

### If the first public release goes badly

1. stop recommending `latest`
2. reinstall the previous known-good version if one exists
3. keep the package name/docs truthful while investigating
4. cut a follow-up patch release instead of relying on npm unpublish

For normal CLI rollback guidance after publication, see [Upgrading](/upgrading).

## Rollback And Previous Versions

Install a specific published version:

```bash
npm install -g @mordonez/ldev@0.1.0
```

Run a specific version without global install:

```bash
npx @mordonez/ldev@0.1.0 --help
```

If a release is bad:

1. stop recommending `latest`
2. reinstall the previous known-good version
3. cut a follow-up patch release

Avoid relying on npm unpublish for normal rollback.

For day-to-day user guidance on upgrading the CLI and refreshing scaffolded repo files, see [Upgrading](/upgrading).

## Normal Release Checklist

- `main` is green
- the Release Please PR has the correct version and release notes
- `Release packaging` dry run succeeds
- the tarball contents are correct
- checksums are generated
- install/rollback docs still match the current package name
- only after sign-off: enable npm publish and publish the release

See also: [Contributing](/contributing) · [Architecture](/architecture)
