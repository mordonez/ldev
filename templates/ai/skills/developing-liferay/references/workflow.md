# Workflow / Process Builder

Use this reference when a Journal Article or other asset is not publishing as
expected, or when you need to inspect, assign, or remove an approval workflow.

This file is intentionally conservative. Use the portal UI and `ldev` discovery
first. Only script workflow APIs after discovering the exact surface exposed by
the current runtime.

## Article in workflow vs. ready to publish

A Journal Article can be in one of four common states that affect visibility:

| Status | Meaning |
|---|---|
| `DRAFT` | Saved but not submitted for approval. Not visible to guests. |
| `PENDING` | Submitted and waiting for workflow approval. Not yet published. |
| `APPROVED` | Approved and published. Visible to users with access. |
| `EXPIRED` | Past its display date. No longer visible, but still exists. |

An article that was imported or created via headless API lands as `APPROVED`
only when **no workflow is assigned** to that structure or folder. If a workflow
is active, the import creates it as `PENDING` — it will not appear published
even though the API call succeeded without errors.

## Inspect workflow state safely

Start with `ldev` discovery and the portal UI:

```bash
ldev portal inventory sites --json
ldev portal inventory page --url <fullUrl> --json
ldev context --json
```

Then verify the workflow and content state in the portal:

1. Open the affected site or asset in the UI.
2. Check whether the content is `DRAFT`, `PENDING`, `APPROVED`, or `EXPIRED`.
3. If it is `PENDING`, inspect **My Workflow Tasks** or **Process Builder**.
4. If the page still does not show the content, verify page mapping and site
   access, not just the asset status.

If MCP is available, discover workflow-related OpenAPI surfaces before writing
curl examples:

```bash
ldev mcp check --json
ldev mcp openapis --json | jq '.[] | select(.name | test("workflow|structured-content"; "i")) | .name'
```

## Check which workflow is assigned to an asset class

Workflows are assigned per asset class (e.g. Journal Article) per site. To
inspect the current assignment from the portal UI:

1. Control Panel → Process Builder → Configuration
2. Select the site and asset class to see the active workflow definition.
3. Use the UI as the source of truth unless you have already confirmed the
   relevant workflow API in the current runtime.

## Assign or remove a workflow from an asset class

Assigning and removing workflows requires a UI action or a direct API call to
the workflow administration endpoints. The most reliable approach is the UI:

1. Control Panel → Process Builder → Configuration
2. Choose the site scope.
3. Set the workflow to **No Workflow** to disable, or select a definition to
   enable it.

If you need to script this, first discover the exact workflow OpenAPI exposed by
the current runtime with `ldev mcp openapis --json`. Do not assume a specific
endpoint name or payload shape without that verification.

## Why an article does not appear published after import

Common causes, in order of likelihood:

1. **Workflow is active for the structure or folder** — the import created the
   article as `PENDING`. Approve it manually or remove the workflow assignment.

2. **Article was imported or created as `DRAFT`** — verify the actual content
   status in the portal before assuming the import failed.

3. **Display date is in the future or past** — check `displayDate` and
   `expirationDate` fields in the API response.

4. **Page or Display Page Template does not include the article** — the article
   is published but not mapped to any page. Verify with:

   ```bash
   ldev portal inventory page --url /web/<site>/<page> --json
   ```

5. **Site permissions** — the article is published but the viewing user lacks
   access to the site or page. See the permissions reference when available.

## Approval strategy

For a local unblock, prefer the portal UI:

1. Open **My Workflow Tasks**.
2. Review the pending item.
3. Approve or reject it there.

If the task must be automated, discover the workflow task API from MCP first
and only then script it with OAuth2 or another verified auth flow.

## Guardrails

- Do not assume a successful API import means the article is published — always
  verify `statusCode` after import when a workflow may be active.
- Do not remove a workflow assignment from a production site to unblock a single
  import; approve or reject the pending task instead.
- Use `ldev context --json` to resolve `liferay.portalUrl` and auth readiness before
  attempting scripted workflow calls.
