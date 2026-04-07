---
title: OAuth2 Scopes
description: Reference of the default OAuth2 scopes used by ldev. Learn how to extend scope profiles for custom portal discovery tasks.
---

# OAuth2 Scopes

`ldev oauth install --write-env` creates the OAuth2 app that `ldev` uses for portal APIs.

---

## Default Scopes

By default, `ldev` installs the minimum scope set needed for:

- `ldev portal check` ✓
- `ldev portal inventory ...` ✓
- `ldev resource ...` ✓
- `ldev mcp check` ✓
- MCP OpenAPI discovery ✓

**Does NOT include**: broader admin scopes unless you need them.

The default scope set is intentionally small so you only grant what `ldev` actually uses.

---

## Optional Scope Profiles

Add scopes only when you need them:

### Content Authoring

```bash
ldev oauth install --scope-profile content-authoring --write-env
```

Use when agents/scripts need direct access to content-management APIs beyond `ldev resource` workflows.

Grants: `Liferay.Headless.Admin.Content.*`

### Site Admin

```bash
ldev oauth install --scope-profile site-admin --write-env
```

Use when you need broad site administration permissions.

Grants: Site admin scopes + content management

### Objects

```bash
ldev oauth install --scope-profile objects --write-env
```

Use when working with Liferay Objects.

Grants: Object-related scopes

### Max (Testing)

```bash
ldev oauth install --scope-profile max-test --write-env
```

Grants all scopes. Use only for exploration/testing, not production.

---

## When to Add Scopes

You need more scopes when:

1. `ldev` commands fail with `403 Forbidden`
2. MCP calls fail with insufficient permissions
3. You're calling APIs directly that `ldev` doesn't wrap

**Recommendation**: Start with default. Add profiles only when you get auth errors.

---

## Checking Current Scopes

The scopes granted to your OAuth2 app are visible in:

1. Liferay Portal → OAuth2 Applications → ldev app → Scopes
2. Your `.liferay-cli.local.yml` file (doesn't list them, but shows you have them configured)

---

## See Also

- [Commands — oauth install](/commands#oauth-authentication)
- [Configuration](/configuration)
- [MCP Strategy](/mcp-strategy)
