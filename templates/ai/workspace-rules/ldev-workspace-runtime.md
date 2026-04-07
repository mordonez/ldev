---

description: Runtime and layout guidance for blade-workspace projects
globs: *
alwaysApply: true

---

# Blade Workspace Runtime

Use this rule only when the project type is `blade-workspace`.

Key locations:

- `bundles/tomcat/logs/` for portal logs
- `configs/common/` and `configs/<env>/` for source configuration
- `configs/<env>/osgi/configs/` for source OSGi configs
- `configs/<env>/deploy/` for environment-specific deploy assets such as licenses
- `modules/`, `themes/`, and `client-extensions/` for source code

Important conventions:

- `gradle.properties` defines the product and target platform context
- Blade remains the primary owner of bundle/build/runtime conventions
- `ldev` augments the Workspace with diagnostics, context, deploy shortcuts, OAuth bootstrap, and MCP checks

When talking about runtime state, prefer `ldev context --json` and `ldev doctor --json` over guessing from the directory layout alone.
