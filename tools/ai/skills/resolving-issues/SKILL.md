---
name: resolving-issues
description: "WRAPPER DE COMPATIBILIDAD. Usar cuando se quiera resolver una issue. Delega a /issue-engineering, que contiene el lifecycle completo y todos los guardrails duros."
---

# resolving-issues — Wrapper de compatibilidad

> **Esta skill ha sido consolidada en `/issue-engineering`.**
> Úsala directamente: `.agents/skills/issue-engineering/SKILL.md`
>
> **Estado:** compatibilidad histórica. Mantener para prompts antiguos; no promocionar como entrypoint principal.

---

## Guardrails mínimos (resumen)

Estos guardrails son innegociables. El detalle completo vive en `issue-engineering`.

- **Aislamiento**: Siempre `task worktree:new -- issue-NUM`. Nunca trabajar en `main`.
- **Cleanup**: Solo `task worktree:rm -- NUM`. Prohibido `rm -rf .worktrees/` y `git worktree remove`.
- **Discovery**: Si la issue tiene URL/página, primero `task liferay -- inventory page --url <URL>`. Luego `mgrep` si hace falta.
- **Playwright**: `task playwright` es el camino por defecto. Excepciones: `playwright-cli open`, `task playwright-ui`, contraste remoto solo bajo petición explícita.
- **Cierre**: No limpiar worktree sin PR verificable. Sin attachment nativo en GitHub → sin cierre de issue visual.

## Delegar a issue-engineering

```
/issue-engineering
```
