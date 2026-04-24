# Liferay Objects

Use this reference when defining, querying, or troubleshooting Liferay Objects
(DXP 7.4+ / quarterly releases). Objects is the core of modern DXP development
for custom data models without traditional OSGi modules.

## When to use Objects

| Use Objects when | Use Journal Article when | Use Document when |
|---|---|---|
| You need a structured custom data model with its own REST API | The content is primarily editorial/rich text with a presentation template | The content is a file (PDF, image, video) |
| Entries are created/updated programmatically by agents or integrations | The content is authored by editors in the web UI | |
| You need relationships between entities | The content has a defined display lifecycle (draft → approved → expired) | |
| You need Object Actions, Validations, or Workflow on the data | | |

## Object definitions

Object definitions are the schema. Each definition produces an auto-generated
headless REST API and a portal management UI.

### Key fields

| Field | Description |
|---|---|
| `name` | Internal name (PascalCase, no spaces). Becomes part of the API path. |
| `label` | Human-readable display name (supports i18n map). |
| `pluralLabel` | Used in the API path: `/o/c/<pluralLabel>/v1.0/`. |
| `scope` | `company` (portal-wide) or `site` (scoped to a site group). |
| `storageType` | `default` (Liferay-managed DB table) or `salesforce` / custom for external storage. |
| `status` | `published` to activate. Unpublished definitions are not accessible via API. |

### Field types (`objectFields`)

| `fieldType` | `DBType` | Notes |
|---|---|---|
| `Text` | `String` | Short text, max 280 chars by default |
| `LongText` | `Clob` | Long text, no practical limit |
| `Integer` | `Integer` | |
| `LongInteger` | `Long` | |
| `Decimal` | `Double` | |
| `PrecisionDecimal` | `BigDecimal` | Use for financial values |
| `Boolean` | `Boolean` | |
| `Date` | `Date` | Date only (no time) — requires `timeStorage` |
| `DateTime` | `DateTime` | Date + time — requires `timeStorage` |
| `Picklist` | `String` | Controlled vocabulary via a Picklist definition |
| `Relationship` | — | Foreign key to another Object (see Relationships) |
| `Attachment` | — | Links to a Document Library file entry |

Common `objectFieldSettings` per type:

| Setting | Applies to | Description |
|---|---|---|
| `timeStorage` | `Date`, `DateTime` | `convertToUTC` or `useInputAsFormatted` |
| `indexedLanguageId` | `Text`, `LongText` only | Language for full-text indexing. **Do not set on `Date`/`DateTime`.** |
| `maxLength` | `Text` | Max character length |
| `showCounter` | `Text` | Show character counter in UI |

Important flags on each field:

| Flag | Default | Description |
|---|---|---|
| `required` | `false` | Reject entries missing this field |
| `indexed` | `false` | Create a DB index; enable for fields used in filters/sorts |
| `indexedAsKeyword` | `false` | Exact-match index (no tokenization) — for IDs, codes |
| `localized` | `false` | Store per-locale values |

## Relationships

Relationships connect two Object definitions.

| Type | Cardinality | API behavior |
|---|---|---|
| `ONE_TO_MANY` | One parent → many children | Adds a `<parentObjectName>Id` FK column on the child. Child entries expose a `nestedFields` param to embed the parent. |
| `MANY_TO_MANY` | Many ↔ many | Creates a join table. Both sides expose a relationship field in their API responses. |

**Lookup columns** (`objectRelationshipType: lookup`) embed the related entry's
fields directly in the parent response. Use for read-heavy denormalized access.

**Relationship columns** create a navigable link without embedding. Use when the
related entry is large or rarely needed in context.

## Auto-generated REST API

Publishing an Object definition immediately creates a versioned REST API:

```
/o/c/<objectNamePluralKebabCase>/v1.0/
```

Example — Object named `CustomerRequest`, plural `customerRequests`:

```bash
# bash/zsh (requires jq)
PORTAL_URL="$(ldev context --json | jq -r '.liferay.portalUrl')"

# List entries
curl -s -H "Authorization: Bearer <token>" \
  "$PORTAL_URL/o/c/customerrequests/v1.0/"

# Create entry with OAuth2 Bearer auth
curl -s -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  "$PORTAL_URL/o/c/customerrequests/v1.0/" \
  -d '{"fieldName": "value"}'

# Get by ID
curl -s -H "Authorization: Bearer <token>" \
  "$PORTAL_URL/o/c/customerrequests/v1.0/<id>"
```

