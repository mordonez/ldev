---

description: Setup guidance for standard Blade-created Liferay Workspaces
globs: *
alwaysApply: false

---

# Blade Workspace Setup

Use this rule only when the project type is `blade-workspace`.

Recommended startup sequence:

1. Confirm the repo root contains `gradle.properties` and `settings.gradle`.
2. Run `blade server init` to provision the local bundle.
3. Run `blade server start` or `blade server run`.
4. Watch `bundles/tomcat/logs/catalina.out` until startup is confirmed.

Useful variants:

- `blade server start -t` to tail logs automatically
- `blade server start -d` to start in debug mode
- `blade server run` to keep the server attached to the current terminal

For demo credentials in fresh bundles, see `ldev-liferay-core.md`.
Do not assume demo credentials in real environments. Prefer the project's
documented login or verify it explicitly.

Use `ldev doctor`, `ldev start`, and `ldev portal check` as the higher-level workflow layer on top of this setup.
