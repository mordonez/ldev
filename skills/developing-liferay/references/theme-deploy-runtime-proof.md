# Theme Deploy Runtime Proof

Use the theme deploy JSON contract when a theme change must be proven in a local
runtime:

```bash
ldev deploy theme --format json
ldev logs diagnose --since 5m --json
```

`ok: true` means the artifact was prepared and copied to local deploy/cache
locations. Browser-visible validation still requires `runtimeRefreshed: true`.
If `runtimeActionRequired` is present, run that action before browser
validation.
