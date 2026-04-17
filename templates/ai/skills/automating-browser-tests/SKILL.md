---
name: automating-browser-tests
description: "Use when a project needs Playwright-based browser checks, visual evidence or page-editor workflows on top of an ldev runtime."
---

# Automating Browser Tests

Use `ldev` for portal discovery and runtime state, `playwright-cli` for browser actions.

Read `REFERENCE.md` next to this skill for command syntax, browser installation,
mobile viewport, login flows, page layout mutations, and cleanup patterns.

## Required bootstrap

```bash
ldev context --json
ldev status --json
ldev doctor --json
ldev portal inventory page --url <fullUrl> --json
```

Before opening Playwright, lock these fields from bootstrap:

- `env.portalUrl`: use this exact host for the whole browser session — do not mix `localhost` and `127.0.0.1`.
- `ldev portal inventory page --url <fullUrl> --json` → `adminUrls.*`, `siteFriendlyUrl`, `groupId`, `layout.plid`.

Check `ldev doctor --json` → `tools.playwrightCli.available` before starting any browser flow.

If `tools.playwrightCli.available` is `false`:

```bash
npm install -g @playwright/cli@latest
```

Re-confirm before continuing. Then install official skills:

```bash
playwright-cli install --skills
```

If that fails, stop and report the install failure. Use `playwright-cli <command> --help`
and `REFERENCE.md` for the current session.

For chromium install details or browser selection fallback policy, see `REFERENCE.md`.

## Project menu maps (optional)

Some projects keep localized admin menu maps to speed up issue reproduction and
browser navigation.

Use the project-defined menu entrypoint path from `docs/ai/project-context.md`.
If the project does not define one, the default suggestion is
`docs/ai/menu/navigation.i18n.json`.

If the menu entrypoint exists:

- Prefer those map paths for direct admin navigation instead of brittle label clicks.
- Resolve placeholders from runtime facts:
  - `portalUrl` from `ldev context --json`
  - `site` and `siteGroupId` from `ldev portal inventory sites --json`
- Start an authenticated admin session before opening admin map paths.
- Keep map data project-owned. Do not copy project literals into vendor skills.

## Typical flow

```bash
# Create evidence directory (PowerShell: New-Item -ItemType Directory -Force .tmp/<issue>)
mkdir -p .tmp/<issue-or-session>/

playwright-cli -s=<session-name> open "<url>"
playwright-cli -s=<session-name> screenshot --filename=.tmp/<issue>/before.png
playwright-cli -s=<session-name> snapshot
# after fix:
playwright-cli -s=<session-name> screenshot --filename=.tmp/<issue>/after.png
playwright-cli -s=<session-name> close
```

Do not run `open`, `snapshot`, `screenshot`, `goto`, or `run-code` in parallel
against the same session. Open first, then continue sequentially.

When the browser flow starts from an issue URL, inspect the loaded page before
deciding what code or resource to edit:

```bash
playwright-cli -s=<session-name> open "<localUrl>"
playwright-cli -s=<session-name> snapshot
ldev portal inventory page --url <localUrl> --json
```

## Liferay login and editor auth

Before Page Editor actions, determine whether an authenticated admin session is needed.
Default local portal credentials are in `ldev-liferay-core.md`.

Use DOM-id selectors inside `run-code` for login (localized pages are unreliable
with text-matching wrappers). Full login script is in `REFERENCE.md`.

After login, confirm the current page before navigating to admin URLs:

```bash
playwright-cli -s=<session-name> run-code "async function (page) { return { url: page.url(), title: await page.title() }; }"
```

For `adminUrls.*` on a different host spelling than the browser session, normalize the URL
to the browser host before opening. Full page layout mutation pattern is in `REFERENCE.md`.

## Guardrails

- Use semantic session names (`issue-NUM`, `page-editor-NUM`), not generic ones.
- Store evidence under `.tmp/<issue>/` before uploading anywhere.
- For flaky failures, use `tracing-start`/`tracing-stop` before guessing.
- Never validate against production; always reproduce locally first.
- Inspect the loaded local page with `snapshot` plus `ldev portal inventory page --url`
  before deciding what code or resource to edit.
- If browser navigation lands on the wrong site due to virtual host routing, use
  `curl`, `ldev portal inventory ...`, and runtime logs instead of a misleading screenshot.
- If Chrome is unavailable but Firefox/WebKit works, report that explicitly.
- If a session reports `session-busy`, wait and retry sequentially.

