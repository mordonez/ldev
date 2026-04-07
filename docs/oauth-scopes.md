---
title: OAuth2 Scopes
---

# OAuth2 Scopes

`ldev oauth install --write-env` creates the OAuth2 application that `ldev`
uses for portal APIs and for the MCP integration path.

This page defines the product stance for that app:

- install the smallest default scope set that makes `ldev` work reliably
- keep MCP OpenAPI discovery working out of the box
- do not grant broader admin scopes unless `ldev` or the user actually needs them

## What the default app is for

The default `ldev` OAuth2 app is meant to support:

- `ldev portal check`
- `ldev portal inventory ...`
- `ldev resource ...`
- `ldev mcp check`
- `ldev mcp probe`
- `ldev mcp openapis`

It is not intended to pre-authorize every possible Liferay API family.

## Source of truth

The source of truth for the default scope list is:

- [src/features/oauth/oauth-scope-aliases.ts](https://github.com/mordonez/ldev/blob/main/src/features/oauth/oauth-scope-aliases.ts)

That list is then mirrored into:

- `templates/modules/src/main/java/dev/mordonez/ldev/oauth2/app/configuration/LdevOAuth2AppConfiguration.java`
- `templates/modules/src/main/resources/OSGI-INF/metatype/dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration.xml`

See also:

- [templates/modules/README.md](https://github.com/mordonez/ldev/blob/main/templates/modules/README.md)

For exact alias names in a specific portal build, the final source of truth is
the OAuth2 scope picker in the portal UI.

Use the codebase as the source of truth for what `ldev` requests by default.
Use the portal UI as the source of truth for the exact alias string that the
target runtime actually grants.

## Default scope profile: base

This is the scope set installed by default because it is the minimum needed
for `ldev` core workflows plus MCP OpenAPI discovery.

| Scope alias | Why it is in the default set |
| --- | --- |
| `Liferay.Headless.Admin.User.everything.read` | Needed for site resolution fallbacks such as company groups that are not fully exposed by `headless-admin-site`. |
| `Liferay.Headless.Admin.Site.everything.read` | Needed for `portal check`, `portal inventory sites`, and general site discovery. |
| `Liferay.Data.Engine.REST.everything.read` | Needed to inspect Journal structures and related Data Engine definitions. |
| `Liferay.Data.Engine.REST.everything.write` | Needed for `resource` workflows that create or update structures. |
| `Liferay.Headless.Delivery.everything.read` | Needed for page inspection, templates, structured content reads, and general delivery-side inventory. |
| `Liferay.Headless.Delivery.everything.write` | Needed for `resource` workflows that update structured content. |
| `liferay-json-web-services.everything.read` | Still needed because several `ldev` workflows use JSONWS endpoints that do not have equivalent task-shaped replacements yet. |
| `liferay-json-web-services.everything.write` | Still needed for JSONWS-backed create/update flows such as ADTs, templates, and fragment imports. |
| `Liferay.Headless.Discovery.API.everything.read` | Needed so MCP can discover the available API families. |
| `Liferay.Headless.Discovery.OpenAPI.everything.read` | Needed so MCP can retrieve OpenAPI documents comfortably. |

## Why `Headless.Admin.Content.read` is not in the default set

`ldev` does not currently depend on `headless-admin-content` for its core
portal, resource, or MCP bootstrap workflows.

That scope may still be useful for teams that want to call admin-content APIs
directly through MCP or their own scripts, but it is not required for the
default `ldev` contract today.

## Optional scope profiles

These are not installed by default. Add them only when the project really needs
them.

Built-in profile names for `ldev oauth install --scope-profile`:

- `content-authoring`
- `site-admin`
- `objects`
- `max-test`

### Content authoring

Use when agents or scripts need to operate directly on content-management APIs
beyond the built-in `ldev resource` workflows.

Typical additions:

- `Liferay.Headless.Admin.Content.everything.read`
- `Liferay.Headless.Admin.Content.everything.write`

### Site admin

Use when agents or scripts need to create or mutate sites, site settings, or
site-adjacent admin resources directly through headless admin APIs.

Typical additions:

- `Liferay.Headless.Admin.Site.everything.write`
- `Liferay.Headless.Admin.User.everything.write`

### Objects / admin avanzado

Use when the project needs MCP or custom automation against Object APIs.

This is intentionally not part of the default `ldev` app because the current
core workflows do not depend on `object-admin` or `headless-object`.

Recommendation:

- add the matching Object Admin and Headless Object scopes for the specific API
  families you plan to call
- verify the exact aliases in the portal OAuth2 scope picker for your target
  runtime/version before baking them into shared defaults

This matters in practice. For example, the validated runtime granted:

- `Liferay.Object.Admin.REST.everything.read/write`

and did not grant the older inferred alias:

- `Liferay.Object.Admin.everything.read/write`

## Overriding the scope list

Most teams should keep the default installed profile.

If you need more scopes for a specific environment, override the requested scope
aliases with:

- `LIFERAY_CLI_OAUTH2_SCOPE_ALIASES`
- `.liferay-cli.local.yml`

Example:

```yaml
liferay:
  oauth2:
    scopeAliases: >
      Liferay.Headless.Admin.User.everything.read,
      Liferay.Headless.Admin.Site.everything.read,
      Liferay.Data.Engine.REST.everything.read,
      Liferay.Data.Engine.REST.everything.write,
      Liferay.Headless.Delivery.everything.read,
      Liferay.Headless.Delivery.everything.write,
      liferay-json-web-services.everything.read,
      liferay-json-web-services.everything.write,
      Liferay.Headless.Discovery.API.everything.read,
      Liferay.Headless.Discovery.OpenAPI.everything.read,
      Liferay.Headless.Admin.Content.everything.read
```

After changing scopes, run:

```bash
ldev oauth install --write-env
```

For one-off additions, you can also merge scopes directly during install:

```bash
ldev oauth install --scope Liferay.Headless.Admin.Content.everything.write --write-env
ldev oauth install --scope-profile objects --write-env
ldev oauth install --scope-profile content-authoring --scope-profile site-admin --write-env
ldev oauth install --scope Liferay.Object.Admin.REST.everything.write --scope Liferay.Headless.Object.everything.write --write-env
```

When `--scope` is combined with `--write-env`, `ldev` updates both:

- the installed OAuth2 application scopes
- `.liferay-cli.local.yml` so future `ldev` and MCP tokens request the same merged scope set

## Product rule

The default `ldev` OAuth2 app should remain:

- small
- predictable
- sufficient for `ldev` core commands
- sufficient for MCP discovery
- not a grab-bag of every admin scope in the portal

The `max-test` profile grants broad access for exploration and testing when you need full admin scope coverage.

See also: [Commands — oauth install](/commands#ldev-oauth-install) · [Configuration](/configuration) · [MCP Strategy](/mcp-strategy)
