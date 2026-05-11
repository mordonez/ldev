---
name: automating-browser-tests
description: 'Runs Playwright-based checks and captures visual evidence against a local ldev portal. Use when a task needs browser reproduction, screenshots, page-editor workflows, login flows, mobile viewport checks, or rendered Green validation.'
---

# Automating Browser Tests

Use `ldev` for portal discovery and runtime state, and `playwright-cli` for
browser actions. Read `REFERENCE.md` for exact command syntax, browser
installation, login scripts, page layout mutations, mobile viewports, and
cleanup patterns.

## Bootstrap

```bash
ldev ai bootstrap --intent=develop --cache=60 --json
ldev portal inventory page --url <fullUrl> --full --json
```

Lock these facts before opening a browser:

- `context.liferay.portalUrl`: keep one host spelling for the whole session.
- inventory `adminUrls.*`, `page.siteFriendlyUrl`, `page.groupId`, `page.plid`
  when page-editor or admin navigation is needed.
- `doctor.tools.playwrightCli.status == "pass"`.

If Playwright CLI is not ready, install and re-check:

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills
```

If install fails, stop and report the blocker.

## Typical Flow

```powershell
New-Item -ItemType Directory -Force .tmp/<issue-or-session>/ | Out-Null
playwright-cli -s=<session-name> open "<localUrl>"
playwright-cli -s=<session-name> snapshot
playwright-cli -s=<session-name> run-code "async function (page) { await page.screenshot({ path: '.tmp/<issue>/before-fullpage.png', fullPage: true }); }"
```

After the fix, repeat the affected flow and capture after evidence. Do not run
`open`, `snapshot`, `goto`, `screenshot`, or `run-code` in parallel against the
same session.

## Liferay Rules

- Never validate against production; reproduce locally first.
- Inspect the loaded page with both `snapshot` and
  `ldev portal inventory page --url <localUrl> --full --json` before deciding what to edit.
- Use DOM-id selectors for login; localized text clicks are brittle.
- Normalize `adminUrls.*` to the browser session host before opening.
- For Journal article editing, use the direct edit URL from page inventory, publish from the editor with structural selectors, then verify success by re-running page inventory and confirming `lifecycle.dateModified` advanced.
- Prefer project menu maps from `docs/ai/project-context.md` when present.

## Evidence

- Store evidence under `.tmp/<issue>/`.
- Use full-page screenshots as the default user-facing proof.
- For flaky failures, use tracing before guessing.
- If browser navigation lands on the wrong site due to virtual host routing,
  trust `ldev portal inventory`, `curl`, and logs over a misleading screenshot.

## Guardrails

- Use semantic session names.
- Keep browser commands sequential per session.
- If Chrome is unavailable but another browser works, report that explicitly.
- If a session reports `session-busy`, wait and retry sequentially.
