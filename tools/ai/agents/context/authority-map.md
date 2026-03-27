# Authority Map — documentación de agentes

Matriz canónica de autoridad documental para reducir drift.

## Regla de precedencia global

1. `AGENTS.md` → políticas globales y guardrails transversales.
2. `CLAUDE.md` → know-how de dominio/proyecto (estable, no memoria de sesión).
3. `agents/*` → arquitectura, roadmap y gobernanza de documentación.
4. `.agents/skills/*` → ejecución táctica universal.
5. `.claude/agents/*` → optimización táctica específica de Claude.

## Mapa por archivo/directorio

| Ruta | Owner | Tipo | Qué debe contener | Qué NO debe contener |
|---|---|---|---|---|
| `AGENTS.md` | Equipo plataforma-agentes | Norma | Bootstrap, precedencia, modelo multi-runtime, entrypoints recomendados, reglas globales | Runbooks largos, duplicación táctica |
| `CLAUDE.md` | Equipo dominio Liferay | Know-how | Stack, contexto técnico estable, punteros canónicos | Notas de sesión, timestamps volátiles |
| `agents/architecture.md` | Equipo plataforma-agentes | Arquitectura | Arquitectura objetivo y decisiones canónicas | Procedimientos paso a paso extensos |
| `agents/roadmaps/*.md` | Equipo plataforma-agentes | Roadmap | Planes de evolución y estado | Instrucciones operativas duplicadas |
| `agents/context/*` | Equipo plataforma-agentes | Gobernanza/contexto | Manifests, scripts y validaciones | Políticas de ejecución |
| `.agents/skills/*/SKILL.md` | Equipo pipeline | Skill universal | Trigger claro, flujo resumido, punteros a referencias, usable sin `.claude/agents/` | Dump de comandos genéricos masivos |
| `.claude/agents/*.md` | Equipo pipeline | Runbook Claude | Flujo táctico por rol de agente en Claude | Fuente de verdad, políticas globales duplicadas |
| `.agents/skills/*/references/*` | Equipo pipeline | Referencia | Detalle especializado reusable | Reglas globales |

## Reglas operativas

- Cambios en pipeline/guardrails: editar primero `AGENTS.md` y luego skill/runbook afectado.
- Cambios de know-how de producto: editar `CLAUDE.md` y referenciar desde skills.
- Si una regla aparece en >1 sitio, dejar **una fuente canónica** y sustituir el resto por punteros cortos.
- Si una capacidad solo existe en `.claude/agents/`, considerarla incompleta hasta que el equivalente operativo quede cubierto por skills/doc universal.

## Estado de transición

- Fuente de verdad de skills: `.agents/skills/`.
- `.claude/skills/`: espejo de compatibilidad mediante enlaces simbólicos hacia `.agents/skills/` (sin edición directa).
- Los wrappers históricos existen por compatibilidad, pero no deben promocionarse como entrypoints principales.
