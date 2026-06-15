# Portal Console and Groovy Scripts

Use this reference when a task requires executing Groovy in the Liferay portal
console, running bulk fix-up operations, or auditing portal state that has no
direct `ldev` or headless API equivalent.

This reference is intentionally minimal. Groovy console operations bypass the
normal authorization and validation pipeline. Use `ldev` and headless resources
whenever they exist.

## When to use the Groovy console

Use the portal console only for operations that no `ldev` command or headless
API covers cleanly:

- Bulk fix of corrupted portal objects (vocabulary assignments, broken DDM records)
- Forced reindex for specific asset types
- Inspecting internal portal state (Service Builder entities, DDM structures from Java)
- Clearing portal caches directly via service calls
- Running one-time cleanup scripts for content that cannot be addressed through the headless API

Do **not** use the portal console to compensate for a missing `ldev resource`
command. Check `ldev --help` and `ldev mcp check --json` first.

## Gogo shell vs. Groovy console

These are two completely different execution contexts. Do not confuse them.

| | Gogo shell (`ldev osgi shell`) | Groovy console |
|---|---|---|
| Language | Felix OSGi gogo commands | Groovy |
| Spring context | No | Yes |
| `PortalBeanLocatorUtil` | Not available | Available |
| Service calls (DDM, Journal...) | Not available | Available |
| How to run | `ldev osgi shell` | Portal UI only (see below) |

**Use `ldev osgi shell` / `ldev osgi diag` only for OSGi-level operations** (bundle
state, dependency resolution, thread dumps). The Groovy patterns in this reference
require the full portal Groovy console — never the gogo shell.

## Access the portal console

1. Log into the portal as an administrator.
2. Navigate to: **Control Panel → Configuration → Server Administration → Script**
3. Language: **Groovy**

Or by URL: `<portalUrl>/group/control_panel/manage/-/server/script`

Resolve `portalUrl` from `ldev context --json` (field: `liferay.portalUrl`).

> **DXP 2024.Q3+**: scripting is disabled by default. If the Script Console is not visible,
> a system administrator must enable it in:
> **Control Panel → System Settings → Security → Script Management**.

There is no official REST or JSONWS API to execute scripts remotely. The Script Console
is only accessible from the portal UI.

## Minimal working pattern

```groovy
import com.liferay.portal.kernel.service.ServiceContext

// Use the service locator pattern
def ddmStructureLocalService = com.liferay.portal.kernel.bean.PortalBeanLocatorUtil
    .locate("com.liferay.dynamic.data.mapping.service.DDMStructureLocalService")

// Example: list DDM structures in a group
def structures = ddmStructureLocalService.getStructures(-1L)
structures.each { s ->
    out.println("${s.structureId} | ${s.structureKey} | ${s.nameCurrentValue}")
}
```

Use `out.println(...)` to write visible output to the console result area.

## Working with vocabularies and categories (ERC / Category Filter)

Vocabulary assignment bugs (e.g. filters not matching, ERC category scripts
failing) are often caused by a mismatch between the `externalReferenceCode`
stored on the vocabulary/category and what the search query expects.

Inspect a vocabulary and its ERCs:

```groovy
import com.liferay.portal.kernel.service.ServiceContextFactory
import com.liferay.asset.kernel.service.AssetVocabularyLocalServiceUtil

long groupId = <site-group-id> // from ldev portal inventory sites --json

def vocabularies = AssetVocabularyLocalServiceUtil.getGroupVocabularies(groupId)
vocabularies.each { v ->
    out.println("ID: ${v.vocabularyId} | Key: ${v.externalReferenceCode} | Name: ${v.name}")
}
```

Inspect categories in a vocabulary:

```groovy
import com.liferay.asset.kernel.service.AssetCategoryLocalServiceUtil

long vocabularyId = <vocabularyId>
def categories = AssetCategoryLocalServiceUtil.getVocabularyCategories(vocabularyId, -1, -1, null)
categories.each { c ->
    out.println("catId: ${c.categoryId} | ERC: ${c.externalReferenceCode} | Name: ${c.name}")
}
```

## Troubleshooting ERC-based filter scripts

If a Groovy script using ERCs fails or returns no results:

1. Verify the ERC value exists on the actual vocabulary/category using the
   inspection script above.
2. Check the group ID is correct — vocabularies are group-scoped.
3. Confirm the script targets the right site (`groupId`) — ercs are not
   globally unique.
4. If the ERC was set via UI, check for whitespace or case differences.

## Safe Groovy script checklist

Before running any Groovy script that mutates portal data:

- [ ] Run it on a local or PRE environment first.
- [ ] Preview the affected objects with a read-only `out.println` loop before any update.
- [ ] Save the script in the project repository under `docs/scripts/groovy/`.
- [ ] Run `ldev start` and confirm `ldev status --json` shows a healthy runtime before running.
- [ ] Run `ldev logs diagnose --since 5m --json` after the script to confirm no errors.

## Guardrails

- Never run destructive Groovy scripts on production without prior staging validation.
- Resolve `groupId` and other identifiers from `ldev portal inventory sites --json`
  before hardcoding them in scripts.
- If a script fails with a `ClassNotFoundException`, the service class name may differ
  across Liferay versions. Use `ldev context --json` to identify the runtime version
  and adjust imports accordingly.
- MCP is preferred over Groovy for service calls when the portal exposes a headless
  API: `ldev mcp check --json`.
