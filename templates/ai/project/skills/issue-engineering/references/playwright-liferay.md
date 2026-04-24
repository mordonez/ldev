# Playwright in Liferay Issues

Use this reference when validation or reproduction depends on the portal in a browser.

## Principles

- Reproduce locally first
- Use separate sessions for runtime and editor
- Do not run concurrent helpers against the same session

## Minimum Runtime Verification

```bash
# bash/zsh
mkdir -p .tmp/issue-NUM
playwright-cli -s=runtime-NUM open "<portalUrl>/affected-path"
playwright-cli -s=runtime-NUM run-code "async function (page) { await page.screenshot({ path: '.tmp/issue-NUM/before.png', fullPage: true }); }"
playwright-cli -s=runtime-NUM close
```

```powershell
# PowerShell
New-Item -ItemType Directory -Force .tmp/issue-NUM | Out-Null
playwright-cli -s=runtime-NUM open "<portalUrl>/affected-path"
playwright-cli -s=runtime-NUM run-code "async function (page) { await page.screenshot({ path: '.tmp/issue-NUM/before.png', fullPage: true }); }"
playwright-cli -s=runtime-NUM close
```

## When Page Editor Is Needed

1. Resolve the page:

```bash
ldev portal inventory page --url <fullUrl> --json
```

2. Export before mutating:

```bash
ldev portal page-layout export --url <fullUrl>
```

3. Review the project Playwright login/editor patterns in:

`../../automating-browser-tests/REFERENCE.md`

## Signals That You Should Use Playwright

- Visual regressions
- Widgets or fragments that only make sense when seen in runtime
- Content page composition changes
- Need for visual evidence in the PR

## Signals That You Should Not Use It Yet

- The environment is not healthy
- The issue is not even scoped to a URL or page yet
- You can validate first via `ldev portal ...`, `ldev resource ...`, or `ldev osgi ...`
- The browser resolves the wrong local site because virtual host routing is not matching the intended URL
