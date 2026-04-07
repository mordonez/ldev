# OSGi Reference

Use this reference when the change lives in a module or depends on bundle runtime state.

## Minimal flow

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
ldev logs --since 2m --service liferay --no-follow
```

## When to use it

- Java changes in `modules/`
- Broken OSGi wiring
- Need to confirm a bundle is `ACTIVE`
- Post-deploy diagnosis

## Guardrails

- Deploy the smallest possible module
- Do not treat build output as sufficient evidence
- If the problem is about extension points or core behavior, use `extending-liferay.md`
