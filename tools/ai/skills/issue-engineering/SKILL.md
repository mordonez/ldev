---
name: issue-engineering
description: "Usar cuando se va a resolver cualquier issue de GitHub: desde el intake hasta el cleanup. Cubre el lifecycle completo (intake → worktree aislado → reproducción → fix → validación → PR → cleanup) y contiene todos los guardrails duros del proceso. Sustituye a preparing-github-issues, managing-worktree-env y resolving-issues."
---

# Issue Engineering — Lifecycle Maestro

Guía única para el ciclo completo de una issue: desde el intake hasta el cierre. Los guardrails de esta skill son **innegociables y obligatorios** en todas las fases.

---

## GUARDRAILS DUROS (Leer primero, siempre)

Estas reglas aplican en **todo el lifecycle**. No hay excepciones no documentadas.

| Regla | Lo que NO hacer | Lo que SÍ hacer |
|---|---|---|
| **Aislamiento** | Trabajar en `main` o en la raíz | `task worktree:new -- issue-NUM` |
| **Cleanup** | `rm -rf .worktrees/NUM` / `git worktree remove` | `task worktree:rm -- NUM` |
| **Discovery** | Grep masivo sobre el repo si la issue tiene URL/página | `inventory page` + `resolve-adt` primero |
| **Playwright** | Playwright MCP remoto, plugins externos | `task playwright` es el camino por defecto. Excepciones permitidas: `playwright-cli open` (abrir sesión), `task playwright-ui` (observar en escritorio), contraste remoto/producción solo bajo petición explícita del usuario |
| **Playwright remoto** | Acceder a producción sin verificar local primero | Solo si el usuario lo pide explícitamente y el entorno local está HEALTHY |
| **Sesiones** | Dos helpers Playwright en paralelo sobre la misma sesión | Secuenciar; si `session-busy` → rerun secuencial |
| **Cierre** | Cerrar worktree con commits sin PR | PR primero, cleanup después |
| **Evidencia** | Dejar evidencia solo en `.tmp/` local | Subir como attachment nativo en GitHub |
| **Sin attachment** | Marcar issue como resuelta sin evidencia visual subida | Sin attachment → sin cierre |

---

## Fase 0 — Intake (Opcional si la issue es clara)

Ejecutar solo si la issue tiene URLs de frontend pero le falta contexto técnico:

- Leer la issue con `gh issue view NUM`.
- **Preservar el body original verbatim** en una sección visible al inicio del issue enriquecido, incluso al reestructurar.
- Extraer todas las URLs del cuerpo.
- Por cada URL: `task liferay -- inventory page --url <URL> --format json`.
- Si no hay URLs exactas: `inventory sites` → `inventory pages --site /<site>` → `inventory page`.
- Añadir solo contexto verificado. Si una URL falla: marcarla como `NO_VERIFICADO`.
- Si la issue no tiene URLs de frontend: reportar que el intake automático no aplica.

Contrato del issue enriquecido (el agente siguiente debe poder resolver sin redescubrir):
- `siteFriendlyUrl`, `fullUrl`, `pageType`, `pageSubtype`, `pagesCommand`, `pageCommand`
- Superficies candidatas: ADT, template, structure, display page, widgets

Checklist de validación del intake:
- [ ] Issue original leída con `gh issue view NUM`
- [ ] Todas las URLs extraídas e inventariadas
- [ ] `inventory sites|pages|page` usado cuando no había URLs exactas
- [ ] `inventory page` ejecutado una vez por URL o `fullUrl` resuelta
- [ ] Body original preservado verbatim
- [ ] Solo contexto verificado en el issue actualizado

---

## Fase 1 — Aislamiento (Obligatorio)

**NUNCA** trabajar en `main` ni en el directorio raíz del repo.

```bash
# Crear worktree
task worktree:new -- issue-NUM

# Moverse al worktree (CRÍTICO)
cd .worktrees/issue-NUM

# Arrancar entorno del worktree antes de usar tooling contra el portal
task env:start

# Atajo equivalente desde la raíz principal
task worktree:start -- issue-NUM
```

Verificar estado mínimo antes de continuar:
```bash
task env:info
```

Recovery obligatorio si ya empezaste mal:
- Si detectas cambios locales en el checkout principal, no sigas editando, no hagas commit y no abras PR.
- Informa al usuario de que el trabajo empezó en la raíz principal por error.
- Guarda esos cambios de forma segura (`git stash` o equivalente), vuelve el checkout principal a `main` y crea el worktree correcto con `task worktree:new -- issue-NUM` o `task worktree:new -- <nombre>`.
- Mueve los cambios al worktree nuevo y continúa solo desde ahí.
- Si durante la corrección necesitas reescribir commits, resets, stashes o pushes, secuencia esas operaciones; no ejecutes varios comandos `git` mutantes en paralelo sobre el mismo repositorio.

