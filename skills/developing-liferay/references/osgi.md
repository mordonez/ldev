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

## Bundle lifecycle states

| State | Meaning | Action |
|---|---|---|
| `ACTIVE` | Bundle is running and all services are registered. This is the expected state for deployed modules. | None needed. |
| `RESOLVED` | Class loading resolved but not started. Either the bundle is waiting to start, uses lazy activation, or a required service is unavailable. | Run `ldev osgi diag` to distinguish lazy activation (normal) from a missing service dependency (problem). |
| `INSTALLED` | Bundle is installed but class loading has not completed. Usually means a missing package or an unresolved import. | Run `ldev osgi diag` — look for `Unresolved requirement`. |
| `STARTING` | Bundle is in the process of starting. Normally transient; persistent `STARTING` means the `BundleActivator` is blocking or threw. | Check logs for the activator exception. |
| `STOPPING` | Bundle is shutting down. Transient under normal conditions. | Usually harmless; check logs if it persists. |
| `FAILURE` | Bundle threw an exception during activation. | Read the exception in `ldev logs` — the stack trace names the failing component or service. |
| `UNINSTALLED` | Bundle was explicitly removed from the runtime. | Re-deploy the module. |

### `RESOLVED` is not always an error

Bundles that declare `Bundle-ActivationPolicy: lazy` start as `RESOLVED` and
activate on first class load. This is normal for many Liferay platform bundles.
It is a problem only when your own module or a dependency it requires is
`RESOLVED` instead of `ACTIVE`.

## Reading `ldev osgi diag` output

```bash
ldev osgi diag <bundle-symbolic-name> --json
```

Key patterns to look for:

| Pattern in output | Meaning |
|---|---|
| `Unresolved requirement: Import-Package: com.example.foo` | The bundle needs package `com.example.foo` but nothing exports it. Either a dependency is missing or the wrong version is installed. |
| `Unresolved requirement: Require-Capability: osgi.service; filter:="(objectClass=...)"` | The bundle requires a service that is not registered. The service's own bundle may be `INSTALLED` or `FAILURE`. |
| `No unresolved requirements` with state `RESOLVED` | Likely lazy activation — not a problem unless you expect the bundle to be `ACTIVE`. |
| `Exception` in the output | The activator or a Declarative Services component threw during start. Read the full stack trace in `ldev logs`. |

## Mapping a bundle name to its symbolic name

The symbolic name is what `ldev osgi status` and `ldev osgi diag` require. Do
not assume it from the directory name alone.

Find the symbolic name in source first:

```bash
rg "Bundle-SymbolicName|Bundle-Name" modules */*/bnd.bnd
```

Or inspect the module directly:

```bash
sed -n '1,120p' modules/<module>/bnd.bnd
```

The symbolic name is also declared in the module's `bnd.bnd` file as
`Bundle-SymbolicName`.

## Guardrails

- Deploy the smallest possible module
- Do not treat build output as sufficient evidence — always verify with `ldev osgi status`
- `RESOLVED` is not necessarily broken; always run `ldev osgi diag` before escalating
- If the problem is about extension points or core behavior, use `extending-liferay.md`
