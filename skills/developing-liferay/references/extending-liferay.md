# Extending Liferay Reference

Use this reference when you need to customize core behavior and must choose the least invasive extension point.

## Recommended order

1. Existing OSGi configuration
2. Localization
3. Dynamic Include
4. Model Listener
5. Service Wrapper
6. Portlet Filter or Servlet Filter
7. OSGi service override
8. OSGi Fragment or JSP override as a last resort

## Good signs

- The change is small and reversible
- You avoid copying full JSPs if a better extension point exists
- Upgrade risk stays bounded

## Minimum verification

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
ldev logs --since 2m --service liferay --no-follow
```

## Guardrails

- Do not patch core code inside the container
- Do not use hard overrides if a wrapper or include solves the case
