---
name: automating-browser-tests
description: "Use when a project needs Playwright-based browser checks, visual evidence or page-editor workflows on top of an ldev runtime."
allowed-tools: Bash(playwright-cli:*)
---

# Automating Browser Tests

Use `ldev` for runtime and portal discovery, and use direct `playwright-cli`
for browser actions.

## Required bootstrap

```bash
ldev context --json
ldev status --json
ldev liferay inventory page --url <fullUrl> --json
```

## Typical flow

```bash
playwright-cli -s=runtime-<issue> open "<runtime-url>" --config=.playwright/cli.config.json
playwright-cli -s=runtime-<issue> screenshot .tmp/<issue>/before.png
```

If page composition changes are involved:

```bash
ldev liferay page-layout export --url <fullUrl>
```

Keep browser evidence under `.tmp/<issue>/` and attach the final evidence in
GitHub when closing the issue or PR.
