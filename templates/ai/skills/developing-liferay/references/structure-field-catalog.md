# Journal Structure Field Catalog

Use this reference when **authoring or editing a structure JSON file** from scratch
or when modifying existing fields. Every structure lives under
`liferay/resources/journal/structures/<site>/<STRUCTURE_KEY>.json`.

Always export the current version from the portal before editing:

```bash
ldev resource export-structure --site /<site> --structure <STRUCTURE_KEY>
```

Validate before mutating:

```bash
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY> --check-only
```

## FTL field accessor patterns

Before writing any new FreeMarker template logic or DDM field accessor, grep
the repository for the canonical pattern used for that field type:

```bash
# Find how the repo reads boolean or checkbox DDM fields
grep -rE "getterUtil|getData|has_content" . --include="*.ftl" -l
grep -rE "getterUtil" . --include="*.ftl" -n | head -20

# Find existing examples for a specific field name
grep -rE "<DDM_FIELD_NAME>" . --include="*.ftl" -n
```

Do not invent a new accessor pattern. Copy the dominant pattern from existing files.

**Critical pitfall — boolean/checkbox fields:**
Using `?has_content` on a boolean DDM field returns `true` even when the field
value is `false`, because the string `"false"` is non-empty.

```freemarker
<#-- WRONG: always true even when checkbox is unchecked -->
<#if myBooleanField?has_content>...</#if>

<#-- CORRECT: use getterUtil.getBoolean to read boolean DDM fields -->
<#if getterUtil.getBoolean(myBooleanField.getData())>...</#if>
```

Apply `getterUtil.getBoolean(fieldVar.getData())` for any `checkbox` or
`boolean` field type.

---

## Top-level skeleton

```json
{
  "availableLanguageIds": ["ca_ES"],
  "contentType": "journal",
  "dataDefinitionFields": [],
  "dataDefinitionKey": "UB_STR_MY_STRUCTURE",
  "defaultDataLayout": { ... },
  "defaultLanguageId": "ca_ES",
  "description": { "ca_ES": "Human-readable description" },
  "name": { "ca_ES": "UB_STR_MY_STRUCTURE" },
  "storageType": "default"
}
```

---

## Common field skeleton

Every field shares this shape. Only `customProperties` varies by type.

```json
{
  "customProperties": { ... },
  "defaultValue": { "ca_ES": "" },
  "fieldType": "<see table>",
  "indexType": "keyword",
  "indexable": true,
  "label": { "ca_ES": "Field label" },
  "localizable": true,
  "name": "FieldName",
  "nestedDataDefinitionFields": [],
  "readOnly": false,
  "repeatable": false,
  "required": false,
  "showLabel": true,
  "tip": { "ca_ES": "" }
}
```

**Naming convention:** use `PascalCase` without numeric suffixes (e.g. `Title`, `PublishDate`,
`CategorySelect`). Liferay appends random digits when creating via UI — those are UI artefacts,
not a naming rule.

**`fieldReference`** inside `customProperties` must match the `name` value.

---

## Field type table

| `fieldType`        | `dataType`         | `indexType` | `localizable` | Notes                               |
|--------------------|--------------------|-------------|---------------|-------------------------------------|
| `text`             | `string`           | `keyword`   | `true`        | singleline or multiline             |
| `select`           | `string`           | `keyword`   | `true`        | single or multi-value               |
| `radio`            | `string`           | `keyword`   | `true`        | single-choice, inline option        |
| `grid`             | `string`           | `keyword`   | `true`        | matrix with rows + columns          |
| `checkbox`         | `boolean`          | `keyword`   | `true`        | single toggle, `defaultValue: ["false"]` |
| `numeric`          | `integer`/`double` | `keyword`   | `true`        | `dataType` decides int vs decimal   |
| `date`             | `date`             | `keyword`   | `true`        |                                     |
| `date_time`        | `datetime`         | `keyword`   | **`false`**   | `rulesActionDisabled: true`         |
| `rich_text`        | `string`           | **`text`**  | `true`        | omit `editorConfig` — portal fills it |
| `image`            | `image`            | **`text`**  | `true`        | `requiredDescription` controls alt-text |
| `document_library` | `document-library` | `keyword`   | `true`        |                                     |
| `journal_article`  | `journal-article`  | `keyword`   | `true`        |                                     |
| `link_to_layout`   | `link-to-page`     | `keyword`   | `true`        |                                     |
| `color`            | `string`           | `keyword`   | `true`        |                                     |
| `geolocation`      | `geolocation`      | `keyword`   | `true`        |                                     |
| `separator`        | `""`               | —           | **`false`**   | `indexable: false`                  |

---

## customProperties per type

### text

```json
{
  "dataType": "string",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "labelAtStructureLevel": true,
  "nativeField": false,
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "displayStyle": "singleline",
  "placeholder": { "ca_ES": "" },
  "hideField": false,
  "autocomplete": false,
  "requireConfirmation": false
}
```

`displayStyle`: `"singleline"` | `"multiline"`. Use `"multiline"` for long free text.

---

### select

```json
{
  "dataType": "string",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "dataSourceType": ["manual"],
  "multiple": false,
  "alphabeticalOrder": false,
  "options": {
    "ca_ES": [
      { "reference": "Option1", "label": "Option 1", "value": "Option1" },
      { "reference": "Option2", "label": "Option 2", "value": "Option2" }
    ]
  }
}
```

