# `ldev context --json` Field Reference

Do not maintain a hand-written field table in this skill. The installed CLI is
the source of truth.

Use:

```bash
ldev context --describe --json
ldev doctor --list-checks --json
```

Stable context fields for agent workflows:

- `project.type`, `project.root`, `project.branch`
- `liferay.product`, `liferay.version`, `liferay.edition`, `liferay.portalUrl`
- `liferay.auth.oauth2.clientId.status`
- `liferay.auth.oauth2.clientSecret.status`
- `paths.resources.*.{path,exists,count}`
- `inventory.modules.{count,sample}` and `inventory.themes.{count,sample}`
- `platform.tools.*`
- `commands.*.{supported,requires,missing}`

Stable doctor fields for agent workflows:

- `summary.{passed,warned,failed,skipped,durationMs}`
- `tools.*.{status,version}`
- `checks[].{id,status,scope,summary,remedy}`
- `readiness.*`
