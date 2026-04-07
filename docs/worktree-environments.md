# Worktree Environments

`ldev worktree` wraps [git worktrees](https://git-scm.com/docs/git-worktree) with isolated local runtime state.

Each worktree gets its own Docker data directory, so multiple branches can run live Liferay environments simultaneously without database or volume collisions.

## Typical flow

```bash
ldev worktree setup --name feature-xyz --with-env
cd .worktrees/feature-xyz
ldev start

# when finished
ldev worktree clean --force --delete-branch
```

If `main` is still running and your host does not have Btrfs snapshot cloning available, `ldev worktree setup --with-env` stops in preflight before creating the worktree. That avoids half-completed setups that still need manual cleanup.

## When to use this

- validate a branch against production-like data
- compare two branches side-by-side
- hand off an isolated branch environment to CI or AI agents


## Where this gives the most value

`worktree` is useful on all supported hosts, but the biggest operational gain is on **Linux with Btrfs snapshots enabled**.

With Btrfs-based cloning, creating branch environments can reuse snapshot workflows instead of full data copies, which is faster and more disk-efficient for large local datasets.

On macOS/Windows (or Linux without Btrfs), normal worktree isolation still works, but without the Btrfs optimization path.

See:
- [Support Matrix](/support-matrix)
- [Configuration (Btrfs keys)](/configuration)

## Tradeoffs

Isolated worktrees run separate containers and data directories, so RAM and disk usage increase. Use this for targeted tasks rather than as the default workflow.

## Related docs

- [AI Workflows](/ai-workflows)
- [Resource Migration Pipeline](/resource-migration-pipeline)
- [Command Reference](/commands)
