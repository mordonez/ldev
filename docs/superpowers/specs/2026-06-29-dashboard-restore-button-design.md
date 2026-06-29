# Dashboard: Restore Button with Confirmation Modal

**Date:** 2026-06-29
**Status:** Approved

## Problem

The dashboard "Recreate" button only force-recreates the Docker container while keeping existing data intact. There is no way to restore an environment from scratch (replacing all data from the main environment) without going to the CLI.

`ldev env restore` does this — it stops the environment, replaces all data directories from main (or BTRFS base), then exits. There is no dashboard equivalent.

## Goal

Add a "Restore" button to the dashboard's advanced actions menu that:
1. Shows a confirmation modal with a clear warning before proceeding
2. Calls `runEnvRestore` to replace all environment data from main
3. Calls `runEnvStart` afterwards to bring the environment back up
4. Appears for all worktrees that have an env (both main and worktrees — backend handles the BTRFS_BASE error for main if needed)

## Non-goals

- No changes to the "Recreate" button behavior
- No generic confirmation mechanism for other actions (YAGNI)
- No new CLI command (already exists as `ldev env restore`)

## Architecture

Follows the exact same pattern as the "Delete worktree" action:
- Button with `target: 'restore'` → `onRestore(name)` handler → modal state → POST to backend → queued task

## Backend Changes

### `dashboard-actions.json`
New entry:
```json
{
  "id": "restore",
  "key": "worktree-restore",
  "label": "Restoring environment for {worktree}",
  "method": "POST",
  "queueAction": "restore",
  "route": "/api/worktrees/{worktree}/env/restore",
  "taskKind": "env-restore"
}
```

### `dashboard-action-catalog.ts`
Add `'worktree-restore'` to the `DashboardOperationKey` union type.

### `dashboard-operation-routes.ts`
Add `'worktree-restore'` to `QUEUED_OPERATION_RUNNERS`:
- Import `runEnvRestore`, `formatEnvRestore` from `env-restore.js`
- Import `runEnvStart` from `env-start.js`
- Runner: call `runEnvRestore(config, {printer, signal})`, print result lines, then call `runEnvStart(config, {printer, signal})`

## Frontend Changes

### `actions.ts`
Add to `ACTION_BUTTONS`:
```ts
restore: {className: 'btn-ghost', label: 'Restore', target: 'restore'},
```

### `worktree-presentation.js`
Add `restore` button to `advancedActions` after `recreate`, conditioned on `wt.env`:
```js
worktreeButton('restore', {
  disabled: busyWorktree,
  label: busyWorktree ? busyLabel : 'Restore',
}),
```

### `worktree-card.jsx`
- Add `onRestore` prop to `WorktreeCard` and `MoreMenu`
- In `MoreMenu.dispatch`: handle `action.target === 'restore'` → `onRestore(wt.name)`
- Add `restore` to `ACTION_ICONS` using `IconRotateCcw` (same icon set as recreate)

### `dashboard-actions.jsx`
- Add `restoreModal: {name: string, busy: boolean} | null` state (initially `null`)
- Add `restoreWorktree(name)`: sets modal state to `{name, busy: false}`
- Add `confirmRestoreWorktree()`: sets `busy: true`, POSTs to `actionUrl(name, 'restore')`, closes modal on success, shows toast
- Add `RestoreWorktreeModal` component with:
  - Title: "Restore environment"
  - Subtitle: worktree name
  - Warning text: "This will replace all environment data (database, Liferay data, Elasticsearch, Document Library) with data from the main environment. The environment will restart automatically. This action cannot be undone."
  - Cancel button + "Restore environment" confirm button (styled as danger)
- Include `RestoreWorktreeModal` in `DashboardActionModals`
- Export `restoreModal`, `restoreWorktree`, `closeRestoreModal`, `confirmRestoreWorktree` from `useDashboardActions`
- Include `Boolean(restoreModal)` in `hasOpenModal`

### `app.jsx`
- Pass `onRestore={actions.restoreWorktree}` to `WorktreeCard`
- Pass `onRestore` to `DetailSheet` (and wire the close+open pattern like `onDelete`)

### `detail-sheet.jsx`
- Add `onRestore` prop
- Add Restore button in the Operations section (after Recreate, before Delete), conditioned on `wt.env`:
  ```jsx
  {wt.env && (
    <button class="btn" type="button"
      style={{color: 'var(--red)'}}
      onClick={() => { onClose(); onRestore(wt.name); }}>
      <IconRotateCcw size={14} />Restore
    </button>
  )}
  ```

## Modal Warning Text

```
This will replace all environment data (database, Liferay data, Elasticsearch,
Document Library) with data from the main environment. The environment will
restart automatically. This action cannot be undone.
```

## Error Handling

- If `runEnvRestore` throws (e.g., main env with no BTRFS_BASE), the task fails and the error appears in the Activity panel — same as any other failed queued task
- Frontend shows a toast on POST failure (same pattern as delete)
