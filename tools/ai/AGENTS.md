# AGENTS

Punto de entrada neutral para agentes de programación (Codex, Claude Code y otros).

Compatible con **Claude Code**, **Codex** y cualquier agente basado en LLM.
El documento principal de know-how del proyecto es `CLAUDE.md`.

## Bootstrap Obligatorio (Todos los Agentes)

Antes de realizar cambios:

1. Leer este archivo: `AGENTS.md`
2. Leer el know-how del dominio: `CLAUDE.md`

`CLAUDE.md` es el documento de know-how principal del proyecto a pesar de su nombre.

## Guardrail Obligatorio de Worktree (Todos los Agentes)

Si un agente va a modificar código, configuración, scripts, tests o documentación rastreada en git, DEBE trabajar en un git worktree dedicado.

Flujo requerido:
1. Permanecer en `main` en el checkout principal y asegurar que esté sincronizado con origin (ej. `git fetch origin main && git merge origin/main`).
2. Crear un worktree dedicado con `task worktree:new -- <nombre>`.
3. Entrar en el directorio (`cd`) `.worktrees/<nombre>`.
4. Realizar ediciones, verificaciones, commits y pushes desde ese worktree.

Reglas estrictas:
- Nunca cambies el checkout principal fuera de `main` para realizar tareas de implementación.
- Nunca edites y luego "lo arregles más tarde" cambiando solo la rama en el checkout principal.
- Si notas que estás en el checkout principal y vas a cambiar archivos, detente y crea un worktree primero.
- Si ya has cambiado archivos en el checkout principal por error, detente, informa al usuario y mueve el trabajo a un worktree adecuado antes de hacer commit.

## Estrategia de Carga de Contexto (Para LLMs Genéricos)

Si eres un agente genérico (Gemini, ChatGPT, etc.) sin carga automática de contexto:
1. **SIEMPRE** lee `AGENTS.md` (este archivo) para entender tu rol y las skills disponibles.
2. **SIEMPRE** lee `CLAUDE.md` para entender la estructura del proyecto, el stack y los comandos.
3. **SI** se te asigna una tarea específica (ej. "Arreglar un bug del tema"), **LEE** el archivo de definición correspondiente de la tabla de Skills abajo. No adivines los pasos.

---

## Directrices Fundamentales de Ingeniería de Software

> Estas directrices son **innegociables**. Todo código que produzcas, modifiques o revises DEBE cumplirlas.

1. Resuelve el problema correcto.
2. Busca la solución más simple que funcione.
3. El código debe funcionar y estar verificado.
4. Manejo de errores robusto y explícito.
5. Prioriza simplicidad y legibilidad.
6. Verificación demostrable (ejecución real cuando aplique).
7. Protegido por tests (happy path, bordes, error) usando estrategia red/green TDD siempre que sea viable.
8. Documentación actualizada en el mismo commit.
9. Diseño preparado para cambio (YAGNI + bajo acoplamiento).
10. Considera atributos no funcionales relevantes (seguridad, fiabilidad, mantenibilidad, observabilidad, etc.).
11. **Economía de Contexto**: Tu recurso más valioso es tu ventana de contexto. Evita "sobre-explorar" si el usuario ya ha acotado el problema. Cada herramienta que llames debe tener un propósito quirúrgico y no redundante.

## Roles y Arquitectura

No eres solo un programador; eres un **Arquitecto**.
Antes de proponer refactorizaciones complejas o grandes funcionalidades, consulta:
- `agents/architecture.md`: Principios de diseño del sistema (si existe).
- `agents/context/authority-map.md`: Límites de dominio (si existe).

---

## Ubicaciones Canónicas

- Know-how del dominio: `CLAUDE.md`
- Validación y contexto compartido: `agents/`
- Skills universales (fuente de verdad): `.agents/skills/`
- Compatibilidad Claude de skills: `.claude/skills/` (espejo por enlaces simbólicos a `.agents/skills/`, no edición directa)
- Runbooks internos específicos de Claude: `.claude/agents/`

