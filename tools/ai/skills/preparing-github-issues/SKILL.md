---
name: preparing-github-issues
description: "WRAPPER DE COMPATIBILIDAD. Usar cuando una issue incluye URLs de frontend pero le falta contexto técnico para resolverla. Delega a /issue-engineering (Fase 0 — Intake) para el proceso completo."
---

# preparing-github-issues — Wrapper de compatibilidad

> **Esta skill ha sido consolidada en `/issue-engineering` como Fase 0 — Intake.**
> Úsala directamente: `.agents/skills/issue-engineering/SKILL.md`
>
> **Estado:** compatibilidad histórica. Mantener para prompts antiguos o automatizaciones previas; no usar como entrypoint principal.

---

## Guardrails mínimos (resumen)

- Ejecutar solo si la issue tiene URLs de frontend pero le falta contexto técnico.
- Nunca inventar contexto: si `inventory page` falla para una URL, marcarla como `NO_VERIFICADO`.
- El script actualiza la issue original por defecto; usar `--mode create-test` para no editar la original.
- Si la issue no tiene URLs de frontend, reportar que el intake automático no aplica. No continuar.

## Script de enriquecimiento (sigue activo)

```bash
python3 .agents/skills/preparing-github-issues/scripts/prepare_issue.py NUM
# Para no editar la issue original:
python3 .agents/skills/preparing-github-issues/scripts/prepare_issue.py NUM --mode create-test
```

## Delegar a issue-engineering

```
/issue-engineering
```
