---
name: automating-browser-tests
description: "Use when a project needs Playwright-based browser checks, visual evidence or page-editor workflows on top of an ldev runtime."
---

# Automating Browser Tests

Use `ldev` for portal discovery and runtime state, `playwright-cli` for browser actions.

## Required bootstrap

```bash
ldev context --json
ldev status --json
ldev doctor --json
ldev portal inventory page --url <fullUrl> --json
```

Check `ldev doctor --json` → `tools.playwrightCli.available` before starting any browser flow.

If `tools.playwrightCli.available` is `false`, install it first and do not proceed until it is available:

```bash
npm install -g @playwright/cli@latest
```

Then re-run `ldev doctor --json` to confirm `tools.playwrightCli.available` is `true` before continuing.
All browser flows in this skill require `playwright-cli`.

Known wrapper caveats and safe shell patterns live in `REFERENCE.md` next to this skill. Read it when the browser flow starts failing for reasons that look tooling-related rather than product-related.

## Install Playwright Chromium (run first if browser is missing)

If `playwright-cli` reports that `chromium` is not installed:

PowerShell:

```powershell
$playwrightCli = Join-Path (npm root -g) '@playwright/cli/node_modules/playwright/cli.js'
node $playwrightCli install chromium
```

Bash:

```bash
node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium
```

This installs the exact browser revision that the globally installed `playwright-cli` wrapper expects.

## Browser Selection

Do not assume Chrome is available on the machine.

Before spending time on login or editor flows, check what the wrapper supports:

```bash
playwright-cli open --help
```

If browser startup fails with Chrome/Chromium errors, use this policy:

1. If the issue is explicitly Chrome-specific, say Chrome validation is blocked by missing runtime and only use another browser for non-blocking functional checks.
2. If the issue is not browser-specific, try alternate browsers and keep the first browser that actually opens:

```bash
playwright-cli -s=<session-name> open --browser firefox "<url>"
playwright-cli -s=<session-name> open --browser webkit "<url>"
```

3. Do not burn time retrying browser installs without privileges. Move to `firefox` or `webkit` and continue validating the flow.

Use `--browser chrome` only when Chrome is genuinely required. For generic runtime or editor validation, `firefox` is an acceptable alternate browser if it launches and reproduces the page.

## Typical flow

```bash
# Create evidence directory first (PowerShell: New-Item -ItemType Directory -Force .tmp/<issue-or-session>)
mkdir -p .tmp/<issue-or-session>/

# Open session
playwright-cli -s=<session-name> open "<url>"

# Capture before state
playwright-cli -s=<session-name> screenshot --filename=.tmp/<issue>/before.png

# Snapshot only after navigation is stable; skip it if the page is still redirecting
playwright-cli -s=<session-name> snapshot

# After fix: capture post state
playwright-cli -s=<session-name> screenshot --filename=.tmp/<issue>/after.png

# Close session
playwright-cli -s=<session-name> close
```

If the project provides a `.playwright/cli.config.json`, pass it:

```bash
playwright-cli -s=<session-name> open "<url>" --config=.playwright/cli.config.json
```

If the default config path does not exist, locate the actual config once before retrying:

```bash
rg --files . | rg '(^|/)cli\\.config\\.json$|playwright\\.config\\.'
```

## Liferay login and editor auth

Before attempting Page Editor actions, determine whether you need an authenticated admin session.

Default local portal credentials are documented in `ldev-liferay-core.md`. Use those values
in the login script below rather than assuming them from memory.

Manual `playwright-cli` login flow:

```bash
playwright-cli -s=page-editor-<issue> open "http://127.0.0.1:8080/c/portal/login"
CODE=$(cat <<'EOF'
async function (page) {
  await page.locator("#_com_liferay_login_web_portlet_LoginPortlet_login").fill("test@liferay.com");
  await page.locator("#_com_liferay_login_web_portlet_LoginPortlet_password").fill("test");
  await page.locator("button[type=submit]").first().click();
}
EOF
)
playwright-cli -s=page-editor-<issue> run-code "$CODE"
```

Project-specific wrappers can document their own historical helper commands in a local `REFERENCE.md`.

## Page layout mutations

When the issue involves content page composition:

```bash
# 1. Export before touching
ldev portal page-layout export --url <pageUrl>

# 2. Separate sessions for runtime and editor
playwright-cli -s=runtime-<issue> open "<runtimeUrl>"
playwright-cli -s=editor-<issue> open "<editUrl>"

# 3. If editor auth is needed, login first
playwright-cli -s=editor-<issue> open "http://127.0.0.1:8080/c/portal/login"

# 4. Make changes via run-code
CODE=$(cat <<'EOF'
async function (page) {
  /* action */
}
EOF
)
playwright-cli -s=editor-<issue> run-code "$CODE"

# 5. Capture and close
playwright-cli -s=editor-<issue> screenshot --filename=.tmp/<issue>/after-edit.png
playwright-cli -s=editor-<issue> close
```

Rules:
- Keep runtime and editor in separate named sessions
- Never run two helpers against the same session in parallel
- If a session reports `session-busy`, wait and retry sequentially

## Runtime verification

```bash
playwright-cli -s=runtime-check open "<url>"
playwright-cli -s=runtime-check screenshot --filename=.tmp/<issue>/runtime-check.png
playwright-cli -s=runtime-check close
```

Then check logs:
```bash
ldev logs --since 2m --no-follow
```

## Cleanup between sessions

```bash
playwright-cli close-all || true
playwright-cli kill-all || true
```

## Guardrails

- Use semantic session names (`issue-NUM`, `page-editor-NUM`), not generic ones
- Store evidence under `.tmp/<issue>/` before uploading anywhere
- For flaky failures, use `tracing-start`/`tracing-stop` before guessing
- Never validate against production; always reproduce locally first
- If browser navigation lands on the wrong local site because of virtual host routing, treat browser evidence as blocked for that URL and use `curl`, `ldev portal inventory ...`, and runtime logs instead of forcing a misleading screenshot
- If Chrome is unavailable but Firefox/WebKit works, report that explicitly instead of treating the whole validation as blocked
