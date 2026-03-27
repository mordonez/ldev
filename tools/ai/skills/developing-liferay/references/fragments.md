---
name: developing-page-fragments
description: "Desarrollar y mantener fragment sets de paginas en Liferay DXP usando Fragments Editor y flujos de importacion por API en este repositorio. Cubrir configuracion de fragmentos, validaciones, drop zones, custom fields, estilos, recursos por defecto, orden de elementos, form fragments y compatibilidad/deprecaciones por version. Usar cuando se creen, modifiquen o depuren page fragments."
---

# Desarrollo de page fragments

Trabajar siempre sobre la fuente versionada del repositorio.

Fuentes de verdad (`liferay/fragments/sites/<site>/`):
- `liferay/fragments/sites/<site>/src/` (todas las colecciones del site)
  - El site principal es `global/`, el resto son sites específicos.
- `liferay/fragments/sites/<site>/src/<collection>/collection.json` (metadata por coleccion)
- `liferay/fragments/sites/<site>/src/<collection>/fragments/<slug>` (codigo de cada fragment)

Para detalles de compatibilidad y patrones de implementacion, cargar:
- [developing-page-fragments.md](developing-page-fragments.md)

## Comandos base

```bash
task liferay -- resource fragments --site /global
task liferay -- inventory page --url <pageUrl>
task env:logs SINCE=2m
```

## Flujo minimo

1. Editar fragmento existente en `liferay/fragments/sites/<site>/src/<collection>/fragments/<slug>`.
2. Implementar HTML/CSS/JS y configuracion manteniendo convenciones de cada fragmento (`main.*` o `index.*` segun `fragment.json`).
3. Añadir validaciones de configuracion y defaults null-safe en runtime.
4. Validar JSON de fragments.
5. Aplicar el cambio por el workflow explícito del proyecto o UI; `dev-cli` actual no importa fragmentos.
6. Verificar en Page Editor + logs de Liferay.

## Reglas operativas

- No crear fuentes paralelas fuera de `liferay/fragments/sites/<site>/src`.
- No fusionar ni eliminar colecciones homonimas por nombre visible; mantener los slugs exportados por BD.
- No reordenar arbitrariamente los campos en `fragment.json`; el orden es significativo para la UI.
- Si un fragmento tiene un `editableId` con valor `null` en `fragmententrylink.editablevalues`, puede causar NPE al importar XLIFF. Revisar el override de `InfoItemFieldValuesProvider` si el proyecto lo tiene.
