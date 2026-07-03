# Site Initializer: field notes from a real build-and-debug session

Captured from building a complete news section (structures, DDM templates,
fragments, dynamic collections, listing/category pages, a Display Page
Template, and a Style Book) as a Site Initializer client extension against
`liferay/dxp:2026.q1.0-lts`, entirely code-driven (no manual UI assembly for
the structural setup), then debugging why the rendered pages didn't match
what was declared.

This is not official Liferay documentation. Everything below was verified
directly against portal logs, the Page Editor DOM, and
`liferay-portal`/`liferay-portal-ee` source (mainly
`BundleSiteInitializer.java` and `JournalArticleInfoItemFields.java`) during
that session — treat it as ground truth for this Liferay version, not as a
guarantee for others.

## 1. Site Initializers are effectively create-only

Verified by reading `com.liferay.site.initializer.extender.internal.BundleSiteInitializer`
and testing all three trigger paths against a real portal:

| Trigger | Re-runs `BundleSiteInitializer#initialize`? |
| --- | --- |
| `./gradlew deploy` (OSGi client extension deploy) | Only on first-ever deploy against an instance with no matching site (auto-create). Does nothing on redeploy against an existing site. |
| `PUT /o/headless-admin-site/v1.0/sites/{ERC}/site-initializer` | **No.** Only updates the `Site` entity's own fields from the `site` JSON part. No `BundleSiteInitializer` log line appears. |
| `POST /o/headless-admin-site/v1.0/sites/site-initializer` (new site) | **Yes.** Confirmed via `Initializing <name> for group <id>` ... `Initialized <name> for group <id> in <n> ms` log lines, one line per `addOrUpdate*`/`add*` task. |

Practical consequence: changing `layouts/`, `asset-list-entries.json`,
`layout-page-templates/`, or `style-books/` and wanting it live requires
deleting and recreating the site (`DELETE .../sites/{ERC}` then
`POST .../sites/site-initializer`). There is no supported "re-apply changed
assets to an existing site" flow for those asset types via the Site
Initializer mechanism itself.

**Tooling gap for `ldev`:** a `ldev resource site-initializer recreate
--site <ERC>` command that does delete+recreate atomically (with a
confirmation prompt, since it is destructive to any real content in that
site) would remove a very error-prone manual sequence (get the site JSON
right, DELETE, build the zip, multipart POST, tail logs for
`Initialized ... in`). Also useful: a `--dry-run` that validates the zip's
JSON files (see section 5) before touching the portal.

## 2. `page-definition.json`: the undocumented but load-bearing `"type": "Root"`

The top-level `pageElement` in every `layouts/<page>/page-definition.json`
and `layout-page-templates/display-page-templates/<key>/page-definition.json`
**must** have `"type": "Root"`:

```json
{ "pageElement": { "pageElements": [ ... ], "type": "Root" } }
```

