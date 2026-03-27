# Arquitectura objetivo (cierre de la PoC)

Este documento cierra el hito de estabilización: deja explícita la arquitectura mínima mantenible para entorno Docker + agentes.

## 1. Bloques core

- **Infra local**: `docker/`
  - Runtime reproducible Liferay/Postgres con `docker-compose.yml`.
  - Orquestación por `Taskfile.yml` y submódulos `Taskfile.*.yml`.
- **Contexto para LLM externos**: `agents/context/`
  - `core.lst` + `build-context.sh` + `generated/core.txt`.
- **Skills universales**: `.agents/skills/`
  - Capacidades on-demand, neutrales al runtime, con metadata UI y referencias.
- **Runbooks internos de Claude**: `.claude/agents/`
  - Pipeline v2: `issue-resolver`, `build-verifier`, `runtime-verifier`, `pr-creator`.

## 2. Capas de compatibilidad

### Universal

Debe funcionar en cualquier runtime con capacidad de leer Markdown:

- `AGENTS.md`
- `CLAUDE.md`
- `agents/*`
- `.agents/skills/*`

### Claude-específica

Optimización de ejecución para Claude Code. No es la fuente de verdad:

- `.claude/agents/*`
- `.claude/skills/*` como espejo de compatibilidad

### Compatibilidad histórica

Se conservan wrappers de transición para no romper prompts o hábitos anteriores:

- `resolving-issues`
- `preparing-github-issues`
- `managing-worktree-env`

## 3. Flujo operativo unificado

```text
Issue -> issue-resolver -> build-verifier -> runtime-verifier -> pr-creator
```

- `issue-resolver` concentra análisis, exploración, plan, fix y retries.
- Verificadores quedan separados para preservar gates de calidad.
- `pr-creator` solo se ejecuta tras `VERIFIED`.
- En runtimes sin soporte nativo de subagentes, este pipeline se representa como runbook/documentación, pero la capacidad operativa sigue viviendo en `issue-engineering` + skills especialistas.

## 4. Entry points recomendados

Para nuevos usuarios/agentes:

- `issue-engineering` para issues end-to-end
- `liferay-expert` para tareas técnicas Liferay no ligadas necesariamente a una issue
- `capturing-session-knowledge` para consolidación de aprendizaje

Los demás skills deben entenderse como especialistas o compatibilidad, no como menú principal.

## 5. Contratos de entrada/salida

Artefactos compactos obligatorios:

- `/tmp/_issue_brief.md`
- `/tmp/_code_landscape.md`
- `/tmp/_solution_plan.md`

Estados de control:

- `READY_FOR_BUILD_VERIFY`
- `VERIFIED`
- `ESCALATE`

## 6. Criterios de mantenibilidad

- Makefiles por dominio (`mk/`) para reducir deuda cognitiva.
- Skills cortas + referencias específicas.
- Sin rutas absolutas locales en runbooks.
- Config local segura por defecto (`BIND_IP=127.0.0.1`).
- No depender de `.claude/agents/` para que el sistema sea usable.

## 7. Riesgos residuales y mitigación

- **Riesgo**: regresiones al consolidar agentes.
  - **Mitigación**: matriz de paridad funcional + escenarios de validación en `agents/agents.md`.
- **Riesgo**: drift documental.
  - **Mitigación**: update conjunto de `AGENTS.md`, `CLAUDE.md`, skills y runbooks en el mismo commit.
- **Riesgo**: que el usuario no distinga entre entrypoints, especialistas y legacy.
  - **Mitigación**: `AGENTS.md` solo promociona entrypoints principales y mueve wrappers a compatibilidad histórica.

## 8. Decisión de consolidación de skills

- **Fuente canónica de skills**: `.agents/skills/`.
- La compatibilidad con Claude/Codex se mantiene con `.claude/skills/` como **espejo por symlinks** a `.agents/skills/`, evitando drift 1:1.
- Las capacidades Claude siguen cubiertas usando `.claude/agents/` (runbooks) + `.agents/skills/` (skills).
- Codex y Copilot deben poder operar correctamente ignorando `.claude/agents/`.
- La validación automática de deriva documental se ejecuta con `agents/validate-all.sh`.
