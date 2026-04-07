---

description: Verified shared Liferay guidance that applies across ldev project types
globs: *
alwaysApply: true

---

# Liferay Core Guidance

- Establish the product context first. In a Workspace, read `gradle.properties` and identify `liferay.workspace.product`. In `ldev-native`, use `ldev context --json` and inspect the runtime/product information that `ldev` resolves.
- If the target is older than 7.4, traditional OSGi module development is more common. If the target is 7.4+ or a quarterly release, prefer modern Liferay approaches such as Client Extensions, Objects, and Fragments unless there is a clear reason to stay in OSGi.
- Use `liferay-learn` as the primary documentation source and `liferay-portal` as the primary source-code reference.
- When code generation or dependency advice depends on the target product, align it with the actual product version before proposing changes.

Reference sources:

- `liferay-learn` for docs and examples
- `liferay-portal` for implementation patterns
- official Liferay sample workspaces for current conventions

Do not assume a Blade Workspace layout unless the project type is explicitly `blade-workspace`.
