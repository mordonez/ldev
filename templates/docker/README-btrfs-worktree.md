# Worktrees with Btrfs — Instant environment cloning

Btrfs allows cloning worktree environments instantly through
Copy-on-Write (COW) snapshots: the initial snapshot takes up no extra space
and only stores the files that change relative to the base.

Without Btrfs, each worktree makes a full copy of the data (~several GB).

---

## 1. Prerequisites

### btrfs-progs

```bash
sudo apt install btrfs-progs
```

### sudoers — btrfs operations without password

Create `/etc/sudoers.d/worktree-btrfs` with a single line (adjust the user):

```bash
# Write the file from a temporary path to avoid line break issues
cat > /tmp/worktree-btrfs.sudoers << 'EOF'
youruser ALL=(root) NOPASSWD: /usr/bin/btrfs subvolume snapshot *, /usr/bin/btrfs subvolume create *, /usr/bin/btrfs subvolume delete *, /usr/bin/btrfs subvolume show *, /usr/bin/mount *
EOF
sudo visudo -c -f /tmp/worktree-btrfs.sudoers && \
sudo cp /tmp/worktree-btrfs.sudoers /etc/sudoers.d/worktree-btrfs && \
sudo chmod 440 /etc/sudoers.d/worktree-btrfs
```

---

## 2. Initial Setup (one-time)

With the main environment in good condition and stopped:

```bash
ldev stop
```

Manual steps:

```bash
mkdir -p docker/btrfs
truncate -s 50G docker/btrfs/.loop.img
LOOP_DEV="$(sudo losetup --find --show docker/btrfs/.loop.img)"
sudo mkfs.btrfs -f "$LOOP_DEV"
sudo mount "$LOOP_DEV" docker/btrfs
sudo btrfs subvolume create docker/btrfs/base
sudo btrfs subvolume create docker/btrfs/envs
sudo rsync -a docker/data/default/ docker/btrfs/base/
sudo chown -R "$USER:$USER" docker/btrfs
```

Then update `docker/.env`:

```dotenv
ENV_DATA_ROOT=./btrfs/main
BTRFS_ROOT=./btrfs
BTRFS_BASE=./btrfs/base
BTRFS_ENVS=./btrfs/envs
USE_BTRFS_SNAPSHOTS=true
```

And create the initial snapshot for `main`:

```bash
sudo btrfs subvolume snapshot docker/btrfs/base docker/btrfs/main
sudo chown -R "$USER:$USER" docker/btrfs/main docker/btrfs/envs
```

What it does:
- Creates a Btrfs loop file in `docker/btrfs/.loop.img` (50 GB by default)
- Mounts it in `docker/btrfs/`
- Creates `base/`, `main/`, and `envs/` subvolumes
- Migrates current data from `docker/data/default/` → `base/`
- Creates a snapshot `base/ → main/` so main starts from there
- Automatically updates `docker/.env` with Btrfs variables

Options:

```bash
# Custom size
truncate -s 100G docker/btrfs/.loop.img

# Verify layout before starting
findmnt docker/btrfs
sudo btrfs subvolume list docker/btrfs
```

### Start main with Btrfs active

```bash
ldev env start
```

`ENV_DATA_ROOT` already points to `docker/btrfs/main` — main runs from there.

---

## 3. Creating worktrees (Identical UX as without Btrfs)

```bash
ldev worktree setup --name issue-123 --with-env
cd .worktrees/issue-123 && ldev env start
```

The worktree clones `base/` via COW snapshot → instant regardless of data size.

With Btrfs each worktree has its own isolated doclib (COW).
Without Btrfs worktrees share main's doclib (without GB copies).

---

## 4. Refreshing the base (whenever you want to update `base/`)

When main has a state you want to propagate to future worktrees:

```bash
ldev stop
ldev worktree btrfs-refresh-base
ldev env start
```

This copies the current state of `main/` to `base/`. Existing worktrees are not affected; new ones clone from the updated base.

### Restore a worktree from the base

```bash
cd .worktrees/issue-123
ldev stop
ldev env restore
ldev env start
```

---

## 5. Deleting worktrees

```bash
ldev worktree clean issue-123 --force
```

Deletes containers, data in `envs/issue-123/` (including Btrfs subvolumes),
the worktree's `.env`, git worktree, and branch.

---

## 6. Expanding space

```bash
# 1. Expand the loop file
sudo truncate -s +50G docker/btrfs/.loop.img

# 2. Refresh the loop device
LOOP_DEV="$(findmnt -n -o SOURCE --target "$(pwd)/docker/btrfs")"
sudo losetup -c "$LOOP_DEV"

# 3. Expand Btrfs
sudo btrfs filesystem resize max docker/btrfs

# 4. Verify
sudo btrfs filesystem usage docker/btrfs
```

---

## 7. Diagnostics

```bash
# Filesystem status
findmnt docker/btrfs
sudo btrfs subvolume list docker/btrfs
sudo btrfs filesystem usage docker/btrfs

# Verify variables in .env
grep -E 'BTRFS|ENV_DATA_ROOT' docker/.env
```

---

## 8. Disabling Btrfs (rollback)

```bash
# Keep data but disable snapshots
sed -i 's/^USE_BTRFS_SNAPSHOTS=.*/USE_BTRFS_SNAPSHOTS=false/' docker/.env
# Optional: restore ENV_DATA_ROOT to the normal path
sed -i 's|^ENV_DATA_ROOT=.*|ENV_DATA_ROOT=./data/default|' docker/.env
```

---

## 9. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Permission denied` when creating `envs/<name>` | `envs/` belongs to root | `sudo chown $USER:$USER docker/btrfs/envs` |
| `Operation not permitted` on snapshot | sudoers does not cover the path or `user_subvol_rm_allowed` is missing | Verify `/etc/sudoers.d/worktree-btrfs` and mount options |
| `mount: wrong fs type` | loop file corrupted | Delete `.loop.img`, unmount, and repeat setup |
| Worktree starts with empty data | `base/` was empty during setup | Run `--force-migration` with main in good condition |
