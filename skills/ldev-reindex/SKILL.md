---
name: ldev-reindex
description: 'Guides the readiness check, monitoring, and verification steps around a Liferay Elasticsearch reindex. Use when search results are stale, after importing a DB, after content migration, or when the user reports that search is not finding recently imported content.'
---

# Reindex Guidance

The reindex itself must be triggered by a human from the Liferay UI. This skill covers the surrounding steps: confirming readiness, asking the human to trigger, and verifying completion.

## Hard Boundary

`ldev` does not trigger a Liferay reindex. Do not instruct agents or scripts to start a reindex. The only supported trigger is a manual action in the Liferay Control Panel by a human.

## Bootstrap

```bash
ldev ai bootstrap --intent=troubleshoot --json
```

Inspect: `context.liferay.portalUrl` and `doctor.readiness.runtime`.

## 1. Check Readiness Before Asking For Reindex

```bash
ldev status --json
ldev doctor --portal --json
ldev logs diagnose --since 10m --json
```

Confirm both the portal and Elasticsearch are healthy before asking the user to trigger reindex. If either is unhealthy, resolve that first.

## 2. Ask the Human to Trigger From UI

Tell the user to go to:

**Control Panel → Configuration → Search → Index Actions**

Then select the appropriate index action for the affected content type (e.g., Journal Articles, Liferay Assets, or All).

## 3. Verify After Reindex

Once the user confirms reindex has completed:

```bash
ldev portal check --json
ldev logs diagnose --since 10m --json
```

Then validate the affected search result or page behavior in the browser.

## Done When

The affected content appears correctly in search results or Asset Publisher, and logs show no fresh indexing errors.

## Guardrails

- Do not claim reindex was executed by `ldev`.
- Do not assume clicking reindex means indexing completed — verify affected search behavior.
- If the issue persists after reindex, continue diagnosis with `troubleshooting-liferay`.
