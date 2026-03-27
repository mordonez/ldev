---
name: deploying-liferay
description: "Especialista en despliegue y verificación de componentes Liferay DXP. Usar cuando el cambio ya está hecho y el foco es compilar, hacer hot-deploy o confirmar que un bundle está Active. El punto de entrada recomendado para tareas técnicas Liferay es /liferay-expert."
---

# Despliegue de Módulos Liferay (Operaciones de Despliegue)

> Para tareas técnicas Liferay, el entrypoint recomendado es `/liferay-expert`. Esta skill es la especialista de dominio para compilar, desplegar y verificar el estado del runtime.

Esta skill se centra en la "Ejecución" y "Validación" de las tareas de despliegue de Liferay. Asegura que el portal refleje correctamente los cambios del código fuente.

## 🔄 El Ciclo de Vida del Despliegue (Obligatorio)

### 1. Investigación y Análisis
- **Identificar el Objetivo**: Localiza el módulo, tema o juego de fragmentos específico.
- **Consultar Requisitos**: Revisa `build.gradle` o `package.json` para las dependencias.

### 2. Estrategia y Planificación
- **Determinar la Ruta de Despliegue**: Elige el despliegue más pequeño posible (`deploy:module`, `deploy:theme` o validación puramente observacional con `task liferay -- ...`).

### 3. Ejecución (Compilación y Despliegue)
- **Compilar Componente**: Usa los comandos `task deploy:...`.
- **Monitorizar la Compilación**: Revisa la salida estándar para "BUILD SUCCESSFUL" o "Import Successful".

### 4. Validación y Verificación
- **Verificación OSGi**: Usa `task osgi:diag -- <bundle>` para asegurar que esté en estado `Active`.
- **Vigilancia de Logs**: Ejecuta `task env:logs SINCE=2m` para capturar excepciones de despliegue.

---

## Build y despliegue local

```bash
task deploy:prepare
task env:start
task deploy:module -- <module-name>
task deploy:theme
task liferay -- resource fragments --site /<site>
task osgi:status -- <com.example.bundle.name>
task osgi:diag -- <com.example.bundle.name>
task env:logs SINCE=2m
```

Para ver todas las opciones y subcomandos disponibles:
```bash
task help
task liferay -- --help
task liferay -- resource --help
```

## Flujo mínimo de despliegue

1. Identificar tipo de cambio (`module`, `theme`, `fragments`, `config`).
2. Ejecutar el despliegue más pequeño posible (`deploy:module`, `deploy:theme` o solo discovery/read-only si no hay deploy automatizado soportado).
3. Verificar el estado OSGi (`osgi:status` y `osgi:diag` si no está `ACTIVE`).
4. Verificar el runtime en el portal y revisar logs recientes (`task env:logs SINCE=2m`).

## Despliegues por tipo

### Compilación completa del proyecto

```bash
task deploy:prepare
task env:start
```

Usar para el primer arranque o cuando hay cambios amplios.

### Módulo OSGi (hot-deploy)

```bash
task deploy:module -- <module-name>
```

`deploy:module` detecta:
- Módulos simples: compila y despliega.
- Service Builder (módulos con `service.xml`): ejecuta `buildService`, despliega API+Service y restaura `service.properties` sin dejar cambios persistentes en el worktree.
- Tema vía módulo: `MODULE=<tema>`.

### Tema (cambios CSS/FTL/JS)

```bash
task deploy:theme
```

### Fragmentos del sitio

`dev-cli` no sincroniza fragmentos en esta fase. Úsalo para discovery:

```bash
task liferay -- resource fragments --site /<site>
task liferay -- inventory page --url <pageUrl>
task env:logs SINCE=2m
```

La mutación/importación debe hacerse por el workflow explícito del proyecto o por UI, no inventando comandos `sync-*`.

## Verificación post-despliegue (obligatoria)

```bash
task osgi:status -- <com.example.bundle.name>
task osgi:diag -- <com.example.bundle.name>
task env:logs SINCE=2m
```

Validar también el comportamiento en runtime (`http://localhost:8080` o host/puerto del worktree).

## Diagnóstico OSGi con Gogo

No interactivo (preferido para agentes):
```bash
task osgi:gogo -- "lb | grep -i <module-name>"
task osgi:gogo -- "diag <bundle-id>"
task osgi:gogo -- "refresh"
```

Interactivo:
```bash
task osgi:gogo
```

## Recursos Liferay soportados por la CLI

La superficie estable actual de `task liferay -- resource` es read-only:

```bash
task liferay -- inventory structures --site /<site>
task liferay -- inventory templates --site /<site>
task liferay -- resource structure --key <STRUCTURE_KEY> --site /<site>
task liferay -- resource template --id <TEMPLATE_ID> --site /<site>
task liferay -- resource resolve-adt --display-style ddmTemplate_<ID> --site /<site>
task liferay -- resource fragments --site /<site>
```

No asumir que existen `sync-*`, `delete-*`, `export-and-sync` o pipelines de migración en el `dev-cli` estable.

## Worktrees y errores frecuentes

Si el despliegue falla solo en el worktree, cargar:
- [references/worktree-pitfalls.md](references/worktree-pitfalls.md)

Casos cubiertos en la referencia:
- `Exporting an empty package` por el `.gitignore`.
- `-Xmx4g: command not found` por `LIFERAY_JVM_OPTS` sin comillas.
- Recursos CSS/JS apuntando al puerto equivocado por `web.server.http.port`.

## Reglas de seguridad

- No usar despliegues más amplios de lo necesario.
- No asumir `ACTIVE` sin verificar con `task osgi:status`.
- No asumir mutaciones automáticas de resources desde la CLI actual; si el proyecto requiere un flujo mutante, debe estar explicitado fuera de `dev-cli`.
- Revisar siempre los logs de errores tras cada despliegue.
