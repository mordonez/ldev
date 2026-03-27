---
name: migrating-journal-structures
description: "Usar cuando se necesite cambiar estructuras/plantillas de Journal con migración de contenido (incluyendo fieldsets reutilizables), validación y cleanup seguro sin pérdida de datos."
---

# Migración de estructuras Journal (genérica)

> Estado actual: `dev-cli` no implementa todavía `structure-migration-pipeline`, `structure-sync-all`, `template-sync-all`, `export-and-sync` ni otros flujos mutantes grandes. Usa esta skill como playbook de diseño, validación y ejecución manual controlada, no como catálogo de comandos disponibles hoy.

## Objetivo

Ejecutar cambios de estructuras y plantillas de Web Content con migración de datos de forma segura, repetible y verificable para cualquier issue.

## Cuándo usar este skill

- Añadir campos nuevos en una estructura existente.
- Introducir/referenciar fieldsets reutilizables (site actual o `/global`).
- Mover datos de `oldField -> newField` (incluyendo nested/repeatables).
- Ejecutar cleanup de campos antiguos cuando ya está validado.

## Reglas críticas

- Usar `migration.phase=post` como default.
- Primero validar en entorno restaurable y acotado; después ejecutar el cambio real por el workflow manual que corresponda.
- Para fieldsets reutilizables, preparar antes la estructura en `/global`.
- Evitar `includeDrafts=true` salvo necesidad explícita (penaliza tiempo).
- En ejecuciones one-shot con auto-transition, `RUN_CLEANUP` suele ser redundante.

## Fases `pre` vs `post` (regla operativa)

- `post`:
  - Orden: sync estructura -> migración de contenidos.
  - Uso recomendado para la migración principal.
  - Motivo: garantiza que el target ya existe al mapear datos.

- `pre`:
  - Orden: migración de contenidos -> sync estructura.
  - Uso recomendado para cleanup (segunda fase) o casos excepcionales donde el target ya existe y no se quiere sync previo.

Decisión rápida:
- Cambio normal de estructura con campos nuevos + migración: `migration.phase=post`.
- Eliminación de campos legacy en una segunda ejecución: `cleanup.phase=pre`.
- One-shot con auto-transition y estructura final aplicada en la misma ejecución: `RUN_CLEANUP` normalmente no aporta.

## Flujo recomendado (2 fases)

### Fase A: introducción segura (sin borrar origen)

1) Preparar cambios en JSON:
- Estructura objetivo: `liferay/resources/journal/structures/<site>/<STRUCTURE>.json`
- Si hay fieldset reutilizable nuevo: `liferay/resources/journal/structures/global/<FIELDSET>.json`
- Plantillas `.ftl`: fallback temporal a campo viejo si el nuevo está vacío.

2) Descriptor de migración:
- Crear fichero en `liferay/resources/journal/migrations/YYYY-MM-DD-<slug>.json`
- Basarse en `liferay/resources/journal/migrations/migration-descriptor.example.json`
- Mantenerlo simple: `site`, `structureKey`, `migration.plan.mappings`
- Si la estructura referencia fieldsets reutilizables globales, declarar `globalStructures[]` para que el pipeline los sincronice/cree en `/global` antes de tocar la estructura objetivo.
- Para acotar población:
  - `migration.plan.articleIds[]` (diagnóstico puntual)
  - `migration.plan.folderIds[]` (carpetas exactas)
  - `migration.plan.rootFolderIds[]` (árbol completo: carpeta raíz + descendientes por `treePath`)

3) Validación previa:
- revisar el descriptor
- confirmar recursos implicados con `inventory structures`, `inventory templates`, `resource structure`, `resource template`
- probar sobre un entorno restaurable del worktree antes de tocar datos reales

4) Ejecución:
- aplicar el cambio por el workflow manual/humano del proyecto
- documentar exactamente qué se ejecutó y con qué alcance

### Fase B: cleanup (solo si hace falta)

1) Confirmar validación funcional (UI + contenidos reales + template/headless).
2) Descriptor de cleanup con `cleanupSource=true`.
3) Ejecutar cleanup solo si en Fase A no se aplicó ya la estructura final, y siempre con rollback claro y validación previa.
4) Sincronizar plantillas sin fallback al campo viejo.

## Validación mínima obligatoria

1) Integridad de recursos:
```bash
task liferay -- inventory structures --site /<site>
task liferay -- inventory templates --site /<site>
task liferay -- resource structure --key <STRUCTURE_KEY> --site /<site>
task liferay -- resource template --id <TEMPLATE_ID> --site /<site>
```

2) Validación funcional:
- Abrir 20-30 contenidos reales (incluyendo publicados + borradores).
- Verificar que nuevos campos están poblados y no se perdieron datos legacy.
- Verificar páginas públicas afectadas y editores de contenido.

3) Validación visual automatizada (si hay rendering):
- Usar `playwright-cli` para capturas/aserciones de páginas críticas.

4) Reindexación:
- Si los campos afectan búsquedas/filtros, ejecutar reindex de Journal según runbook operativo (`task reindex` / `task reindex-watch`).

## Plantilla de descriptor

Usar siempre:
- `liferay/resources/journal/migrations/migration-descriptor.example.json`

Campos clave:
- `site`
- `structureKey`
- `globalStructures[]` (opcional)
- `templates[]` (opcional; si no está, listar explícitamente qué templates quedan dentro del alcance)
- Si el proyecto necesita comandos bulk/mutantes, tratarlos como runbook separado y no asumir que existen en `dev-cli`.
- `cleanupDescriptor` (opcional)
- `migration.phase` (`post` recomendado)
- `migration.includeDrafts`
- `migration.cleanupSource`
- `migration.plan.useBatchEngine` (opcional, recomendado en migraciones grandes)
- `migration.plan.batchSize` (opcional, default sugerido: 200)
- `migration.plan.articleIds[] | folderIds[] | rootFolderIds[]` (opcional, recomendado para iteración y control de alcance)
- `migration.plan.mappings[]`

## Troubleshooting rápido

- Si desaparecen datos en masa: restaurar entorno del worktree y repetir con `--check-only`.
```bash
task env:stop
task env:init -- --clone-volumes
task env:start
```

- Si falla referencia de fieldset: comprobar que existe en `/global` y que la referencia usa key/ERC resoluble.
- Si `journal articles listados` es muy alto: acotar por `rootFolderIds` o `folderIds` antes de relanzar.
- Si `migrated=0` y `mappingsApplied=0`: revisar que `source` use field references base (no nombres con sufijo fijo).
- Si la validación muestra diffs inesperados fuera de scope: parar y revisar JSON exportado antes de cualquier cambio real.

## Evidencia mínima de cierre

- Descriptor de migración y descriptor de cleanup versionados.
- Validación verde y acotada para estructuras/plantillas en un entorno restaurable.
- Validación funcional documentada (URL + resultado).
- Sin cambios inesperados respecto al alcance documentado del descriptor y la validación manual.
