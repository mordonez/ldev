# Site Resolution Reference

## Listing All Accessible Sites

```bash
ldev portal inventory sites --json
```

Returns an array of site objects. Key fields:

```json
[
  {
    "siteId": 20121,
    "siteFriendlyUrl": "/global",
    "siteName": "Global",
    "memberSiteId": 20121
  },
  {
    "siteId": 20450,
    "siteFriendlyUrl": "/estudis",
    "siteName": "Estudis"
  }
]
```

Use `siteFriendlyUrl` as the `--site` argument for all scoped commands.

## Global vs. Site-Scoped Resources

- Structures and templates created in Global scope are inherited by all sites.
- Always check Global when a resource is not found in the target site.
- `ldev portal inventory structures --with-templates --all-sites --json` covers both.

## Site ID vs. Friendly URL

Most `ldev` commands accept either `--site /estudis` (friendly URL) or `--site 20450` (numeric ID).
Prefer friendly URLs: they are stable across portal restores; numeric IDs are not.

## Resolving a Site From a Page URL

If the task gives you a page URL like `http://localhost:8080/estudis/about`, extract the friendly URL path (`/estudis`) and verify it via site inventory before using it as `--site`.

## Common Pitfalls on Windows

On Windows PowerShell, shell path conversion can corrupt site paths:
```
# WRONG — PowerShell may rewrite /estudis as C:/Program Files/Git/estudis
ldev portal inventory structures --site /estudis

# CORRECT — use array syntax in PowerShell
& ldev @('portal', 'inventory', 'structures', '--site', '/estudis', '--json')
```

On Windows Git Bash, set `MSYS_NO_PATHCONV=1` before the command:
```bash
MSYS_NO_PATHCONV=1 ldev portal inventory structures --site /estudis --json
```
