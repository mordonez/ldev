# Browser Automation Reference

## Command syntax

```bash
playwright-cli open [url]
playwright-cli screenshot [ref] --filename=<file>
playwright-cli run-code "<javascript function>"
playwright-cli install --skills
```

Quick rules:

- Use `--filename`, not `--output`, for screenshots.
- Do not pass `--viewport-width` / `--viewport-height` to `screenshot`; set viewport on an open page with `run-code`.
- Use full-page screenshots as mandatory evidence with `run-code` + `page.screenshot({ fullPage: true })`.
- Install official skills with `playwright-cli install --skills` before guessing command syntax.
- Do not start with `snapshot` on pages that still redirect or re-render heavily.
- Build `run-code` snippets into a shell variable with `cat <<'EOF'` and pass once.
- Keep one browser helper active at a time per session name. Do not run helpers in
  parallel against the same session — open first, then sequence snapshot / run-code /
  goto / screenshot.
- Lock the browser host to `ldev context --json → liferay.portalUrl`. Do not mix `localhost`
  and `127.0.0.1` after authentication.
- If local virtual host routing sends the browser to another site while `curl` reaches
  the expected page, record it as a browser-routing limitation and finish validation with
  HTTP + logs.
- `ldev portal inventory page --url ... --json` may return `adminUrls.*` with a different
  host spelling. Normalize the host before opening.

## Project menu maps (optional)

Use the project-defined menu entrypoint from `docs/ai/project-context.md`.
If not defined there, use `docs/ai/menu/navigation.i18n.json` as default.

If the menu entrypoint exists, use it as the source of truth for admin navigation.

Recommended contract for project-owned maps:

- `docs/ai/menu/navigation.i18n.json`: entrypoint with menu file locations
- `docs/ai/menu/menu_admin.i18n.json`: control panel and global admin paths
- `docs/ai/menu/sidebar_menu.i18n.json`: site-scoped menu paths
- each menu item includes at least `label` and `path`
- placeholder support: `{site}`, `{siteGroupId}`

Suggested flow:

1. Resolve `portalUrl` from `ldev context --json`.
2. Resolve `site` and `groupId` from `ldev portal inventory sites --json`.
3. Start an authenticated admin browser session.
4. Build the final URL from `portalUrl + path` after replacing placeholders.
5. Open the direct URL first; use labels only as fallback selectors.

Keep menu map literals in project-owned docs. Vendor skills should document the pattern,
not project-specific labels or portlet IDs.

## Install Playwright Chromium

If `playwright-cli` reports chromium is not installed:

PowerShell:

```powershell
$playwrightCli = Join-Path (npm root -g) '@playwright/cli/node_modules/playwright/cli.js'
node $playwrightCli install chromium
```

Bash:

```bash
node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium
```

This installs the exact browser revision expected by the globally installed `playwright-cli` wrapper.

## Browser selection

Check available browsers before starting a flow:

```bash
playwright-cli open --help
```

Fallback policy when Chrome fails:

```bash
playwright-cli -s=<session-name> open --browser firefox "<url>"
playwright-cli -s=<session-name> open --browser webkit "<url>"
```

Use `--browser chrome` only when Chrome is genuinely required. For generic validation,
`firefox` is an acceptable alternate if it launches and reproduces the page.

## Mobile viewport

Do not pass viewport flags to `playwright-cli screenshot`. Open the URL first, set the
viewport on the existing page with `run-code`, then capture.

PowerShell:

```powershell
playwright-cli -s=mobile-<issue> open "<url>"
$CODE = @'
async function (page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
}
'@
playwright-cli -s=mobile-<issue> run-code "$CODE"
playwright-cli -s=mobile-<issue> screenshot --filename=.tmp/<issue>/mobile.png
playwright-cli -s=mobile-<issue> close
```

## Full-page evidence (recommended default)

Use this pattern when you need all details beyond the visible fold.

```bash
playwright-cli -s=issue-<num> open "<url>"
playwright-cli -s=issue-<num> run-code "async function (page) { await page.screenshot({ path: '.tmp/<issue>/fullpage.png', fullPage: true }); }"
playwright-cli -s=issue-<num> close
```

## Liferay admin login

Default local portal credentials are documented in `ldev-liferay-core.md`.
Prefer DOM-id selectors inside `run-code` over wrapper text-matching commands on
localized pages.

The sample below uses placeholder test credentials. Replace with project-specific
test user credentials when they differ.

```bash
PORTAL_URL="$(ldev context --json | jq -r '.liferay.portalUrl')"
playwright-cli -s=page-editor-<issue> open "${PORTAL_URL}/c/portal/login"
CODE=$(cat <<'EOF'
async function (page) {
  await page.locator("#_com_liferay_login_web_portlet_LoginPortlet_login").fill("<test-user-email>");
  await page.locator("#_com_liferay_login_web_portlet_LoginPortlet_password").fill("<test-user-password>");
  await page.locator("button[type=submit]").first().click();
}
EOF
)
playwright-cli -s=page-editor-<issue> run-code "$CODE"
```

After login, confirm the current page:

```bash
playwright-cli -s=<session-name> run-code "async function (page) { return { url: page.url(), title: await page.title() }; }"
```

If login lands on another site (e.g., `edicioweb`), that only confirms the auth session.
Navigate explicitly to the target site's admin URL afterwards.

If a direct `adminUrls.translate` or `adminUrls.configure` URL falls back to a generic
"Pàgines del lloc web" screen, treat that URL as a hint rather than a guaranteed deep-link.

## Page layout mutations

```bash
# 1. Export before touching
ldev portal page-layout export --url <pageUrl>

# 2. Separate sessions for runtime and editor
playwright-cli -s=runtime-<issue> open "<runtimeUrl>"
playwright-cli -s=editor-<issue> open "<editUrl>"

# 3. Login first if the editor requires it
PORTAL_URL="$(ldev context --json | jq -r '.liferay.portalUrl')"
playwright-cli -s=editor-<issue> open "${PORTAL_URL}/c/portal/login"

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
- Keep runtime and editor in separate named sessions.
- Never run two helpers against the same session in parallel.
- If a session reports `session-busy`, wait and retry sequentially.

## Runtime verification

```bash
playwright-cli -s=runtime-check open "<url>"
playwright-cli -s=runtime-check screenshot --filename=.tmp/<issue>/runtime-check.png
playwright-cli -s=runtime-check close
ldev logs --since 2m --no-follow
```

## Cleanup between sessions

```bash
playwright-cli close-all || true
playwright-cli kill-all || true
```