> Regla de precedencia: `AGENTS.md` (políticas) → `CLAUDE.md` (know-how) → `agents/*` (arquitectura/roadmaps) → runbooks/skills (ejecución táctica).

## Modelo Multi-Runtime

Este paquete está diseñado para que el modelo mental sea estable en **Codex**, **Claude Code** y herramientas tipo **GitHub Copilot**.

### Capa universal

Estas piezas deben ser suficientes aunque el runtime ignore por completo `.claude/agents/`:

- `AGENTS.md`
- `CLAUDE.md`
- `agents/`
- `.agents/skills/`

### Capa específica de Claude

Estas piezas son una optimización de pipeline para Claude Code. No son la fuente de verdad del sistema:

- `.claude/agents/`
- `.claude/skills/` como espejo de compatibilidad

### Capa legacy / compatibilidad

Estas skills existen para no romper prompts históricos o hábitos previos. No son entrypoints principales:

- `/resolving-issues`
- `/preparing-github-issues`
- `/managing-worktree-env`

## Entry Points Recomendados

Si no conoces el proyecto, empieza por estos tres entrypoints:

| Entry point | Archivo | Cuándo usarlo |
|---|---|---|
| `/issue-engineering` | `.agents/skills/issue-engineering/SKILL.md` | Resolver una issue end-to-end. |
| `/liferay-expert` | `.agents/skills/liferay-expert/SKILL.md` | Tarea técnica Liferay no necesariamente ligada a una issue. |
| `/capturing-session-knowledge` | `.agents/skills/capturing-session-knowledge/SKILL.md` | Consolidar aprendizaje verificado al cerrar trabajo. |

## Router Rápido de Prompts

Usa esta tabla cuando el prompt del usuario sea ambiguo o no mencione ninguna skill:

| Si el usuario dice algo como... | Entry point |
|---|---|
| "Resuelve la issue #123" | `/issue-engineering` |
| "Prepara la issue #123, está incompleta" | `/issue-engineering` |
| "No sé qué skill usar para este problema Liferay" | `/liferay-expert` |
| "Tengo un error al hacer click en el formulario X" | `/liferay-expert` |
| "La home tarda mucho en cargar" | `/liferay-expert` |
| "El bundle X está en Installed" | `/troubleshooting-liferay` |
| "He cambiado el módulo y quiero verificar deploy/runtime" | `/deploying-liferay` |
| "Quiero cambiar el spacing del bloque de noticias" | `/developing-liferay` |
| "Hay que migrar una estructura Journal" | `/migrating-journal-structures` |
| "Quiero dejar documentado lo aprendido en esta sesión" | `/capturing-session-knowledge` |

Regla corta:
- Si hay issue, ticket, PR, cleanup o lifecycle de trabajo, usa `/issue-engineering`.
- Si no hay issue y la tarea técnica no está clara, usa `/liferay-expert`.
- Si la causa raíz ya está clara, usa directamente la skill especialista.

## Skills Especialistas

