# Resource Migration Pipeline

Migrate Journal structures safely when content already exists.

`ldev resource migration-pipeline` generates an explicit plan for structure changes (add/remove/rename fields) so migrations can be reviewed and tested before applying.

---

## When to Use This

Use for **high-risk structure changes** when content already exists:

- Remove fields from a structure
- Rename or reorganize fields
- Change field types

Use for teams that need:
- Explicit migration validation
- Staged rollout with testing
- Ability to rollback if needed

---

## Workflow

### 1. Design the Change

Modify the structure in Liferay UI or JSON:

```bash
ldev portal inventory structures --site /my-site --json
# Find the structure, note its key
```

Make changes either:
- **In UI**: Faster for first-pass design
- **In JSON**: If you prefer code-based approach

### 2. Generate Migration Plan

```bash
ldev resource migration-pipeline --site /my-site
```

This creates a migration descriptor showing:
- Which fields are changing (add/remove/rename)
- How many articles are affected
- Data transformation rules

### 3. Review and Test

```bash
# Create isolated worktree to test
ldev worktree setup --name migration-test --with-env
cd .worktrees/migration-test
ldev start

# Import production data and run migration
ldev db download
ldev db import
ldev resource migration-pipeline --site /my-site --run

# Verify results
ldev portal inventory page --url /web/my-site/article-page --json
```

### 4. Apply to Production

Once validated:

```bash
# Back in main environment
ldev resource migration-pipeline --site /my-site --run

# Verify
ldev portal check
ldev portal inventory structures --site /my-site
```

---

## Example

**Change**: Remove `legacy_field`, add `new_field`

```bash
ldev resource migration-pipeline --site /my-site
```

Output shows:
- 45 articles affected
- Field mapping plan
- Cleanup operations

Review, test in worktree, then apply.

---

## Migration Descriptor Format

The migration plan is stored in `liferay/resources/journal/migrations/`:

```json
{
  "site": "/my-site",
  "structure": "MY_STRUCTURE",
  "changes": [
    {
      "field": "legacy_field",
      "action": "remove",
      "cleanupSource": true
    },
    {
      "field": "new_field",
      "action": "add"
    }
  ],
  "affectedArticles": 45
}
```

---

## Best Practices

1. **Test first**: Always validate in a worktree with production data
2. **Review explicitly**: Check the generated migration plan before applying
3. **Small batches**: Migrate in stages if there are many articles
4. **Backup**: Ensure you can rollback if needed
5. **Version control**: Commit migration descriptors to git

---

## See Also

- [Worktree Environments](/worktree-environments) — Test in isolation
- [Resource Commands](/commands#resources)
- [Portal Inventory](/portal-inventory) — Discover current state
