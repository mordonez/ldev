---

description: Runtime troubleshooting guidance using `ldev`
globs: *
alwaysApply: false

---

# `ldev` Runtime Troubleshooting

When a local Liferay runtime behaves unexpectedly, prefer this sequence:

1. `ldev doctor --json`
2. `ldev context --json`
3. `ldev status --json`
4. `ldev logs diagnose --json`

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

Use this rule only as a short runtime reminder. Use `ldev` first for local
operational context. Use MCP later for generic portal-facing operations if
needed.
