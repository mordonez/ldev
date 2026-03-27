---
name: troubleshooting-liferay
description: "Especialista en diagnóstico y resolución de fallos Liferay DXP. Usar cuando el portal no arranca, un bundle está en Installed/Resolved, o hay una regresión funcional o visual sin causa raíz clara. El punto de entrada recomendado para tareas técnicas Liferay es /liferay-expert."
---

# Resolución de Problemas en Liferay (Depurador de Liferay)

> Para tareas técnicas Liferay, el entrypoint recomendado es `/liferay-expert`. Esta skill es la especialista de dominio para diagnosticar fallos de runtime, bundles caídos y regresiones.

Esta skill proporciona una metodología estructurada para diagnosticar y resolver problemas específicos de Liferay, desde el OSGi wiring hasta inconsistencias en la base de datos.

## 🔄 El Ciclo de Vida de la Resolución de Problemas (Obligatorio)

### 1. Investigación y Recolección de Datos
- **Análisis de Logs**: `task env:logs SINCE=10m`.
- **Estado del Bundle**: `task osgi:status` o `task osgi:diag -- <bundle>`.
- **Estado del Entorno**: `task env:info`.
- **Heurística de Conectividad**: Si las herramientas del repositorio fallan con `java.net.ConnectException`, asume primero que el entorno local está caído o que se está apuntando al worktree equivocado. Ejecuta `task env:info` y `task env:start` antes de un diagnóstico más profundo.

### 2. Estrategia e Hipótesis
- **Aislar la Causa**: Determina si es un cambio de código, un problema de configuración o una inconsistencia de datos.
- **Formular la Solución**: Decide la forma menos intrusiva de resolver el problema.

### 3. Ejecución (Recuperación)
- **Aplicar el Fix**: Actualiza la configuración, vuelve a desplegar el módulo o ejecuta comandos de la shell de Gogo.
- **Reinicio del Entorno**: Usa `task env:init -- --clone-volumes` si la base de datos está corrupta.

### 4. Validación y Verificación
- **Comprobación Funcional**: Confirma que el fallo se ha resuelto.
- **Prueba de Causa Raíz**: Documenta por qué funcionó la solución para prevenir que se repita.

---

## Diagnóstico guiado

```bash
task env:info
task env:logs SINCE=5m
task osgi:status -- <com.example.bundle.name>
task osgi:diag -- <com.example.bundle.name>
task osgi:gogo -- "lb | grep -i <bundle-fragment>"
```

## Flujo base

1. Confirmar la salud del portal.
2. Acotar el síntoma (OSGi, arranque, FTL, CSS, fragmentos, búsqueda).
3. Recoger evidencia mínima reproducible (logs + estado).
4. Aplicar el fix mínimo.
5. Revalidar el runtime y los logs.

## Playbooks por síntoma

### Bundle no está en ACTIVE

```bash
task osgi:status -- <com.example.bundle.name>
task osgi:diag -- <com.example.bundle.name>
task osgi:gogo -- "refresh"
```

Corregir dependencias, `bnd.bnd`, versiones y errores en `@Activate`.

### El Portal no arranca

```bash
task env:logs
task env:shell   # o para PostgreSQL directamente:
cd docker && docker compose exec postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>
```

Verificar también los recursos de Docker (RAM/CPU).

### Errores FTL/FreeMarker

Revisar `FreeMarkerEngineConfiguration.config` y los logs de la plantilla. Si el problema es DDM, usar la referencia canónica de migración (abajo).

### Búsqueda / Indexación

```bash
task reindex:status
task reindex:watch
```

Golden path tras importar una BD limpia: `references/reindex-after-import.md`.

Diagnóstico profundo: `references/reindex-journal.md`.

### Los Fragmentos no se actualizan

```bash
task liferay -- resource fragments --site /<site>
task liferay -- inventory page --url <pageUrl>
cd docker && docker compose logs liferay --since 2m 2>&1 | grep -n "fragment\|import\|AutoDeployScanner"
```

Validar persistencia por UI/JSONWS si la interfaz es ambigua. No asumir que el `dev-cli` actual puede resincronizar fragmentos.

### Regresión CSS / Tema

Para diagnosticar y corregir regresiones visuales, usar el flujo de trabajo de la skill `/automating-browser-tests` junto con los comandos de despliegue:

1. Identificar el selector afectado y el estilo computado actual/esperado con playwright-cli.
2. Localizar la regla SCSS en el tema (`grep -r`).
3. Aplicar el fix mínimo en SCSS y realizar hot-deploy (`task deploy:theme`).
4. Re-verificar con playwright-cli que el estilo es el esperado.

**Bugs CSS conocidos (Clay 4.x / DXP 2025.Q1+)**:
- `.btn-unstyled`: añade `font-weight: semi-bold`, `text-decoration: underline`, `display: inline-flex`.
- Fix mínimo: `background-color: transparent; text-decoration: none;` en estado normal y `:hover`.

**SVG / icons**:
- Comprobar el artefacto publicado: `curl http://localhost:8080/o/<theme-name>/images/clay/icons.svg | grep '<symbol id="ICON_NAME"'`

## Nota operativa: Groovy console y CAPTCHA

Evitar depender de la Groovy Console para correcciones rutinarias: puede estar restringida o introducir fricción (captcha/permisos). Priorizar el uso de CLIs reproducibles (`task`, Gradle) y SQL controlado/versionado.

## Referencias canónicas (cargar solo si aplica)

- Cambios disruptivos Liferay 7.4 (Diagnóstico de problemas desconocidos): `references/breaking-changes-74.md`
- Migraciones DDM, formatos y patrón SQL/FTL: `references/ddm-migration.md`
- Reindex tras importar de cero: `references/reindex-after-import.md`
- Reindexación de Journal en detalle: `references/reindex-journal.md`