Set `"multiple": true` for multi-value selects. `defaultValue` becomes `[]` when multiple.

---

### radio

```json
{
  "dataType": "string",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "inline": true,
  "options": {
    "ca_ES": [
      { "reference": "OptionA", "label": "Option A", "value": "OptionA" }
    ]
  }
}
```

`"inline": true` renders options horizontally.

---

### grid

```json
{
  "dataType": "string",
  "fieldReference": "FieldName",
  "columns": {
    "ca_ES": [
      { "reference": "Col1", "label": "Column 1", "value": "Col1" }
    ]
  },
  "rows": {
    "ca_ES": [
      { "reference": "Row1", "label": "Row 1", "value": "Row1" }
    ]
  }
}
```

---

### checkbox

```json
{
  "dataType": "boolean",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "labelAtStructureLevel": true,
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "options": {},
  "showAsSwitcher": true
}
```

`defaultValue` must be `{ "ca_ES": ["false"] }` (array of string, not boolean).

---

### numeric

```json
{
  "dataType": "integer",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "labelAtStructureLevel": true,
  "nativeField": false,
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "inputMask": false,
  "characterOptions": false,
  "placeholder": { "ca_ES": "" },
  "hideField": false
}
```

Use `"dataType": "double"` for decimal values.

---

### date

```json
{
  "dataType": "date",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "labelAtStructureLevel": true,
  "nativeField": false,
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "htmlAutocompleteAttribute": ""
}
```

---

### date_time

```json
{
  "dataType": "datetime",
  "fieldReference": "FieldName",
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "rulesActionDisabled": true
}
```

`localizable` must be `false`. `visibilityExpression` and `fieldNamespace` are omitted.

---

### rich_text

```json
{
  "dataType": "string",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": ""
}
```

**Do not include `editorConfig`.** The portal injects the correct CKEditor config at
runtime based on the site theme. A hardcoded `editorConfig` contains site-specific
file browser URLs and toolbar presets that break in other environments.

---

### image

```json
{
  "dataType": "image",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "requiredDescription": false
}
```

`"requiredDescription": true` enforces alt-text entry. `defaultValue` is `{ "ca_ES": {} }`.

---

### document_library

```json
{
  "dataType": "document-library",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "labelAtStructureLevel": true,
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": "",
  "allowGuestUsers": false
}
```

---

### journal_article

```json
{
  "dataType": "journal-article",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "visibilityExpression": ""
}
```

No `objectFieldName`, no `requiredErrorMessage` at the top level.

---

### link_to_layout

```json
{
  "dataType": "link-to-page",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "visibilityExpression": ""
}
```

---

### color

```json
{
  "dataType": "string",
  "fieldReference": "FieldName",
  "fieldNamespace": "",
  "objectFieldName": "",
  "requiredErrorMessage": { "ca_ES": "" },
  "visibilityExpression": ""
}
```

---

### geolocation

```json
{
  "dataType": "geolocation",
  "fieldReference": "FieldName"
}
```

Minimal properties — no `fieldNamespace`, `objectFieldName`, or `visibilityExpression`.

---

### separator

```json
{
  "dataType": "",
  "fieldReference": "FieldName",
  "rulesConditionDisabled": true,
  "style": { "ca_ES": "" }
}
```

Must have `"indexable": false` and `"localizable": false` on the field root.

---

## Nested fields (fieldset)

Use `nestedDataDefinitionFields` to group fields under a parent. The parent field
uses `fieldType: "fieldset"` and nests the children inline:

```json
{
  "customProperties": {
    "dataType": "",
    "fieldReference": "MyGroup",
    "rows": [
      { "columns": [{ "fields": ["ChildField1"], "size": 12 }] }
    ],
    "upgradeDataDefinition": false,
    "visibilityExpression": ""
  },
  "fieldType": "fieldset",
  "indexable": false,
  "label": { "ca_ES": "Group label" },
  "localizable": false,
  "name": "MyGroup",
  "nestedDataDefinitionFields": [
    { ... child field definition ... }
  ],
  "repeatable": false
}
```

---

## defaultDataLayout skeleton

Every structure must include `defaultDataLayout`. Each field must appear in exactly
one `fieldNames` array.

```json
"defaultDataLayout": {
  "dataLayoutFields": {},
  "dataLayoutPages": [
    {
      "dataLayoutRows": [
        {
          "dataLayoutColumns": [
            { "columnSize": 12, "fieldNames": ["Field1"] }
          ]
        },
        {
          "dataLayoutColumns": [
            { "columnSize": 6, "fieldNames": ["Field2"] },
            { "columnSize": 6, "fieldNames": ["Field3"] }
          ]
        }
      ],
      "description": { "ca_ES": "" },
      "title": { "ca_ES": "" }
    }
  ],
  "dataRules": [],
  "description": { "ca_ES": "Layout description" },
  "name": { "ca_ES": "STRUCTURE_KEY" },
  "paginationMode": "single-page"
}
```

`columnSize` values in a row must sum to 12.

---

## Guardrails

- Never copy `editorConfig` from an export — it contains site-specific URLs.
- `fieldReference` inside `customProperties` must equal the field `name`.
- Every field in `dataDefinitionFields` must appear in the layout `fieldNames`.
- `date_time` must have `localizable: false`.
- `separator` must have `indexable: false` and `localizable: false`.
- Do not use auto-generated numeric suffixes in `name` — use meaningful PascalCase names.
