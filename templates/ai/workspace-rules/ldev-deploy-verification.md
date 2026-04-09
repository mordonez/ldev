---

description: Deploy and verification guidance for Workspace-based projects using `ldev`
globs: modules/**,themes/**,client-extensions/**
alwaysApply: false

---

# `ldev` Deploy Verification

When a change affects deployable code or assets:

1. confirm the runtime is healthy with `ldev status --json`
2. deploy with `ldev deploy all --format json` or the narrowest suitable deploy command
3. verify with `ldev logs diagnose --since 5m --json`
4. use `ldev portal inventory ... --json` when the change affects page behavior or content rendering

For the full deploy and verification workflow, route to:

- `deploying-liferay`

Use Blade as the underlying Workspace tool when needed, but prefer `ldev` as
the high-level command surface when it already supports the workflow.