```powershell
$PortalUrl = (ldev context --json | ConvertFrom-Json).liferay.portalUrl
curl.exe -s -H "Authorization: Bearer <token>" "$PortalUrl/o/c/customerrequests/v1.0/"
curl.exe -s -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" "$PortalUrl/o/c/customerrequests/v1.0/" -d '{"fieldName": "value"}'
curl.exe -s -H "Authorization: Bearer <token>" "$PortalUrl/o/c/customerrequests/v1.0/<id>"
```

Discover available Object APIs from the running portal:

```bash
# bash/zsh (requires jq)
ldev mcp openapis --json | jq -r '.[] | select(.name | test("^c/")) | .name'
```

```powershell
(ldev mcp openapis --json | ConvertFrom-Json) |
  Where-Object { $_.name -match '^c/' } |
  Select-Object -ExpandProperty name
```

### Pagination

All list endpoints support:

| Param | Description |
|---|---|
| `page` | 1-indexed page number |
| `pageSize` | Items per page (default 20, max 200) |
| `totalCount` | Returned in the response — total matching entries |
| `lastPage` | Returned in the response — last available page |

### Filtering and sorting

| Param | Example | Notes |
|---|---|---|
| `filter` | `status eq 'approved'` | OData-style filter expressions |
| `search` | `search=keyword` | Full-text search across indexed fields |
| `sort` | `sort=dateCreated:desc` | Field name + `:asc` or `:desc` |
| `nestedFields` | `nestedFields=relatedObjectName` | Embed related Object entries inline |

Discover the exact supported fields and operations from the running portal
before scripting against them:

```bash
# bash/zsh (requires jq)
ldev mcp openapis --json | jq -r '.[] | select(.name | test("object|^c/"; "i")) | .name'
```

```powershell
(ldev mcp openapis --json | ConvertFrom-Json) |
  Where-Object { $_.name -match 'object|^c/' } |
  Select-Object -ExpandProperty name
```

## Object Actions

Actions run automatically when an Object entry event occurs.

| Trigger | When it fires |
|---|---|
| `onAfterAdd` | Entry is created |
| `onAfterUpdate` | Entry is updated |
| `onAfterDelete` | Entry is deleted |
| `standalone` | Triggered manually or via API — not automatic |

Action types:

- **Notification** — send an email or user notification
- **Webhook** — HTTP POST to an external URL with the entry payload
- **Groovy Script** — run a server-side Groovy script

## Object Validations

Validations run before save and reject entries that fail.

- **Expression** — OData filter expression evaluated against the entry fields
- **Groovy Script** — custom server-side logic

A validation failure returns `400 Bad Request` with the validation error message.

## Workflow on Objects

To put Object entries through an approval workflow:

1. Create a workflow definition in **Process Builder** (Control Panel).
2. Assign it to the Object via **Process Builder → Configuration**, selecting the
   Object class and site scope.

Once assigned, new entries are created as `PENDING` and must be approved before
they appear in the default API response. Filter by `status`:

```bash
# Only approved entries (default)
/o/c/customerrequests/v1.0/?filter=status eq 'approved'

# Pending entries
/o/c/customerrequests/v1.0/?filter=status eq 'pending'
```

See `references/workflow.md` for inspection and approval flows.

## Canonical modern pattern

**Batch CX defines Object → headless OAuth → custom element CX writes entries**

1. A batch Client Extension (`.client-extension-config.json` with `type: batch`)
   defines the Object schema declaratively — it is deployed and applied
   automatically on `ldev start`.
2. The portal generates the headless API for the Object.
3. A custom element Client Extension (React/Vue) uses
   `Liferay.Util.fetch` inside the portal — or a Bearer token obtained via
   `ldev oauth install --write-env` outside the portal — to create/read entries.

This pattern avoids traditional OSGi modules for custom data modeling entirely.

## Common failure causes

| Symptom | Likely cause |
|---|---|
| `404` on `/o/c/<plural>/v1.0/` | Object definition is not `published`, or the plural label does not match the URL segment |
| Entry saved but does not appear in API response | Workflow is active — entry is `PENDING`; approve it or remove the workflow |
| `400` on create | Required field missing, validation failed, or `indexedLanguageId` set on a non-text field |
| `403` on API call | OAuth2 token lacks `Liferay.Object.Admin.everything` or the equivalent read/write scope |
| Relationship field missing from response | Add `nestedFields=<relationshipName>` to the query |