| Skill | Archivo de Definición (¡Léelo!) | Cuándo usarla |
|-------|---------------------------------|---------------|
| `/liferay-expert` | `.agents/skills/liferay-expert/SKILL.md` | **Router de dominio Liferay**. Identifica la skill especialista para cualquier tarea técnica. |
| `/developing-liferay` | `.agents/skills/developing-liferay/SKILL.md` | **Desarrollo en Liferay DXP**. Playbook para Temas, DDM, Fragmentos y desarrollo OSGi/Java. |
| `/deploying-liferay` | `.agents/skills/deploying-liferay/SKILL.md` | **Despliegue de Módulos Liferay**. Compilación de bajo nivel, hot-deploy y verificación de estado OSGi. |
| `/migrating-journal-structures` | `.agents/skills/migrating-journal-structures/SKILL.md` | **Migración de Estructuras Journal**. Migración segura de contenido con fieldsets, mapeos y validación. |
| `/troubleshooting-liferay` | `.agents/skills/troubleshooting-liferay/SKILL.md` | **Resolución de Problemas Liferay**. Diagnóstico paso a paso de fallos del portal y regresiones. |
| `/automating-browser-tests` | `.agents/skills/automating-browser-tests/SKILL.md` | **Automatización de Tests de Navegador**. Verificación UI/UX, comprobaciones funcionales y evidencia visual con Playwright. |
| `/capturing-session-knowledge` | `.agents/skills/capturing-session-knowledge/SKILL.md` | **Captura de Conocimiento de Sesión**. Consolida aprendizajes verificados en la memoria permanente del repositorio. |
| `/skill-creator` | `.agents/skills/skill-creator/SKILL.md` | **Creación de Skills de IA**. El meta-agente para construir y refinar skills de alta calidad. |

## Compatibilidad Histórica

Estas skills siguen instalándose, pero deben leerse como aliases o wrappers:

| Skill | Archivo | Estado |
|---|---|---|
| `/resolving-issues` | `.agents/skills/resolving-issues/SKILL.md` | Alias histórico de `/issue-engineering` |
| `/preparing-github-issues` | `.agents/skills/preparing-github-issues/SKILL.md` | Wrapper histórico para intake |
| `/managing-worktree-env` | `.agents/skills/managing-worktree-env/SKILL.md` | Wrapper histórico para worktrees |

Todos los comandos operativos están unificados bajo `task`.

- Entrypoint oficial completo: `task dev-cli -- ...`
- Wrapper Liferay oficial: `task liferay -- ...`

Ejecuta `task help` para la guía completa.
Tras instalar o actualizar este paquete, valida la instalación con:

```bash
bash agents/validate-all.sh
```

## Pipeline de Issues (obligatorio)

Para la resolución de issues, usa `/issue-engineering #NUM`.
Esa skill es la fuente canónica para:
- fases del pipeline (intake → worktree → reproducción → fix → validación → PR → cleanup)
- reglas de escalado (`ESCALATE`, `needs-human-review`)
- guardrails de eficiencia de tokens y límites estrictos
- Definition of Done (DoD)

Compatibilidad:
- Si un agente o prompt histórico pide `/resolving-issues`, `/preparing-github-issues` o `/managing-worktree-env`, esas skills siguen existiendo como wrappers cortos hacia el flujo canónico.
- Si el runtime usa agentes de Claude, el pipeline mínimo vive en `.claude/agents/`: `issue-resolver`, `build-verifier`, `runtime-verifier`, `pr-creator`.
- Si el runtime no entiende `.claude/agents/`, el sistema sigue siendo usable solo con `AGENTS.md` + `CLAUDE.md` + `.agents/skills/`.

Cualquier agente que siga este pipeline debe cumplir el guardrail obligatorio de worktree antes de realizar cambios.

### Recuperación de datos en worktree (obligatorio ante inconsistencias)

Si un worktree queda con BD/datos corruptos o inconsistentes, usar este flujo canónico:

```bash
task env:stop
task env:init -- --clone-volumes
task env:start
```

Regla: ejecutar siempre estos comandos desde la raíz del worktree afectado.

## Convención de Idioma en Documentación (obligatorio)

La documentación operativa interna debe estar en el idioma del equipo.

- **Prosa operativa** (skills, runbooks, CLAUDE.md, AGENTS.md): en el idioma del equipo
- **Comandos, paths, flags, identificadores técnicos**: en inglés, sin traducir
- **Términos de producto asentados** (Page Editor, runtime, bundle, deploy, worktree): aceptables en inglés dentro de texto del idioma del equipo

---

## Equivalencias de Herramientas (resumen)

- Despliegue de módulo: `task deploy:module -- <MODULE_NAME>`
- Despliegue de tema: `task deploy:theme`
- OSGi/Gogo: `task osgi:gogo`
