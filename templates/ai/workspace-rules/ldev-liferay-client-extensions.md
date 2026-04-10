---

description: Shared Client Extension guidance for modern Liferay projects
globs: *
alwaysApply: false

---

# Liferay Client Extensions

- For 7.4+ / quarterly releases, prefer Client Extensions, Objects, and Fragments before reaching for traditional OSGi modules.
- A common beginner-friendly pattern is:
  - define an Object first
  - then create a custom element Client Extension that reads or writes Object entries
- Use the official Liferay samples as the source of truth when generating Client Extensions.

Critical implementation guidance:

- Prefer `Liferay.Util.fetch` when running inside the portal so CSRF tokens and session cookies are handled correctly.
- Use native `fetch` only as a fallback outside the portal.
- In batch object definitions:
  - `indexedLanguageId` is valid only for `String` or `Clob` DB types
  - do not set `indexedLanguageId` on `Date` or `DateTime`
  - `timeStorage` is required for `Date` and `DateTime` fields
  - common values are `convertToUTC` or `useInputAsFormatted`
- Batch imports do not define permissions. Apply permissions later in the UI or with the appropriate admin/API workflow.
- When OAuth is required for batch/object workflows, ensure the extension/app has the scopes needed for both batch and object administration use cases.

After deploying a Client Extension, verify it registered correctly by checking
for this log entry:

```
STARTED [extension-id]
```

This indicates Liferay processed the extension during startup. If the entry is
absent, the extension likely did not deploy correctly — check logs before
assuming a UI or configuration problem.

Recommended references:

- `liferay-learn` Client Extension documentation
- `https://github.com/liferay/liferay-portal/tree/master/workspaces/liferay-sample-workspace/client-extensions`

Project-type specific deploy and layout details belong to the active runtime model, not to this shared rule.
