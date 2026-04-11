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
- If local virtual host routing sends the browser to another site while `curl` still reaches the expected page, record that as a browser-routing limitation and finish validation with HTTP plus logs instead of claiming a visual pass.

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
