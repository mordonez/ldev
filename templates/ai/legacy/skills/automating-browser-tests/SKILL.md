---
name: automating-browser-tests
description: "Use when a project needs Playwright-based browser checks, visual evidence or page-editor workflows on top of an ldev runtime."
allowed-tools: Bash(playwright-cli:*)
---

# Automating Browser Tests

Use `ldev` for runtime readiness and portal discovery. Use `playwright-cli`
directly for browser control and evidence capture.

## Prerequisites

Before opening a browser, verify the runtime is ready:

```bash
ldev doctor --json
ldev status --json
ldev logs --since 2m --service liferay --no-follow
```

If `ldev status --json` shows the portal is not ready, start it first:

```bash
ldev start
```

## Required bootstrap

Resolve the full portal URL and page composition before opening a browser:

```bash
ldev context --json
ldev liferay inventory page --url <fullUrl> --json
```

`ldev context --json` returns the local runtime base URL (e.g. `http://localhost:8080`).
Use that base to build the full URL for Playwright.

## Session naming

Name browser sessions after the issue or task to keep evidence organized:

```bash
playwright-cli -s=runtime-<issue-NUM> open "<runtime-url>" --config=.playwright/cli.config.json
```

Reuse the same session name throughout the same issue to keep the browser state
consistent across multiple steps.

## Typical flow

### 1. Take a before screenshot

```bash
playwright-cli -s=runtime-<issue-NUM> screenshot .tmp/<issue-NUM>/before.png
```

### 2. Interact with the page

```bash
playwright-cli -s=runtime-<issue-NUM> click "selector"
playwright-cli -s=runtime-<issue-NUM> fill "input" "value"
playwright-cli -s=runtime-<issue-NUM> screenshot .tmp/<issue-NUM>/after.png
```

### 3. Export page composition if needed

If the test involves fragment, widget or layout changes:

```bash
ldev liferay page-layout export --url <fullUrl>
```

Compare exported layout files against expected values in the project resources.

### 4. Verify portal state after browser actions

After any browser action that mutates portal state (publish, import, delete):

```bash
ldev liferay inventory page --url <fullUrl> --json
ldev logs --since 2m --service liferay --no-follow
```

## Evidence management

Store all evidence under `.tmp/<issue-NUM>/`:

- `before.png` — state before the fix
- `after.png` — state after the fix
- any additional screenshots named by step

Attach the final evidence (at minimum `after.png`) in the GitHub issue or PR
comment when closing the issue.

## Guardrails

- Always check `ldev status --json` before opening a browser. Do not assume
  the portal is running.
- Do not hard-code local port numbers. Get the base URL from `ldev context --json`.
- Name sessions after the issue, not after the page, to avoid session conflicts
  when testing multiple pages in the same issue.
- Do not skip `ldev liferay inventory page --url ... --json` before browser work.
  The inventory response tells you the exact fragments, widgets and layout type
  on the page, saving unnecessary browser exploration.
