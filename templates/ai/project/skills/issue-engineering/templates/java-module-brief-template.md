# Java Module Brief Template

Specialised brief for changes that target an OSGi module / bundle. Extends
[agent-brief-template.md](agent-brief-template.md).

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one-line description in glossary terms

**Liferay surface:**
- Module name: <module folder name under modules/>
- Bundle symbolic name: <bsn from bnd.bnd>
- Public OSGi services touched: <list, or "none">
- Configuration PIDs affected: <list, or "none">
- Service Builder change: <yes / no — if yes, escalate scope explicitly>
- Portal restart required: <yes / no — `.config` factories or portal-ext changes>

**Verification source (durable):**
- `ldev deploy module <module-name>`
- `ldev osgi status <bundle-symbolic-name> --json`
- `ldev osgi diag <bundle-symbolic-name> --json`
- For exposed endpoints: matching `ldev portal inventory ...` or curl call

**Current behavior:**
What the bundle does today. Quote the observable behaviour, not the code.

**Desired behavior:**
What the bundle must do after the change. Cover error paths, transaction
boundaries, and any new configuration defaults.

**Key interfaces (durable):**
- `<ServiceInterface>` — added / changed methods, return contracts, exceptions
- `<Configuration>` — new keys, defaults, type (B / I / L / S)
- `<Component>` annotations — new properties, ranking, references
- For Service Builder: entity name, finders, columns added / removed

**Acceptance criteria:**
- [ ] `ldev deploy module <module-name>` succeeds
- [ ] `ldev osgi status <bundle-symbolic-name> --json` reports `ACTIVE`
- [ ] `ldev osgi diag <bundle-symbolic-name> --json` shows no missing
      requirements
- [ ] `ldev logs diagnose --since 5m --json` shows no new ERROR or WARN
- [ ] Behavioural acceptance: <observable check using glossary terms>
- [ ] If a configuration changed: `ldev portal config get <pid> --json`
      returns the new value (after restart if required)

**Out of scope:**
- Refactor of unrelated services in the same module
- Bumping unrelated dependencies in `bnd.bnd`
- Public service signature changes that ripple into other modules (escalate)

**Deploy contract:**
- Build artifact: `<module-name>.jar` deployed via the project's CI/CD pipeline
  (no UI fallback exists for OSGi modules)
- Configuration: `.config` files committed under
  `<configs/[env]/osgi/configs/>` (blade workspace) or `liferay/configs/`
  (ldev-native); never only applied to the live runtime
- Database changes (Service Builder): expected DDL / DML migration footprint
  and rollback plan
```

## Notes

- Quote the **bundle symbolic name** from `bnd.bnd`, not the folder name —
  folder names are renameable, BSNs are stable contracts.
- If the change touches a public service consumed across modules, list every
  consumer module explicitly. Do not assume a refactor is local.
- If `service.xml` changes, escalate scope and warn that a DB migration may be
  needed.
