# Worktrees con Btrfs — Clonado instantáneo de entornos

Btrfs permite clonar entornos de worktree de forma instantánea mediante
snapshots Copy-on-Write (COW): el snapshot inicial no ocupa espacio extra
y solo almacena los ficheros que cambien respecto a la base.

Sin Btrfs, cada worktree hace una copia completa de los datos (~varios GB).

---

## 1. Prerequisitos

### btrfs-progs

```bash
sudo apt install btrfs-progs
```

### sudoers — operaciones btrfs sin contraseña

Crear `/etc/sudoers.d/worktree-btrfs` con una sola línea (ajusta el usuario):

```bash
# Escribir el fichero desde una ruta temporal para evitar problemas de salto de línea
cat > /tmp/worktree-btrfs.sudoers << 'EOF'
tuusuario ALL=(root) NOPASSWD: /usr/bin/btrfs subvolume snapshot *, /usr/bin/btrfs subvolume create *, /usr/bin/btrfs subvolume delete *, /usr/bin/btrfs subvolume show *, /usr/bin/mount *
EOF
sudo visudo -c -f /tmp/worktree-btrfs.sudoers && \
sudo cp /tmp/worktree-btrfs.sudoers /etc/sudoers.d/worktree-btrfs && \
sudo chmod 440 /etc/sudoers.d/worktree-btrfs
```

---

## 2. Setup inicial (one-time)

Con el entorno principal en buen estado y parado:

```bash
task env:stop
```

Pasos manuales:

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

Después actualiza `docker/.env`:

```dotenv
ENV_DATA_ROOT=./btrfs/main
BTRFS_ROOT=./btrfs
BTRFS_BASE=./btrfs/base
BTRFS_ENVS=./btrfs/envs
USE_BTRFS_SNAPSHOTS=true
```

Y crea el snapshot inicial para `main`:

```bash
sudo btrfs subvolume snapshot docker/btrfs/base docker/btrfs/main
sudo chown -R "$USER:$USER" docker/btrfs/main docker/btrfs/envs
```

Qué hace:
- Crea un loop file Btrfs en `docker/btrfs/.loop.img` (50 GB por defecto)
- Lo monta en `docker/btrfs/`
- Crea subvolúmenes `base/`, `main/` y `envs/`
- Migra los datos actuales de `docker/data/default/` → `base/`
- Hace snapshot `base/ → main/` para que main arranque desde ahí
- Actualiza `docker/.env` automáticamente con las vars Btrfs

Opciones:

```bash
# Tamaño personalizado
truncate -s 100G docker/btrfs/.loop.img

# Verificar layout antes de arrancar
findmnt docker/btrfs
sudo btrfs subvolume list docker/btrfs
```

### Arrancar main con Btrfs activo

```bash
task env:start
```

`ENV_DATA_ROOT` ya apunta a `docker/btrfs/main` — main corre desde ahí.

---

## 3. Crear worktrees (UX idéntica a sin Btrfs)

```bash
task worktree:new -- issue-123
cd .worktrees/issue-123 && task env:start
```

El worktree clona `base/` via snapshot COW → instantáneo independientemente
del tamaño de los datos.

Con Btrfs cada worktree tiene su propia doclib aislada (COW).
Sin Btrfs los worktrees comparten la doclib de main (sin copias de GBs).

---

## 4. Refrescar la base (cuando quieras actualizar `base/`)

Cuando main tiene un estado que quieres propagar a futuros worktrees:

```bash
task env:stop
task worktree:btrfs-refresh-base
task env:start
```

Esto copia el estado actual de `main/` a `base/`. Los worktrees existentes no se ven afectados; los nuevos clonan desde la base actualizada.

### Restaurar un worktree desde la base

```bash
cd .worktrees/issue-123
task env:stop
task env:restore
task env:start
```

---

## 5. Eliminar worktrees

```bash
task worktree:rm -- issue-123
```

Elimina contenedores, datos en `envs/issue-123/` (subvolúmenes Btrfs incluidos),
`.env` del worktree, git worktree y rama.

---

## 6. Ampliar el espacio

```bash
# 1. Ampliar el loop file
sudo truncate -s +50G docker/btrfs/.loop.img

# 2. Refrescar el loop device
LOOP_DEV="$(findmnt -n -o SOURCE --target "$(pwd)/docker/btrfs")"
sudo losetup -c "$LOOP_DEV"

# 3. Expandir Btrfs
sudo btrfs filesystem resize max docker/btrfs

# 4. Verificar
sudo btrfs filesystem usage docker/btrfs
```

---

## 7. Diagnóstico

```bash
# Estado del filesystem
findmnt docker/btrfs
sudo btrfs subvolume list docker/btrfs
sudo btrfs filesystem usage docker/btrfs

# Verificar vars en .env
grep -E 'BTRFS|ENV_DATA_ROOT' docker/.env
```

---

## 8. Desactivar Btrfs (rollback)

```bash
# Mantener los datos pero desactivar snapshots
sed -i 's/^USE_BTRFS_SNAPSHOTS=.*/USE_BTRFS_SNAPSHOTS=false/' docker/.env
# Opcional: restaurar ENV_DATA_ROOT al path normal
sed -i 's|^ENV_DATA_ROOT=.*|ENV_DATA_ROOT=./data/default|' docker/.env
```

---

## 9. Troubleshooting

| Error | Causa | Fix |
|---|---|---|
| `Permission denied` al crear `envs/<name>` | `envs/` es de root | `sudo chown $USER:$USER docker/btrfs/envs` |
| `Operation not permitted` en snapshot | sudoers no cubre la ruta o falta `user_subvol_rm_allowed` | Verificar `/etc/sudoers.d/worktree-btrfs` y mount options |
| `mount: wrong fs type` | loop file corrupto | Borrar `.loop.img`, desmontar y repetir setup |
| Worktree arranca con datos vacíos | `base/` estaba vacío en el setup | Ejecutar `--force-migration` con main en buen estado |
