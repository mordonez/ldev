# Análisis de Optimización para Agentes — ldev

**Fecha:** 2026-06-30
**Autor:** Análisis comparativo gws (googleworkspace/cli) vs. ldev
**Scope:** Mejores prácticas de CLIs orientadas a agentes, inventario de comandos, brechas y plan de acción

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Referencia analizada: googleworkspace/cli (gws)](#2-referencia-analizada-googleworkspacecli-gws)
3. [Comparativa: gws vs. ldev](#3-comparativa-gws-vs-ldev)
4. [Inventario completo de comandos](#4-inventario-completo-de-comandos)
5. [Clasificación por complejidad y candidatos a simplificación](#5-clasificación-por-complejidad-y-candidatos-a-simplificación)
6. [Brechas identificadas](#6-brechas-identificadas)
7. [Plan de acción priorizado](#7-plan-de-acción-priorizado)
8. [Estimación de impacto](#8-estimación-de-impacto)

---

## 1. Resumen ejecutivo

ldev es ya una CLI madura con buena arquitectura interna (capas, gateway, import engine, error factories, contratos Zod). Sin embargo, cuando se analiza desde la perspectiva de eficiencia para agentes, hay tres categorías de mejora claras:

**A — Taxonomía de skills insuficiente.** El proyecto tiene 10 skills para ~96 comandos y ninguna foundational skill compartida. gws tiene 100+ skills para una superficie de API similar, organizadas en 5 niveles. El ratio actual de ldev es 1 skill cada 9-10 comandos; gws tiene ~1 skill cada 1-2 comandos. Esta brecha hace que los agentes no tengan playbooks precisos para la mayoría de tareas.

**B — Comandos simples que deberían ser skills.** Al menos 28 comandos hacen 0-2 llamadas API, son thin wrappers sobre una sola operación, y podrían documentarse mejor como skills rápidas en lugar de comandos con opciones explícitas. Esto no significa eliminarlos del CLI (los comandos deben existir), sino que la primera línea de respuesta de un agente debería ser una skill, no el `--help`.

**C — Patrones de contrato de agente ausentes.** Faltan: un comando `ldev schema`, `--dry-run` consistente en todos los mutadores, NDJSON streaming para paginación, field masks para filtrar respuestas largas, y una foundational skill que sea la base de todas las demás. El AGENTS.md existente es muy bueno en flujo pero no cubre estos patrones de eficiencia de contexto.

El plan de acción está ordenado por impacto descendente: primero las brechas que causan fallos de agentes hoy (P0), luego las que producen trabajo innecesario (P1), luego las mejoras de ergonomía (P2).

---

## 2. Referencia analizada: googleworkspace/cli (gws)

### 2.1 Descripción del proyecto

`gws` es una CLI unificada en Rust para todas las APIs de Google Workspace (Drive, Gmail, Calendar, Sheets, etc.). El repositorio tiene 100+ skills organizadas en 5 niveles jerárquicos y está diseñado explícitamente con los agentes de IA como consumidores primarios.

### 2.2 Los 10 patrones más importantes

#### Patrón 1 — Taxonomía de skills en 5 niveles

```
Service   →  gws-gmail              (superficie completa de un servicio)
Action    →  gws-gmail-triage       (sub-flujo concreto)
Workflow  →  gws-workflow-standup   (orquestación multi-servicio)
Persona   →  persona-exec-assistant (bundle de skills por rol)
Recipe    →  70+ archivos           (tarea concreta con nombre)
```

Cada nivel tiene un propósito distinto. Los agentes hacen routing por nivel, no buscan en todos los archivos.

**Implicación para ldev:** Actualmente ldev tiene skills de nivel Workflow (troubleshooting-liferay, migrating-journal-structures) pero casi nada en los niveles Action, Persona o Recipe. Los niveles que más reducen fricción son Action y Recipe.

---

#### Patrón 2 — Foundational Skill (gws-shared)

Existe un archivo `gws-shared/SKILL.md` que todas las demás skills referencian con `requires: ../gws-shared/SKILL.md`. Contiene:
- Opciones de autenticación
- Formatos de salida
- Postura de seguridad ("nunca outputar secrets", "confirmar antes de write/delete")
- El patrón `--dry-run`
- Gotchas de quoting en shell

Sin esta base, cada skill repite las mismas advertencias o asume que el agente las conoce.

**Implicación para ldev:** Crear `liferay-shared/SKILL.md` como base. El AGENTS.md existente cubre parte de esto, pero una skill explícita que otras skills pueden referenciar es más eficiente que depender de que el agente lea AGENTS.md completo cada vez.

---

#### Patrón 3 — La distinción `+verb`: wrappers simples vs. helpers complejos

La regla del repo es estricta:

> Un comando `+verb` solo se justifica cuando provee algo que la API discovery no puede: orquestación multi-step, traducción de formato, composición multi-API.

**Explícitamente prohibido:**
- Wrappers sobre una sola llamada API que ya existe en Discovery
- Flags que exponen campos de la respuesta (usar `--fields` + jq en vez de crear un flag nuevo)
- Duplicación de parámetros API como flags personalizados

**Flags legítimos de helpers:** `--dry-run`, `--subscription`, `--to`, `--subject` (controlan decisiones de orquestación, no filtros de datos).

**Implicación para ldev:** El principio es el mismo. `ldev resource export-structure` y `ldev resource structure` son prácticamente el mismo comando (2 API calls + file write). Deberían colapsar. Los comandos de search (`ldev portal search indices/mappings/query`) son literalmente 1 ES call cada uno y no añaden valor como comandos separados vs. una skill que enseña al agente cómo hacer la misma llamada directamente.

---

#### Patrón 4 — CONTEXT.md: Reglas de operación para agentes

Documento corto y enfocado con reglas operacionales para agentes:

```
- Si no conoces la estructura JSON exacta, corre `gws schema <resource>.<method>` primero
- Usa `--dry-run` para operaciones mutantes antes de ejecutar
- Usa field masks (--fields) para preservar tokens de contexto
- Las APIs de Workspace devuelven JSON grande — los agentes DEBEN filtrar
```

**Implicación para ldev:** El AGENTS.md actual es excelente como contrato de flujo (bootstrap → doctor → skill), pero no tiene las reglas de eficiencia de contexto: cuándo usar `--fields`, cómo inspeccionar esquemas antes de hacer POST, qué endpoints devuelven respuestas que saturan el contexto.

---

#### Patrón 5 — Comando `schema` para introspección

`gws schema <resource>.<method>` devuelve el schema OpenAPI del endpoint antes de ejecutarlo. La regla en CONTEXT.md es: "Si no conoces la estructura JSON exacta, corre `gws schema` primero."

Esto elimina ciclos de trial-and-error de API que:
1. Consumen cuota de API
2. Saturan el contexto con errores
3. Hacen que los agentes "adivinen" parámetros

**Implicación para ldev:** `ldev schema journal.articles.create` debería devolver el schema OpenAPI del endpoint. Liferay expone specs en `/o/openapi.yaml` por bundle. Un comando `ldev schema <entidad>.<método>` que parsee esos specs y devuelva el schema JSON del cuerpo de la request sería de alto valor para agentes.

---

#### Patrón 6 — NDJSON streaming para paginación

Todos los comandos con `--page-all` devuelven NDJSON (un JSON object por línea). Esto permite:
- Procesamiento incremental sin cargar toda la respuesta en contexto
- `jq` piping sin buffers intermedios
- Estimación de tamaño antes de procesar

**Implicación para ldev:** Los comandos `ldev portal inventory sites`, `ldev resource export-structures`, etc. devuelven arrays JSON. Si el inventario de un site tiene 500 artículos, el agente recibe un array de 500 objetos en un solo output. NDJSON resuelve esto: un artículo por línea, el agente puede procesar o truncar.

---

#### Patrón 7 — Field masks en todos los comandos

`--fields 'id,title,status'` envía field masks a la API y reduce el tamaño de la respuesta. Es crítico porque las APIs de Workspace (y Liferay) devuelven objetos con 30-100+ campos cuando los agentes generalmente necesitan 3-5.

**Implicación para ldev:** Un Journal Article de Liferay tiene ~40 campos en la respuesta. `ldev portal inventory sites` devuelve todos. La mayoría de tareas necesitan: `id`, `friendlyUrlPath`, `name`. Un flag `--fields` que haga projection en la respuesta antes de entregarla al agente ahorraría mucho contexto.

---

#### Patrón 8 — `.agent/workflows/`: tareas de mantenimiento auto-ejecutables

El archivo `verify-skills.md` es una tarea de agente reutilizable que:
1. Localiza todos los `skills/*/SKILL.md`
2. Corre `gws <service> --help` para cada servicio
3. Compara documentación vs. output real del CLI
4. Identifica discrepancias y actualiza los archivos afectados

Es documentación auto-mantenida: los agentes mantienen los docs sincronizados con el CLI real.

**Implicación para ldev:** Un workflow `.agent/workflows/verify-skills.md` que compare `ldev --help` con los SKILL.md existentes detectaría automáticamente cuando un comando cambia de firma y una skill queda desactualizada.

---

#### Patrón 9 — Auth por prioridad declarada

La cadena de auth es explícita en documentación y código:
```
1. ENV_TOKEN              → más prioritario, sin archivos
2. CREDENTIALS_FILE       → archivo JSON de credenciales
3. Keyring (~/.config/gws/) → AES-256-GCM, backend switchable
4. ADC fallback            → último recurso
```

El backend de keyring es configurable: `keyring` (default, OS keyring con fallback a archivo) vs. `file` (para Docker/CI/headless).

**Implicación para ldev:** El patrón `LIFERAY_TOKEN` env var → `~/.config/ldev/credentials.json` → OAuth interactivo ya existe en ldev. Lo que falta es documentarlo explícitamente en una foundational skill para que los agentes no asuman cómo está configurado el auth en cada contexto.

---

#### Patrón 10 — Persona Skills: bundles de skills por rol

```yaml
# persona-exec-assistant/SKILL.md
skills: [gws-gmail, gws-calendar, gws-drive]
workflows:
  - standup (daily)
  - email triage (up to 10, by sender priority)
  - meeting prep
guidelines:
  - draft replies, do not send without confirmation
  - confirm calendar modifications beforehand
```

Las personas le dicen al agente qué skills cargar y qué restricciones de comportamiento aplicar según el rol.

**Implicación para ldev:** `persona-content-editor` (bundle: journal, assets, workflow), `persona-portal-admin` (bundle: sites, roles, users, config), `persona-developer` (bundle: osgi, deploy, worktrees). Las personas son útiles cuando un proyecto tiene múltiples roles interactuando con ldev.

---

## 3. Comparativa: gws vs. ldev

| Dimensión | gws | ldev | Brecha |
|---|---|---|---|
| Skills disponibles | 100+ | 10 | Alta |
| Niveles de taxonomía | 5 (service/action/workflow/persona/recipe) | 2-3 (workflow/playbook) | Media-Alta |
| Foundational skill | `gws-shared/SKILL.md` | Parcialmente en AGENTS.md | Media |
| Comando de introspección de schema | `gws schema <resource>.<method>` | No existe | Alta |
| NDJSON streaming | `--page-all` en todos | No existe | Media |
| Field masks en respuestas | `--fields` universal | No existe | Media |
| `--dry-run` consistente | Obligatorio en todos los mutadores | Parcial (solo algunos comandos) | Media |
| Workflows de auto-mantenimiento | `.agent/workflows/verify-skills.md` | No existen | Baja |
| AGENTS.md / contrato de agente | Completo, incluye seguridad | Muy bueno en flujo | Baja |
| CONTEXT.md / reglas de eficiencia | Sí (schema-first, dry-run-first, field masks) | No existe explícitamente | Media |
| Persona skills | Sí | No existen | Baja |
| Seguridad inputs adversariales | Checklist completo, validators en código | No documentado explícitamente | Media |
| Compatibilidad skills.sh | `plugin.json` | Spec aprobado, pendiente implementar | Media (en progreso) |
| Auth priority stack documentado | Sí, en foundational skill | En código, no en skills | Baja |

**Leyenda:** Alta = bloqueante o causa errores frecuentes de agente, Media = causa trabajo innecesario, Baja = ergonomía.

---

## 4. Inventario completo de comandos

### Nomenclatura

- **API calls:** estimación de llamadas HTTP al API de Liferay/ES/Gogo por ejecución típica
- **Tipo:** `0` = solo filesystem/Docker, `L` = Liferay headless, `G` = Gogo Shell, `E` = Elasticsearch
- **Candidato skill:** `→S` si la operación es simple y se beneficia de documentación como skill rápida

---

### 4.1 Grupo: Core Workflows

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 1 | `ldev context` | 0 | — | Simple | — |
| 2 | `ldev setup` | 0 | — | Simple | — |
| 3 | `ldev start` | 0 | — | Simple | — |
| 4 | `ldev stop` | 0 | — | Simple | — |
| 5 | `ldev status` | 0 | — | Simple | — |
| 6 | `ldev logs` | 0 | — | Simple | — |
| 7 | `ldev logs diagnose` | 0 | — | Media | — |
| 8 | `ldev shell` | 0 | — | Trivial | — |
| 9 | `ldev doctor` | 1-3 | L | Media | — |

---

### 4.2 Grupo: Portal / Liferay

#### Auth y configuración

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 10 | `ldev portal check` | 2 | L | Simple | `→S` |
| 11 | `ldev portal auth token` | 1 | L | Trivial | `→S` |
| 12 | `ldev portal config get` | 0 | — | Simple | — |
| 13 | `ldev portal config set` | 0 | — | Simple | — |
| 14 | `ldev portal audit` | 4 | L | Simple | `→S` |

#### Inventario

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 15 | `ldev portal inventory sites` | 1-N+2 | L | Simple-Media | `→S` |
| 16 | `ldev portal inventory pages` | 1+N | L | Media | — |
| 17 | `ldev portal inventory page` | 4-8+ | L | Alta | — |
| 18 | `ldev portal inventory structures` | 1-N | L | Simple-Media | `→S` |
| 19 | `ldev portal inventory templates` | 1-2 | L | Simple | `→S` |
| 20 | `ldev portal inventory where-used` | N×M | L | Muy Alta | — |
| 21 | `ldev portal inventory preflight` | 3 | L | Simple | `→S` |

#### Contenido

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 22 | `ldev portal content prune` | N×delete | L | Alta | — |

#### Page Layout

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 23 | `ldev portal page-layout diff` | 4-16 | L | Media | — |
| 24 | `ldev portal page-layout export` | 4-8 | L | Media | — |

#### Search (Elasticsearch)

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 25 | `ldev portal search indices` | 1 | E | Simple | `→S` |
| 26 | `ldev portal search mappings` | 1 | E | Simple | `→S` |
| 27 | `ldev portal search query` | 1 | E | Simple | `→S` |

#### Theme

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 28 | `ldev portal theme-check` | 3 | L | Simple | `→S` |

#### Reindex

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 29 | `ldev portal reindex status` | 1 | E | Trivial | `→S` |
| 30 | `ldev portal reindex watch` | N (polling) | E | Media | — |
| 31 | `ldev portal reindex speedup-on` | 1 | E | Trivial | `→S` |
| 32 | `ldev portal reindex speedup-off` | 1 | E | Trivial | `→S` |
| 33 | `ldev portal reindex tasks` | 1 | E | Trivial | `→S` |

---

### 4.3 Grupo: OAuth

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 34 | `ldev oauth install` | 4-8 | L+G | Alta | — |
| 35 | `ldev oauth admin-unblock` | 2-3 | L | Simple | `→S` |

---

### 4.4 Grupo: Resource

#### Lectura

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 36 | `ldev resource structure` | 2 | L | Simple | `→S` |
| 37 | `ldev resource template` | 2-3 | L | Simple | `→S` |
| 38 | `ldev resource adt` | 2-4 | L | Media | `→S` |
| 39 | `ldev resource adts` | 2-3 | L | Simple | `→S` |
| 40 | `ldev resource fragments` | 2 | L | Simple | `→S` |

#### Exportación

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 41 | `ldev resource export-structure` | 2 | L | Trivial | `→S` |
| 42 | `ldev resource export-template` | 2-3 | L | Trivial | `→S` |
| 43 | `ldev resource export-structures` | N | L | Media | — |
| 44 | `ldev resource export-templates` | N | L | Media | — |
| 45 | `ldev resource export-adt` | 2-4 | L | Simple | `→S` |
| 46 | `ldev resource export-adts` | N | L | Media | — |
| 47 | `ldev resource export-fragment` | 3-5 | L | Media | — |
| 48 | `ldev resource export-fragments` | N | L | Media-Alta | — |

#### Importación

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 49 | `ldev resource import-structure` | 3-6 | L | Alta | — |
| 50 | `ldev resource import-template` | 3-5 | L | Media-Alta | — |
| 51 | `ldev resource import-adt` | 3-5 | L | Media | — |
| 52 | `ldev resource import-fragment` | 3-6 | L | Alta | — |
| 53 | `ldev resource import-fragments` | N×3-6 | L | Alta | — |
| 54 | `ldev resource import-structures` | N×3-6 | L | Alta | — |
| 55 | `ldev resource import-templates` | N×3-5 | L | Alta | — |
| 56 | `ldev resource import-adts` | N×3-5 | L | Alta | — |

#### Migración

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 57 | `ldev resource migration-init` | 2-3 | L | Media | — |
| 58 | `ldev resource migration-pipeline` | 10-50+ | L | Muy Alta | — |

---

### 4.5 Grupo: OSGi

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 59 | `ldev osgi gogo` | 0 | G | Trivial | — |
| 60 | `ldev osgi status <bundle>` | 1 | G | Simple | `→S` |
| 61 | `ldev osgi diag <bundle>` | 1 | G | Simple | `→S` |
| 62 | `ldev osgi thread-dump` | N | G | Simple | — |
| 63 | `ldev osgi heap-dump` | 1 | G | Trivial | `→S` |

---

### 4.6 Grupo: Deploy

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 64 | `ldev deploy all` | 0 | — | Media | — |
| 65 | `ldev deploy prepare` | 0 | — | Media | — |
| 66 | `ldev deploy module <module>` | 0 | — | Simple | — |
| 67 | `ldev deploy theme` | 0 | — | Simple | — |
| 68 | `ldev deploy service` | 0 | — | Simple | — |
| 69 | `ldev deploy watch` | 0 | — | Media | — |
| 70 | `ldev deploy status` | 0-1 | — | Simple | — |
| 71 | `ldev deploy cache-update` | 0 | — | Simple | — |

---

### 4.7 Grupo: Environment

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 72 | `ldev env init` | 0 | — | Simple | — |
| 73 | `ldev env restore` | 0 | — | Simple | — |
| 74 | `ldev env clean` | 0 | — | Simple | — |
| 75 | `ldev env restart` | 0 | — | Simple | — |
| 76 | `ldev env recreate` | 0 | — | Simple | — |
| 77 | `ldev env wait` | 0 | — | Simple | — |
| 78 | `ldev env diff` | 0 | — | Simple | — |
| 79 | `ldev env is-healthy` | 0 | — | Trivial | — |

---

### 4.8 Grupo: Database

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 80 | `ldev db import` | 0 | — | Simple | — |
| 81 | `ldev db download` | 0 | LCP | Simple | — |
| 82 | `ldev db sync` | 0 | LCP | Media | — |
| 83 | `ldev db query` | 0 | — | Simple | — |
| 84 | `ldev db files-download` | 0 | LCP | Simple | — |
| 85 | `ldev db files-mount` | 0 | — | Simple | — |
| 86 | `ldev db files-detect` | 0 | — | Trivial | — |

---

### 4.9 Grupo: Worktree

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 87 | `ldev worktree setup` | 0 | — | Media | — |
| 88 | `ldev worktree start` | 0 | — | Simple | — |
| 89 | `ldev worktree env` | 0 | — | Simple | — |
| 90 | `ldev worktree list` | 0 | — | Simple | — |
| 91 | `ldev worktree status` | 0 | — | Simple | — |
| 92 | `ldev worktree clean` | 0 | — | Simple | — |
| 93 | `ldev worktree gc` | 0 | — | Simple | — |
| 94 | `ldev worktree btrfs-refresh-base` | 0 | — | Simple | — |

---

### 4.10 Grupo: Agent / AI y Project

| # | Comando | API calls | Tipo | Complejidad | Candidato skill |
|---|---|---|---|---|---|
| 95 | `ldev ai bootstrap` | 0-3 | L | Media | — |
| 96 | `ldev project init` | 0-1 | — | Media | — |
| 97 | `ldev dashboard` | Indirecto | L | Alta | — |

---

### 4.11 Resumen estadístico

| Categoría | Cantidad |
|---|---|
| Total de comandos | 97 |
| Comandos con 0 API calls (filesystem/Docker) | 47 (48%) |
| Comandos con 1-2 API calls | 24 (25%) |
| Comandos con 3-8 API calls | 18 (19%) |
| Comandos con N API calls (operaciones bulk) | 8 (8%) |
| Comandos candidatos a skill `→S` | 28 (29%) |
| Skills actuales | 10 |

---

## 5. Clasificación por complejidad y candidatos a simplificación

### 5.1 Comandos que son thin wrappers (candidatos priority skills)

Estos 28 comandos hacen 0-4 API calls y su complejidad principal es documentar el uso correcto para agentes. Son los mejores candidatos para skills de tipo **Action**:

```
ldev portal check              → 2 API calls (OAuth + health probe)
ldev portal auth token         → 1 API call (OAuth token)
ldev portal audit              → 4 API calls (snapshot de salud)
ldev portal inventory sites    → 1 API call (list sites)
ldev portal inventory structures → 1-N API calls
ldev portal inventory templates → 1-2 API calls
ldev portal inventory preflight → 3 API calls (cached)
ldev portal search indices     → 1 ES call
ldev portal search mappings    → 1 ES call
ldev portal search query       → 1 ES call
ldev portal theme-check        → 3 HTTP GETs
ldev portal reindex status     → 1 ES call
ldev portal reindex speedup-on → 1 ES call
ldev portal reindex speedup-off → 1 ES call
ldev portal reindex tasks      → 1 ES call
ldev oauth admin-unblock       → 2-3 API calls
ldev resource structure        → 2 API calls
ldev resource template         → 2-3 API calls
ldev resource adt              → 2-4 API calls
ldev resource adts             → 2-3 API calls
ldev resource fragments        → 2 API calls
ldev resource export-structure → 2 API calls + file write
ldev resource export-template  → 2-3 API calls + file write
ldev resource export-adt       → 2-4 API calls + file write
ldev osgi status <bundle>      → 1 Gogo call
ldev osgi diag <bundle>        → 1 Gogo call
ldev osgi heap-dump            → 1 Gogo call
```

### 5.2 Oportunidades de colapso de comandos

Dos grupos de comandos hacen casi exactamente lo mismo:

**Group A: export-structure / structure**

`ldev resource structure` lee una estructura (2 API calls) y la muestra en stdout.
`ldev resource export-structure` lee la misma estructura (2 API calls) y la escribe en un archivo.

La única diferencia es el destino del output. Se podría colapsar con un flag `--out <file>`:

```bash
# Actual (2 comandos, misma lógica)
ldev resource structure --site /estudis --key FOO_STRUCTURE
ldev resource export-structure --site /estudis --key FOO_STRUCTURE

# Propuesta (1 comando)
ldev resource structure --site /estudis --key FOO_STRUCTURE
ldev resource structure --site /estudis --key FOO_STRUCTURE --out ./structures/
```

Lo mismo aplica a `template`/`export-template` y a `adt`/`export-adt`.

**Estimación de reducción:** 3 archivos de feature eliminables (~90 LOC cada uno = ~270 LOC), 3 registros de comando eliminables (~20 LOC cada uno = ~60 LOC). Total: ~330 LOC de código de producción.

---

**Group B: reindex speedup-on / speedup-off**

Son comandos opuestos que llaman exactamente el mismo endpoint con valores distintos:
- `speedup-on` → `PUT _settings { "refresh_interval": "-1" }`
- `speedup-off` → `PUT _settings { "refresh_interval": "1s" }`

Se podría colapsar en `ldev portal reindex speedup [--on|--off]` o simplemente documentarlo como una skill de dos pasos.

---

### 5.3 Comandos de alta complejidad que deben mantenerse

Estos comandos tienen lógica real que no puede simplificarse:

| Comando | Por qué mantenerlo |
|---|---|
| `ldev portal inventory page` | 4-8+ API calls, normalización de layout, fragments, portlets |
| `ldev portal inventory where-used` | Concurrencia N×M, crawl multi-site |
| `ldev portal inventory pages` | Árbol recursivo con depth control |
| `ldev portal content prune` | Pipeline bulk-delete con dry-run y plan |
| `ldev portal page-layout diff/export` | Normalización de layout + comparación |
| `ldev resource import-structure` | ImportStrategy lifecycle completo |
| `ldev resource migration-pipeline` | Orquestador de 828 líneas, multi-fase |
| `ldev oauth install` | Bundle lifecycle + credential management |
| `ldev ai bootstrap` | Intent-dispatched multi-check aggregator |

---

## 6. Brechas identificadas

### P0 — Brechas que causan fallos o errores frecuentes de agentes

#### Brecha 1: No existe skill `liferay-discovery` (foundational)

Cuando un agente arranca una tarea nueva, necesita:
1. Resolver el site (friendly URL o ID)
2. Obtener un token OAuth
3. Confirmar que el portal responde

Este flujo se repite en TODOS los comandos de portal. Sin una skill que lo documente explícitamente, cada skill de nivel superior lo reimplementa o asume que el agente ya lo sabe.

**Acción:** Crear `skills/liferay-discovery/SKILL.md` como foundational skill. Punto de entrada para resolución de contexto antes de cualquier operación con el portal.

---

#### Brecha 2: No existe `--dry-run` en `ldev portal content prune`

Este comando hace bulk-deletes irreversibles. Tiene un flag `--plan` que genera un plan de borrado, pero no un `--dry-run` universalmente nombrado. Los agentes que conocen el patrón `--dry-run` de gws no encontrarán el flag correcto.

**Acción:** Aliasear `--plan` como `--dry-run` (o al revés) en el comando `content prune` para alinearlo con el patrón universal.

---

#### Brecha 3: Skills existentes referencian paths de proyectos específicos

El ROADMAP.md ya lo identifica: `developing-liferay/references/theme.md` referencia `liferay/themes/` y `fragments.md` referencia `liferay/ub-fragments/`. Estos son paths de proyectos concretos, no paths de la skill vendor.

Esto causa que los agentes lean instrucciones con paths incorrectos para su proyecto actual.

**Acción:** Parametrizar los paths con `{PROJECT_ROOT}` o eliminar la referencia y reemplazarla por instrucción de descubrir el path via `ldev context --json`.

---

#### Brecha 4: CONTEXT.md de eficiencia para agentes no existe

El AGENTS.md tiene el contrato de flujo pero no las reglas de eficiencia de contexto (schema-first, field masks, NDJSON). Los agentes que interactúan con inventarios grandes de Liferay saturan su contexto innecesariamente.

**Acción:** Crear `docs/ai/CONTEXT.md` (o sección en AGENTS.md) con:
- Campos mínimos necesarios para cada operación común
- Cómo filtrar respuestas antes de procesarlas
- Cuándo usar `--json` vs. salida tabular
- Límite recomendado de páginas/artículos antes de paginar

---

### P1 — Brechas que producen trabajo innecesario

#### Brecha 5: No hay skill de tipo Action para operaciones de portal comunes

Las 10 skills actuales son todas de tipo Workflow (playbooks largos). No hay skills de tipo Action para tareas frecuentes como:
- "Dame el token OAuth del portal local"
- "Lista los sites accesibles"
- "Muéstrame el estado del reindex"
- "¿Cuántos artículos de estructura X tiene el site Y?"

Estas tareas duran 1-2 comandos pero sin una skill que las documente, los agentes pasan por el bootstrap completo o leen el `--help` antes de ejecutar.

**Acción:** Crear al menos 5 skills de tipo Action de alta frecuencia (ver plan en sección 7).

---

#### Brecha 6: Respuestas de inventario saturan contexto

`ldev portal inventory sites` devuelve JSON completo de cada site. `ldev portal inventory structures` devuelve estructuras con todos sus campos. Un site con 20 estructuras devuelve ~200 líneas de JSON que el agente tiene que procesar para extraer solo `name` y `key`.

**Acción corta plazo:** Documentar en CONTEXT.md qué campos son necesarios para operaciones comunes.
**Acción largo plazo:** Implementar `--fields` projection o `--summary` para reducir verbosidad.

---

#### Brecha 7: No hay workflow de verificación de skills

Cuando cambia la firma de un comando (nuevo flag, flag renombrado, output format change), las skills pueden quedar desactualizadas sin que nadie lo detecte hasta que un agente falla.

**Acción:** Crear `.agent/workflows/verify-skills.md` como tarea de agente que compare `ldev --help` con los SKILL.md existentes.

---

#### Brecha 8: Taxonomía de skills no usa niveles Action y Recipe

Las 10 skills actuales cubren flujos complejos pero no tienen granularidad de acción individual. Los niveles Action y Recipe de gws son los que más reducen fricción porque responden preguntas concretas y frecuentes.

**Acción:** Crear un plan de 5-10 skills de nivel Action (ver sección 7).

---

### P2 — Mejoras de ergonomía

#### Brecha 9: `export-structure` duplica `resource structure` + file write

Ver sección 5.2. Oportunidad de reducir código sin sacrificar usabilidad.

#### Brecha 10: `reindex speedup-on/off` son comandos espejo

Ver sección 5.2. Pueden documentarse mejor como skill de dos pasos.

#### Brecha 11: No hay skills de tipo Persona

Para proyectos con múltiples roles usando ldev, las persona skills agrupan las skills relevantes por rol y establecen restricciones de comportamiento. No existe ninguna actualmente.

**Acción:** Crear 2-3 persona skills básicas cuando la taxonomía de Action esté más completa.

---

## 7. Plan de acción priorizado

### Sprint 1 — Fundacional (1-2 semanas)

#### 1.1 Crear `liferay-discovery` como foundational skill

```
skills/liferay-discovery/
├── SKILL.md          # Auth, resolución de site, health check
├── agents/
│   └── openai.yaml
└── references/
    ├── auth.md       # OAuth priority stack
    └── site-resolution.md
```

La skill responde a: "¿Cómo me autentico y cómo resuelvo el site antes de cualquier operación?"

Comandos que documenta: `ldev portal check`, `ldev portal auth token`, `ldev portal inventory preflight`.

---

#### 1.2 Crear `docs/ai/CONTEXT.md`

Reglas de eficiencia de contexto:

```markdown
# Reglas de eficiencia de contexto para ldev

## Antes de una operación de lectura
- Si necesitas solo ID y nombre de un site, usa: `ldev portal inventory sites --json | jq '[.[] | {id, name, friendlyUrlPath}]'`
- Si no conoces el siteId necesario para un recurso, usa: `ldev portal inventory sites --json` primero

## Campos mínimos por operación
| Operación              | Campos necesarios               |
|---|---|
| Resolver site          | id, friendlyUrlPath             |
| Listar estructuras     | key, name                       |
| Import structure       | key, name, availableLanguages   |
| Verificar article      | id, title, status               |

## Límites de paginación
- Liferay devuelve max 20 items por página por defecto
- Para inventarios grandes usa `--page-size 50` (max 200)
- Agentes: no proceses más de 3 páginas sin pedir confirmación al usuario

## Respuestas que saturan contexto
- `ldev portal inventory page`: puede devolver 50+ KB. Usa --json y filtra con jq.
- `ldev portal inventory where-used`: puede tardar 2+ min. Confirmar antes de ejecutar.
- `ldev resource migration-pipeline`: no ejecutar sin dry-run previo.
```

---

#### 1.3 Parametrizar paths en skills existentes

En `developing-liferay/references/theme.md` y `developing-liferay/references/fragments.md`, reemplazar paths hardcodeados por:

```markdown
> **Path del proyecto:** Obtén el directorio raíz via `ldev context --json | jq '.project.rootDir'`.
> El directorio de themes típicamente está en `<rootDir>/liferay/themes/`.
```

---

### Sprint 2 — Skills de Action (2-3 semanas)

Crear las 5 skills de Action de mayor frecuencia:

#### 2.1 `skills/ldev-portal-health/SKILL.md`
- Cubre: `ldev portal check`, `ldev portal audit`, `ldev portal inventory preflight`
- Responde a: "¿El portal está accesible y autenticado?"
- Tamaño objetivo: 40-50 líneas

#### 2.2 `skills/ldev-portal-inventory/SKILL.md`
- Cubre: `ldev portal inventory sites`, `structures`, `templates`, `pages`
- Responde a: "¿Qué hay en este portal?" y "¿Cómo resuelvo un site/estructura/template?"
- Tamaño objetivo: 60 líneas + reference de field selection

#### 2.3 `skills/ldev-reindex/SKILL.md`
- Cubre: `ldev portal reindex status`, `watch`, `speedup-on`, `speedup-off`, `tasks`
- Responde a: "¿Cómo sigo y acelero un reindex?"
- Tamaño objetivo: 50 líneas

#### 2.4 `skills/ldev-osgi-debug/SKILL.md`
- Cubre: `ldev osgi status`, `diag`, `thread-dump`, `heap-dump`
- Responde a: "¿Cómo diagnostico un bundle OSGi?"
- Tamaño objetivo: 45 líneas

#### 2.5 `skills/ldev-resource-read/SKILL.md`
- Cubre: `ldev resource structure`, `template`, `adt`, `fragments`
- Responde a: "¿Cómo leo un recurso del portal para ver su estado actual?"
- Tamaño objetivo: 55 líneas

---

### Sprint 3 — Reducción de código (1-2 semanas)

#### 3.1 Colapsar export-structure / resource structure

```typescript
// Añadir --out flag a resource structure
// ldev resource structure --site /foo --key BAR → stdout JSON
// ldev resource structure --site /foo --key BAR --out ./structures/ → escribe archivo

// Eliminar src/features/liferay/resource/liferay-resource-export-structure.ts (~31 LOC)
// Eliminar src/features/liferay/resource/liferay-resource-export-template.ts (~24 LOC)
// Eliminar src/features/liferay/resource/liferay-resource-export-adt.ts (~parte del archivo)
// Simplificar resource-export-commands.ts
```

**Estimación:** ~330 LOC de producción eliminables + actualización de tests.

#### 3.2 Aliasear `--plan` como `--dry-run` en content prune

```typescript
// En content.command.ts, añadir .alias('--dry-run') al flag --plan
// O añadir --dry-run como flag separado con la misma lógica
```

---

### Sprint 4 — Mejoras de eficiencia de contexto (largo plazo)

#### 4.1 Flag `--fields` para projection de respuestas

Implementar en `LiferayGateway` un helper de projection que filtre campos antes de devolver al CLI:

```typescript
// ldev portal inventory sites --fields 'id,name,friendlyUrlPath'
// → Aplica proyección en cliente (o pasa fields a la API si soporta $fields)
```

#### 4.2 NDJSON streaming para comandos de inventario bulk

Para `ldev portal inventory sites --page-all` y similares, implementar streaming NDJSON en vez de un array JSON grande.

#### 4.3 Workflow de auto-verificación de skills

Crear `.agent/workflows/verify-skills.md`:

```markdown
# Verificar sincronización de skills con CLI

1. Para cada skill en skills/*/SKILL.md, extraer los comandos ldev que documenta.
2. Para cada comando, correr `ldev <comando> --help` y verificar que las flags y opciones documentadas aún existen.
3. Reportar discrepancias: flags renombradas, comandos eliminados, nuevos flags sin documentar.
4. Actualizar los SKILL.md afectados.
```

---

## 8. Estimación de impacto

### 8.1 Reducción de código de producción

| Acción | LOC eliminables | Complejidad del cambio |
|---|---|---|
| Colapsar export-structure/template/adt | ~330 LOC src + ~200 LOC tests | Baja |
| Eliminar `ldev ai update` (ya en spec) | ~150 LOC src | Baja (spec aprobado) |
| Simplificar ai-install.ts (ya en spec) | ~200 LOC src | Media |
| Eliminar workspace-rules (ya en spec) | ~100 LOC src | Baja |
| **Total estimado** | **~780 LOC** | |

### 8.2 Mejora de eficiencia de agentes

| Mejora | Impacto estimado |
|---|---|
| 5 skills de tipo Action | Reducción de ciclos de bootstrap innecesarios en ~30% de tareas simples |
| `liferay-discovery` foundational | Elimina ~20% de reintentos por auth fallida o site mal resuelto |
| CONTEXT.md de eficiencia | Reducción de tokens de contexto en ~15% para tareas de inventario |
| `--dry-run` universal en mutadores | Elimina 100% de ejecuciones accidentales de bulk ops por agentes |

### 8.3 Priorización final

```
Impacto Alto   / Esfuerzo Bajo:   liferay-discovery, CONTEXT.md, parametrizar paths
Impacto Alto   / Esfuerzo Medio:  5 skills de Action, colapsar export commands
Impacto Medio  / Esfuerzo Bajo:   verify-skills workflow, aliasear --dry-run
Impacto Medio  / Esfuerzo Alto:   --fields projection, NDJSON streaming
Impacto Bajo   / Esfuerzo Bajo:   persona skills
```

---

## Apéndice: Skills existentes y sus gaps

| Skill | Nivel actual | Gap principal |
|---|---|---|
| `liferay-expert` | Router | Necesita routing a skills de Action cuando estén creadas |
| `developing-liferay` | Playbook | Paths hardcodeados, references muy largas |
| `isolating-worktrees` | Playbook | Sin gaps críticos |
| `deploying-liferay` | Playbook | Referencia externa a THEME_DEPLOY (OK, absorbida en spec) |
| `troubleshooting-liferay` | Playbook | Necesita referencia a LCP sync workflow (ROADMAP P1#9) |
| `runtime-change-workflow` | Playbook | Sin gaps críticos |
| `portal-resource-workflow` | Playbook | Sin gaps críticos |
| `migrating-journal-structures` | Playbook | Sin gaps críticos |
| `automating-browser-tests` | Playbook | Sin gaps críticos |
| `capturing-session-knowledge` | Utilidad | Sin gaps críticos |

**Skills que no existen y deberían:** `liferay-discovery` (P0), `ldev-portal-health` (P1), `ldev-portal-inventory` (P1), `ldev-reindex` (P1), `ldev-osgi-debug` (P1), `ldev-resource-read` (P1).

---

*Este documento es un análisis vivo. Actualizar cuando se complete cada sprint o cuando se identifiquen nuevas brechas.*
