# Portal Discovery Contract

Use full page inventory before code search, browser edits, or resource changes:

```bash
ldev portal inventory page --url <fullUrl> --full --json
ldev portal inventory sites --json
ldev portal inventory structures --with-templates --all-sites --json
ldev portal inventory templates --site /<site> --json
```

Use full output by default when the task depends on rendered Journal behavior.
It includes content fields, template candidates, and export-path clues.

Treat `templateExportPath`, `displayPageDefaultTemplate`, and
`displayPageDdmTemplates` as the source-of-truth render hints. Do not pick a
template from grep or file names when full inventory names a different one.

Inspect every reported URL before assuming it maps to the same site, page, or
resource ownership.