Gate de runtime del worktree (obligatorio):
- Después de `task worktree:new`, no ejecutar `task liferay ...`, `task playwright ...`, `curl` contra el portal, `task osgi:*` ni `task liferay -- page-layout ...` hasta haber hecho:
  - `cd .worktrees/issue-NUM`
  - `task env:start`
  - `task env:info`
- Regla mental: si el comando habla con Liferay, debe hablar con el Liferay del worktree activo. Sin entorno levantado, la secuencia es inválida aunque el comando "parezca" solo de discovery.
- Después de `task worktree:new`, el siguiente paso operativo es siempre `cd .worktrees/issue-NUM`. No seguir investigando desde la raíz del repo principal.

Notas operativas:
- `task worktree:new` crea el worktree sin arrancar el entorno; `task env:start` es el paso explícito.
- El primer arranque con un commit nuevo tarda porque rellena `MAIN_ROOT/.worktree-build-cache/<commit>`. Los siguientes reutilizan la cache.
- Para descubrir todos los flags disponibles: `task worktree:new -- --help`, `task env:init -- --help`.

Restaurar datos (BD rota/inconsistente):
```bash
task env:stop
task env:init -- --clone-volumes
task env:start
```

Refrescar copia base Btrfs:
```bash
task env:stop
task worktree:btrfs-setup -- --apply --force-migration
task env:start
```

Si `task env:info` o cualquier `task liferay ...` / `curl` al portal falla con `ConnectException`:
- Asumir que el entorno no está levantado.
- Ejecutar `task env:start` antes de depurar nada más.

---

## Fase 2 — Discovery y Reproducción

**Antes de leer código**, reproducir el fallo y entender la superficie afectada.

### Discovery canónico (obligatorio si hay URL/página/layout)

```bash
task liferay -- inventory page --url <URL>
# Si hay displayStyle: ddmTemplate_<ID>
task liferay -- resource resolve-adt --display-style ddmTemplate_<ID> --site /<site>
```

Reglas de precedencia del discovery:
- Si la issue incluye una URL exacta, queda **prohibido** buscar código antes de ejecutar `task liferay -- inventory page --url <URL>` en el worktree activo.
- Si la issue trae una URL afectada, `inventory page --url <URL>` sigue siendo el primer paso obligatorio aunque el issue ya mencione `ddmTemplate_<ID>`, widget names o ADTs candidatos.
- `resolve-adt` sirve para mapear un `displayStyle` ya observado en runtime; no sustituye `inventory page`.
- Si no hay URL exacta, usar el fallback: `inventory sites` → `inventory pages --site /<site>` → `inventory page`.
- Si existe tooling canónico para obtener el contexto, no hacer búsqueda local en ficheros antes de usar ese tooling.

Solo después del discovery, si sigue siendo necesario:
```bash
grep -r "término" liferay/themes liferay/modules liferay/fragments
```

### Reproducción

- Logs: `task env:logs SINCE=10m`
- Frontend: `task playwright` o `curl` para confirmar fallo visual/HTTP
- Backend: `task osgi:diag` o `task osgi:gogo` para errores de módulos

Si no puedes reproducir el error: pedir más información o escalar. No arreglar lo que no has visto roto.

### Operativa UI / Page Editor (aplicar cuando la issue afecta a páginas de contenido)

Para mutaciones de página, el flujo obligatorio es:

```bash
# 1. Exportar antes de tocar
task liferay -- page-layout export --url <pageUrl>

# 2. Sesiones separadas para runtime y editor (nunca la misma)
playwright-cli -s=runtime-NUM open "<runtimeUrl>" --config=.playwright/cli.config.json
task playwright -- -s=editor-NUM ensure-editor-session --url <pageUrl>

# 3. Helpers atómicos del editor
task playwright -- -s=editor-NUM editor-hide-item --url <pageUrl> --name "<label>"
task playwright -- -s=editor-NUM editor-hide-items --url <pageUrl> --name "<l1>" --name "<l2>"
task playwright -- -s=editor-NUM editor-publish-and-verify --url <pageUrl> --verify-runtime-url "<runtimeUrl>"

# 4. Comparar antes/después si aplica
task liferay -- page-layout diff --url <pageUrl>
```

