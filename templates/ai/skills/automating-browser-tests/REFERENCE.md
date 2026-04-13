# Browser Check Notes

Verified local CLI shape:

```bash
playwright-cli open [url]
playwright-cli screenshot [ref] --filename=<file>
playwright-cli run-code "<javascript function>"
playwright-cli install --skills
```

Practical rules:

- Use `--filename`, not `--output`, for screenshots.
- Do not pass `--viewport-width` or `--viewport-height` to `screenshot`; set viewport on an open page with `run-code`.
- Install the official `playwright-cli` skills with `playwright-cli install --skills` before guessing command syntax.
- Do not start with `snapshot` on pages that still redirect or re-render heavily.
- For `run-code`, prefer building the snippet into a shell variable with `cat <<'EOF'` and passing it quoted once.
- Keep one browser helper active at a time per session name.
- Do not run helper commands in parallel against the same session. Open first,
  then `snapshot`, `run-code`, `goto`, and `screenshot` sequentially.
- If local virtual host routing sends the browser to another site while `curl` still reaches the expected page, record that as a browser-routing limitation and finish validation with HTTP plus logs instead of claiming a visual pass.
- Lock the browser host to `ldev context --json -> env.portalUrl` before login.
  Do not mix `localhost` and `127.0.0.1` after authentication.
- `ldev portal inventory page --url ... --json` may return `adminUrls.*` with a
  different host spelling than the current browser session. Normalize the host
  before opening the URL.
- On localized Liferay login pages, prefer DOM-id selectors inside `run-code`
  (`#_com_liferay_login_web_portlet_LoginPortlet_login` and
  `#_com_liferay_login_web_portlet_LoginPortlet_password`) over wrapper
  text-based `fill` commands.
- If a deep-link to page configuration or translation falls back to generic
  "Pàgines del lloc web", treat it as a context fallback. You are authenticated,
  but not at the final target yet.

Mobile capture pattern:

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