Omit it and the page is created with the right layout/name, deploys without
any error or warning, and renders as a completely empty shell (or "Drag and
drop fragments or widgets here" in the editor) — there is no log line, no
exception, nothing pointing at the cause. Only found by diffing against
`liferay-portal`'s own bundled `site-initializer-team-extranet` example
JSON byte-for-byte.

**Tooling gap:** a `page-definition.json` linter (`ldev resource
lint-page-definition <file>`) that flags this, plus the other footguns
below, before you waste a deploy cycle finding out at runtime.

## 3. Reserved `JournalArticle` Info Item field names shadow custom DDM fields

Ground truth: `com.liferay.journal.web.internal.info.item.JournalArticleInfoItemFields`.

- The article's own title must be mapped with `"fieldKey": "title"`
  (lowercase). `"Title"` is *not* the reserved key — it silently fails to
  resolve and the fragment falls back to rendering its own raw,
  unprocessed editable HTML as escaped text in that slot. (The
  capitalized form shows up in some of Liferay's own bundled examples only
  because in those examples it happens to be a genuinely custom field
  named `Title`, not the reserved title.)
- A custom DDM structure field sharing a name with one of these reserved
  Info Item fields gets silently shadowed by the reserved one in
  `CollectionItem`/`DisplayPageItem` mappings — the custom field's real
  value is invisible; you get the reserved field's built-in value instead
  (e.g. the *logged-in user's* name, not your custom "author" text field).
  Full reserved list: `authorName`, `authorProfileImage`, `createDate`,
  `description`, `displayDate`, `expirationDate`, `lastEditorName`,
  `lastEditorProfileImage`, `modifiedDate`, `previewImage`, `publishDate`,
  `smallImage`, `title`.

**Tooling gap:** the same lint command from section 2 could flag any
`ddm-structures/*.xml` field `name` that collides with this reserved list,
and any `fragmentFields[].value.text.mapping.fieldKey` of `"Title"`
(capitalized) as a likely mistake.

## 4. Nested editables inside another editable are invisible — and the fix differs by content type

This was the deepest and most time-consuric bug of the whole session. Two
fragments (`news-card`, `news-featured-card`) had a title and a hero image
each wrapped in their own link, e.g.:

```html
<a data-lfr-editable-id="news-card-link" data-lfr-editable-type="link" href="#">
  <img data-lfr-editable-id="news-card-image" data-lfr-editable-type="image" ... />
</a>
<a data-lfr-editable-id="news-card-title-link" data-lfr-editable-type="link" href="#">
  <span data-lfr-editable-id="news-card-title" data-lfr-editable-type="text">...</span>
</a>
```

**Diagnosis method that actually worked:** stop guessing from bundled
examples and inspect the live Page Editor DOM directly —
`document.querySelectorAll('.page-editor__editable')` while editing the
page. This reveals the *real, addressable* editable set. In this case it
returned only `news-card-link`, `news-card-title-link`, plus the
non-nested `news-card-date`/`news-card-summary`/`news-card-read-link` —
**never** `news-card-image` or `news-card-title`. Anything nested inside
another editable's DOM subtree is not independently addressable, full
stop, regardless of what `fragmentFields` you declare for it in
`page-definition.json` (those inner-id mappings are accepted at deploy
time with zero warning, and simply do nothing at render time).

The fix differs by what's nested:

- **Text nested inside a link** (title-in-link): map `text` *and*
  `fragmentLink` together on the *outer* link editable's id, and drop the
  inner id from `fragmentFields` entirely:
  ```json
  {
    "id": "news-card-title-link",
    "value": {
      "text": { "mapping": { "fieldKey": "title", "itemReference": { "contextSource": "CollectionItem" } } },
      "fragmentLink": { "value": { "href": { "mapping": { "fieldKey": "displayPageURL", "itemReference": { "contextSource": "CollectionItem" } } } } }
    }
  }
  ```
  This works because a `link`-type editable can carry text content.

- **Image nested inside a link** (image-in-link): the same trick does
  *not* work. A `link`-type editable does not accept a `fragmentImage`
  payload — it silently renders nothing (worse than the text case: with
  text nested inside a link, at least the raw fragment source degrades to
  visible-but-wrong garbage; combining `fragmentImage` + `fragmentLink` on
  a link-type editable made the whole collection item disappear with zero
  server-side exception logged). The only fix that actually worked was
  editing the **fragment's own HTML** to remove the wrapping `<a>` so the
  `<img>` becomes a real, non-nested, top-level `image`-type editable:
  ```html
  <!-- before (broken): -->
  <a data-lfr-editable-id="news-card-link" data-lfr-editable-type="link" href="#">
    <img data-lfr-editable-id="news-card-image" data-lfr-editable-type="image" ... />
  </a>
  <!-- after (works): -->
  <div class="news-card__media-link">
    <img data-lfr-editable-id="news-card-image" data-lfr-editable-type="image" ... />
  </div>
  ```
  Trade-off: the image itself is no longer clickable on its own. In
  practice this is fine when the card's title and a "read more" link
  already make the whole card navigable.

**Tooling gap:** `ldev resource fragments lint <fragment-dir>` (or an
extension of an existing fragments command) that parses each `index.html`,
builds the editable tree, and flags any `data-lfr-editable-*` element
nested inside another one — with a specific warning that image-type
nesting under a link is unfixable via mapping alone and needs an HTML
change, while text-type nesting under a link is fixable via combined
mapping. This would have turned a multi-hour dead-end investigation into
an instant static-analysis warning.

## 5. `numberOfItems` vs `numberOfItemsPerPage` in Collection Display fragment config

Every real Liferay-authored example of a `Collection` page element sets
`"numberOfItems": 1` alongside a much larger `numberOfItemsPerPage`. It is
tempting (and was the actual mistake here) to copy that literally without
understanding what it does. In this build, `numberOfItems` acts as a hard
cap on the collection's total result count — leaving it at `1` while
`numberOfItemsPerPage: 9` silently limited every Collection Display on the
page to exactly one visible item, no matter how much real content existed
or how the `AssetListEntry` filter was scoped. There was no error, no
empty-state message beyond a legitimately-empty-looking single-item list —
it looked like a content or permissions problem, not a config problem.

Fix: set `numberOfItems` to the same value as `numberOfItemsPerPage` (or to
whatever true cap you actually want) rather than copying `1` from an
example.

**Tooling gap:** the same lint command could flag `numberOfItems <
numberOfItemsPerPage` as a likely copy-paste mistake worth a warning (not
an error — there may be legitimate cases for a small `numberOfItems`, but
it's rare enough to deserve a flag).

## 6. Content and documents created via headless APIs don't inherit default Guest View permission

Everything above concerns rendering. Separately: articles and document
library files created through `POST /o/headless-delivery/v1.0/sites/{id}/documents`
(and, per Liferay's general permission model, most other headless
create-resource calls) do **not** automatically get the same default
role-permission grants a UI-driven "Add" action would apply from the
containing folder's defaults. Concretely: 4 test images uploaded via the
headless Documents API rendered perfectly for a logged-in administrator
(who bypasses view-permission checks) but had literally no `src` attribute
in the HTML for an anonymous/Guest request — the Document Library admin UI
even has a "Not Visible to Guest Users" badge that flags this directly once
you know to look for it. The fix was a bulk Permissions action on the
uploaded files granting the `Guest` role's `View` permission.

Articles created the same way did already have `Guest` `View` checked in
this case (so this was specifically a Document Library / file-entry
behavior, not universal to every headless-created resource) — this is
worth re-verifying per resource type rather than assuming one finding
generalizes.

**Tooling gap:** a `ldev portal diagnose guest-visibility --site <ERC>`
(or an extension of whatever content-inspection command already exists)
that, for a given site, lists content/document resources where `Guest`
lacks `View` permission — this is exactly the kind of "looks broken in
prod, works fine when I'm logged in as admin" bug class that's expensive
to diagnose manually (it required comparing an authenticated Playwright
session against a raw anonymous `curl` to even notice) and cheap to detect
mechanically once you know the resource-permission API to query.

## 7. `ldev portal page-layout export` is genuinely useful for this class of bug

`ldev portal page-layout export --site <friendlyUrl>
--friendly-url <path>` (already exists) dumps the live page's actual stored
`fragmentFields` mapping as normalized JSON. This was the single most
useful diagnostic step in the whole session — it let me compare "what I
declared in the site initializer source" against "what Liferay actually
persisted and is rendering" without digging through the database. Worth
promoting/documenting more prominently; it deserves to be step one for any
"the page doesn't look right" investigation, before touching source files
at all.

## Suggested `ldev` follow-ups, roughly in priority order

1. `ldev resource lint-page-definition` — catches sections 2, 3, 5 (missing
   `"type": "Root"`, `"Title"` vs `"title"`, `numberOfItems` mismatch)
   statically, before any deploy.
2. `ldev resource fragments lint` — catches section 4 (nested editables)
   statically by parsing fragment HTML.
3. `ldev portal diagnose guest-visibility` — catches section 6 at runtime
   for an existing site.
4. `ldev resource site-initializer recreate` — wraps the delete+recreate
   dance from section 1 into one safe, confirmed command instead of a
   multi-step curl sequence every time.
