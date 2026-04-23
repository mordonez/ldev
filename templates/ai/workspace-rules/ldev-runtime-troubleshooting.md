---

description: Runtime troubleshooting guidance using `ldev`
globs: *
alwaysApply: false

---

# `ldev` Runtime Troubleshooting

When a local Liferay runtime behaves unexpectedly, prefer this sequence:

1. `ldev ai bootstrap --intent=troubleshoot --json`
2. `ldev status --json`
3. `ldev logs diagnose --json`
4. `ldev doctor --json` if you need individual check details beyond bootstrap

Do not start by guessing. Establish:

- whether the project type was detected correctly
- whether the bundle exists
- whether the portal is reachable
- whether OAuth2 is configured for `ldev`

Then use the active runtime-specific rule for paths and layout details:

- `ldev-workspace-runtime` for `blade-workspace`
- `ldev-native-runtime` for `ldev-native`

For the full incident workflow, use the vendor skill:

- `troubleshooting-liferay`

When `ldev logs diagnose` points to a Liferay-specific behaviour and the cause
is unclear, supplement with documentation search before guessing:

```
site:github.com/liferay/liferay-learn [error message or topic]
```

Common search targets: `docs/dxp/latest/en/installation-and-upgrades/` for
startup failures, `docs/dxp/latest/en/liferay-development/` for runtime
extension issues.

Use this rule only as a short runtime reminder. Use `ldev` first for local
operational context. Use MCP later for generic portal-facing operations if
needed.
