# Theme Reference

Use this reference for global visual changes in theme SCSS, theme FTLs, or shared frontend JS.

## Typical surface

- Theme under `liferay/themes/`
- Theme SCSS and templates
- Visual overrides for Liferay widgets
- Global layout, navigation, or shell styling

## Minimal flow

1. Resolve the affected page with `ldev portal inventory page --url <fullUrl> --json`
2. Apply the smallest theme change
3. Deploy only the theme:

```bash
ldev deploy theme
ldev logs --since 2m --service liferay --no-follow
```

4. Verify the affected page in runtime

## Useful rules

- Keep SCSS nesting contained
- Prefer shared variables over hardcoded values
- Do not edit generated artifacts
- If the symptom is visually ambiguous, combine this with `automating-browser-tests`
