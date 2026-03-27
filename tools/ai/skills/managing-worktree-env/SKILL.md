---
name: managing-worktree-env
description: "WRAPPER DE COMPATIBILIDAD. Usar cuando se necesite crear, resetear, diagnosticar o limpiar entornos Docker aislados por worktree. Delega a /issue-engineering para el lifecycle completo."
---

# managing-worktree-env — Wrapper de compatibilidad

> **Esta skill ha sido consolidada en `/issue-engineering`.**
> Úsala directamente: `.agents/skills/issue-engineering/SKILL.md`
>
> **Estado:** compatibilidad histórica. Mantener para prompts antiguos; no promocionar como entrypoint principal.

---

## Guardrails mínimos (resumen)

- **Crear worktree**: `task worktree:new -- issue-NUM` (sin entorno). Arrancar después con `task env:start` solo si hace falta.
- **Destruir worktree**: Solo `task worktree:rm -- NUM`. Prohibido `rm -rf .worktrees/`, `git worktree remove`, y contenedores ad hoc sobre `.worktrees/`.
- **Estado**: Verificar con `task env:info` antes de arrancar a depurar.
- **Restaurar datos**: `task env:stop` → `task env:init -- --clone-volumes` → `task env:start`.
- **GC**: `task worktree:gc -- --days 7` (dry-run por defecto; `--apply` para ejecutar).
- **Recovery**: si ya editaste por error en el checkout principal, detente y aplica el recovery flow de `/issue-engineering` antes de cualquier commit, push o PR.

## Delegar a issue-engineering

```
/issue-engineering
```
