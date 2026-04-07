# ldev.oauth2.app

Internal source bundle for `ldev oauth install`.

This module is no longer scaffolded into user projects and no longer provisions
OAuth2 applications automatically at portal startup. Instead, `ldev` ships the
compiled `.jar`, deploys it on demand into a running environment, and invokes
its Gogo command:

```bash
ldev:oauthInstall
ldev:oauthInstall <companyId>
ldev:oauthInstall <companyId> <userId>
```

The command creates or updates the read/write and read-only OAuth2 apps used by
`ldev`, then prints the resulting credentials so the CLI can persist them into
`docker/.env`.

## Scope aliases

The source of truth for the default OAuth2 scopes used by `ldev oauth install`
is:

- [src/features/oauth/oauth-scope-aliases.ts](../../src/features/oauth/oauth-scope-aliases.ts)

That file defines the effective default scope list used by the CLI and by the
OSGi-config install path used in workspaces.

When adding or removing a scope:

1. Update `DEFAULT_OAUTH_SCOPE_ALIASES` in `src/features/oauth/oauth-scope-aliases.ts`.
2. Keep the Java default in sync in `src/main/java/dev/mordonez/ldev/oauth2/app/configuration/LdevOAuth2AppConfiguration.java`.
3. Keep the metatype default in sync in `src/main/resources/OSGI-INF/metatype/dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration.xml`.
4. Rebuild the bundle and run tests.

Why there are still 3 places:

- TypeScript is the source of truth for the `ldev` CLI.
- Java needs the same defaults for the Gogo command path.
- The metatype XML shipped in the bundle must describe the same defaults for OSGi.

The intent is simple:

- change scopes in one logical place first: `src/features/oauth/oauth-scope-aliases.ts`
- then mirror that list into the Java and metatype defaults before rebuilding

If these three copies drift, reinstalls may behave differently depending on
whether the project uses the Gogo path or the OSGi-config path.

## Rebuilding the shipped bundle

Preferred build from this directory:

```bash
./gradlew clean test jar stageReleaseBundle
```

Equivalent build from the repository root:

```bash
npm run build:oauth-bundle
```

That build path:

- uses the local Gradle wrapper in `templates/modules/`
- runs `clean`, `jar`, `stageReleaseBundle`, and `test`
- regenerates `templates/bundles/dev.mordonez.ldev.oauth2.app-1.0.0.jar`

After rebuilding, `ldev oauth install` will deploy the regenerated bundle from:

- `templates/bundles/dev.mordonez.ldev.oauth2.app-1.0.0.jar`

## Runtime behavior

`ldev oauth install` supports both kinds of project:

- Liferay/AI Workspace: `ldev` deploys the bundle and writes an OSGi `.config`
  with explicit `scopeAliases`, so reinstalls update existing apps as well.
- Native/other runtime path: `ldev` deploys the bundle and invokes
  `ldev:oauthInstall`, which uses the Java defaults above.

The generated bundle is expected to include:

- an OSGi manifest
- DS component XML under `OSGI-INF/`
- metatype XML under `OSGI-INF/metatype/`

## Rebuildability boundary

The bundle is **rebuildable** from source, not **byte-for-byte reproducible**. Gradle and most JDK versions embed timestamps and build metadata in the JAR, so the output will differ across machines and toolchains even with identical source. The `tests/unit/oauth-bundle-artifact.test.ts` test verifies structural invariants (OSGi headers, DS/metatype file presence, bundle version) — it does not assert checksum identity.
