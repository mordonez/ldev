# Site Building: Content And Pages

Use this reference when the task is editing structured content values, proving a
new data shape against a real article, or changing site pages that are not yet
covered by a dedicated `ldev` mutation command.

## Contents

- Default Mutation Order
- Structured Content (discovery, runtime-proven update matrix, proven payload patterns for PATCH and PUT)
- Site Pages
- Auth Triage

## Default Mutation Order

1. Discover with `ldev portal inventory ... --json`.
2. Prefer OAuth-backed Headless APIs for the actual mutation.
3. Read the changed entity back over the same API.
4. Use browser automation only when the runtime exposes no stable headless mutation path,
   or when the final proof must be visual.

This keeps the Red -> Green loop faster and less brittle than page-editor UI
automation.

## Structured Content

For display-page-backed Journal content, start from the page URL instead of
guessing IDs:

```bash
ldev portal inventory page --url <fullUrl> --full --json
```

Read these fields from the inventory result:

- `article.id` / `article.key`
- `article.structureKey`
- `full.articleDetails.contentFields`
- `full.contentStructures[].exportPath`

Then use Headless Delivery to read and update the live item. Resolve the portal
URL from `ldev context --json`; do not hardcode it.

Typical flow:

```text
GET /o/headless-delivery/v1.0/structured-contents/{structuredContentId}
PATCH /o/headless-delivery/v1.0/structured-contents/{structuredContentId}
GET /o/headless-delivery/v1.0/structured-contents/{structuredContentId}
```

In current DXP runtimes, do not assume `PATCH` is a true one-field delta. The
runtime OpenAPI commonly uses the `StructuredContent` schema for both `PATCH`
and `PUT`, which means the request must still include:

- `contentStructureId`
- `title`
- every required structure field needed by validation, such as `titulo`

Practical rule: start from the live `GET`, keep only the required field payloads
plus the field you want to change, and avoid echoing unrelated fieldset trees
unless the runtime proves they are accepted.

### Runtime-Proven Update Matrix

Validated against a real local DXP runtime. Treat this as an observed behavior
matrix, not as a contract tied to one project or one content item:

| Field | Location | Verified method | Result |
|---|---|---|---|
| Required top-level text field | top-level | `PATCH` | works |
| Top-level image field | top-level image | `PATCH` | works with `contentFieldValue.image = <ContentDocument>` |
| Top-level rich text field | top-level | `PATCH` | works |
| Top-level URL/string field | top-level | `PATCH` | works |
| Top-level boolean field | top-level | `PATCH` | works |
| Nested text field inside a fieldset | nested under repeatable fieldset | `PUT` | works |
| Nested long-text field inside a fieldset | nested under repeatable fieldset | `PUT` | works |
| Nested YouTube/string field inside a fieldset | nested under repeatable fieldset | `PUT` | works |
| Nested image field inside a fieldset | nested under repeatable fieldset | `PUT` | request succeeds but the image payload can still be dropped on read-back |

This means "all content" is not one uniform path in practice. In the validated
runtime:

- top-level fields are safely mutable with `PATCH`
- nested multimedia text fields are only proven with `PUT`
- nested image fields are not yet reliable headless mutation targets even when the schema suggests they should be

Treat that last case as a runtime limitation or bug until a concrete payload is
proven by read-back in the target environment.

Guardrails:

- Reuse the existing `contentFields` shape from the live entity; mutate the
  smallest possible subset.
- Match `name` / `fieldReference` values from the runtime payload or exported
  structure, not from memory.
- If a minimal `PATCH` returns `400` naming a missing field, add that required
  field from the live payload and retry. This is a schema-validation hint, not
  an auth failure.
- If OpenAPI says `PATCH` is partial but the runtime rejects or corrupts nested
  fieldset updates, verify the same payload with `PUT`. The OpenAPI contract is
  not sufficient proof of real runtime behavior.
- If a `PATCH` returns `500`, stop and compare the payload against the runtime
  OpenAPI plus the live entity shape. Treat that as a payload defect unless the
  response proves an auth failure.
- For nested image fields, require read-back proof of the `image` payload. A
  `200` or `204` is not enough if the field comes back empty.
- After the API write succeeds, finish with rendered proof: direct rendered
  content, display page HTML, or browser validation.

## Proven Payload Patterns

### Top-level Fields Via `PATCH`

```json
{
  "contentStructureId": <contentStructureId>,
  "title": "<existing structured-content title>",
  "contentFields": [
    {"name": "<requiredTopLevelTextField>", "contentFieldValue": {"data": "New title or required text"}},
    {"name": "<topLevelImageField>", "contentFieldValue": {"image": {"id": <documentId>, "contentType": "Document", "contentUrl": "/documents/...", "encodingFormat": "image/jpeg", "fileExtension": "jpg", "sizeInBytes": 197719, "title": "<document title>", "description": ""}}},
    {"name": "<topLevelRichTextField>", "contentFieldValue": {"data": "<p>New HTML</p>"}},
    {"name": "<topLevelUrlField>", "contentFieldValue": {"data": "https://example.org/resource"}},
    {"name": "<topLevelBooleanField>", "contentFieldValue": {"data": "true"}}
  ]
}
```

Use this pattern for any top-level field set the runtime already accepts through
`PATCH`. Resolve the actual field names from the live `GET` response or the
exported structure.

### Nested Fieldset Values Via `PUT`

```json
{
  "contentStructureId": <contentStructureId>,
  "title": "<existing structured-content title>",
  "contentFields": [
    {"name": "<requiredTopLevelTextField>", "contentFieldValue": {"data": "<required existing value>"}},
    {
      "name": "<fieldsetRoot>",
      "nestedContentFields": [
        {"name": "<fieldsetMarkerOrWrapper>", "contentFieldValue": {}},
        {
          "name": "<repeatableFieldsetRow>",
          "nestedContentFields": [
            {"name": "<nestedTextField>", "contentFieldValue": {"data": "Card title"}},
            {"name": "<nestedLongTextField>", "contentFieldValue": {"data": "Card text"}},
            {"name": "<nestedVideoOrUrlField>", "contentFieldValue": {"data": "https://www.youtube.com/watch?v=<video-id>"}}
          ]
        }
      ]
    }
  ]
}
```

When attempting a nested image field, use the same `ContentDocument` shape as
the working top-level image field, then verify whether `GET` actually returns
it. In the validated runtime above, the request succeeded but read-back still
returned an empty `contentFieldValue` for the nested image field.

## Site Pages

`ldev` already gives the safest discovery surface:

```bash
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --full --json
```

For mutations, use the runtime API explorer before guessing paths:

```text
<portalUrl>/o/api
<portalUrl>/o/headless-admin-site/v1.0/openapi.json
```

The exact site pages operations vary by bundle/update level, so confirm the
current runtime contract first. The required OAuth scope is
`Liferay.Headless.Admin.Site.everything.write`.

Use browser automation for site pages only when one of these is true:

- the runtime exposes no stable headless mutation path for the needed page action
- the operation is inherently editor-only
- the task needs final visual proof after a successful headless mutation

## Auth Triage

Before blaming the payload, classify the failure:

- `401 Unauthorized`: refresh credentials or token
- `403 Forbidden`: missing scope or portal role
- `500 Internal Server Error`: likely bad payload shape, unsupported field,
  or runtime defect

For agentic local work, `ldev oauth install --write-env` should be the default
bootstrap. If content/page mutations still return `403`, inspect the installed
OAuth scopes before switching to UI automation.