Guardrails específicos de UI/Page Editor:
- No ejecutar dos helpers Playwright en paralelo sobre la misma sesión. Si ves `reason: session-busy`, secuenciar en lugar de forzar nueva sesión.
- No pasar de "las páginas se parecen" a copiar estructuras de layout por raw DB/payload. Usar siempre el flujo de editor con las `adminUrls` descubiertas.
- No probar endpoints Headless Delivery write ad hoc solo porque `pageDefinition` es legible. Si `dev-cli` no tiene un comando dedicado, mutar via UI.
- **No usar bulk resource sync/import durante la resolución de la issue** salvo razón escrita explícita.

---

## Fase 3 — Resolución (Delegación a skill especialista)

Una vez diagnosticado, activar la skill adecuada:

| Tipo de cambio | Skill | Comando de deploy |
|---|---|---|
| CSS / Templates / Tema | `developing-liferay` | `task deploy:theme` |
| Estructuras / Templates WC / ADTs | `developing-liferay` | discovery con `task liferay -- ...` + mutación por UI/workflow explícito |
| Java / OSGi / Lógica de negocio | `developing-liferay` | `task deploy:module -- <modulo>` |
| Migración de datos | `migrating-journal-structures` | — |

Reglas de ejecución:
- Cambios quirúrgicos y acotados. No tocar código que no es parte del fix.
- No pasar de "páginas similares" a clonar estructuras por copia raw de BD.
- No usar endpoints Headless Delivery write ad hoc si `dev-cli` no tiene un comando dedicado: mutar via UI con las `adminUrls` del `inventory page`.

---

## Fase 4 — Validación (Definition of Done)

Un fix no está terminado hasta que:

1. El error original ya no se reproduce en la URL exacta reportada en la issue.
2. No se han introducido regresiones en áreas adyacentes.
3. El artefacto desplegado es el construido desde el worktree actual (revalidar tras restart/recreate).
4. El código no tiene `System.out.println`, logs de debug ni comentarios temporales.
5. Evidencia Playwright capturada y **subida como attachment nativo en GitHub** (PR body o comentario).

---

## Fase 5 — PR y Cierre

```bash
# Commit (dentro del worktree)
git add <ficheros-concretos>
git commit -m "fix(scope): descripción del fix (#NUM)"

# PR
git push origin fix/issue-NUM
gh pr create ...

# Comentar la issue con URL verificada + enlace PR + referencia al attachment
gh issue comment NUM --body "..."
```

### Reglas de cierre de GitHub

- **PR body**: seguir `.github/PULL_REQUEST_TEMPLATE.md` si existe.
- **Verification Plan**: paso a paso para el revisor humano. Obligatorio.
- **Deployment Notes**: indicar si el cambio requiere pasos manuales/UI o algún workflow explícito fuera de `dev-cli` en otros entornos.
- **Visual Evidence**: para cambios UI/CSS, el attachment debe estar subido en GitHub, no solo en local.
- **Sin attachment nativo → no marcar como resuelta.**
- **Commits sin PR**: si hay commits propios y no existe PR, no limpiar el worktree.
- **Si el trabajo empezó en el checkout principal por error**: corregir primero el aislamiento y solo después continuar con commit/push/PR.

### Commit messages (Conventional Commits)

Formato: `<type>(<scope>): <descripción> (#NUM)`

Tipos: `fix`, `feat`, `docs`, `refactor`, `chore`

Ejemplo: `fix(theme): unificar márgenes del sidebar de filtros (#440)`

---

## Fase 6 — Cleanup

```bash
task env:stop
cd ../..           # Volver a raíz
task worktree:rm -- issue-NUM
```

Solo ejecutar **después de que exista PR verificable**. El `worktree:rm` bloquea si hay commits sin PR salvo override explícito.

---

## Troubleshooting del Pipeline

| Síntoma | Acción |
|---|---|
| Puerto ocupado en `task env:start` | `docker ps` — matar contenedores de otros worktrees activos |
| Entorno inestable / BD inconsistente | `task env:stop` → `task env:init -- --clone-volumes` → `task env:start` |
| Playwright: `session-not-open` | Abrir sesión desde el mismo worktree |
| Playwright: `session-busy` | Secuenciar comandos; no lanzar en paralelo |
| Playwright: `login-failed` | `ensure-editor-session` y reusar sesión autenticada |
| Artefactos root-owned imposibles de borrar | Reportar el bloqueo con `task env:info`. No usar `rm -rf` manual. Escalar a humano si `task worktree:rm` falla. |
| Bloqueado sin poder cerrar | Comentar en la issue con hallazgos y añadir label `needs-human-review` |
