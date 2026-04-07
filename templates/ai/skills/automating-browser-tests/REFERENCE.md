# Browser Check Notes

Verified local CLI shape:

```bash
playwright-cli open [url]
playwright-cli screenshot [ref] --filename=<file>
playwright-cli run-code "<javascript function>"
```

Practical rules:

- Use `--filename`, not `--output`, for screenshots.
- Do not start with `snapshot` on pages that still redirect or re-render heavily.
- For `run-code`, prefer building the snippet into a shell variable with `cat <<'EOF'` and passing it quoted once.
- Keep one browser helper active at a time per session name.
- If local virtual host routing sends the browser to another site while `curl` still reaches the expected page, record that as a browser-routing limitation and finish validation with HTTP plus logs instead of claiming a visual pass.
