---

description: Deploy and verification guidance for Workspace-based projects using `ldev`
globs: modules/**,themes/**,client-extensions/**
alwaysApply: false

---

# `ldev` Deploy Verification

When a change affects deployable code or assets:

1. confirm the runtime is healthy with `ldev status --json`
2. deploy with the narrowest suitable deploy command
3. verify runtime/deploy behavior with `ldev logs diagnose --since 5m --json`
4. use `ldev portal check --json` as a fast structured health/readiness snapshot after deploys
5. use `ldev portal inventory ... --json` when the change affects page behavior or content rendering

`ldev portal check --json` is a structured verdict, not a replacement for logs
or resource read-back. Use it to confirm the portal is reachable and then pair
it with `ldev logs diagnose --json` or resource/page verification for the
actual changed surface.

Use deploy commands only for deployable artifacts:

- `ldev deploy theme` only when a theme changed
- `ldev deploy module <module-name>` only when modules or deployable Gradle units changed
- a broad deploy only when a human explicitly asks for a full deploy and
  the change cannot be proved with a narrower deploy

Prefer atomic deploys. Do not use a broad deploy as a default validation step.

Do not use deploy commands for Journal templates, ADTs, fragments, or
structures. Those require a prepared runtime and `ldev resource import-*`, then
read-after-write verification with `ldev resource structure/template/adt` / `ldev resource export-*`
and `ldev portal inventory ... --json`; use browser validation with `playwright-cli`
when rendering is affected.

For the full deploy and verification workflow, route to:

- `deploying-liferay`

Use Blade as the underlying Workspace tool when needed, but prefer `ldev` as
the high-level command surface when it already supports the workflow.
