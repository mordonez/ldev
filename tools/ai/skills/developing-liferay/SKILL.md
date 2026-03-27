---
name: developing-liferay
description: "Especialista en desarrollo Liferay DXP. Usar cuando hay que modificar código, FTL, SCSS, estructuras DDM, templates, fragments o trabajar en el Page Editor. El punto de entrada recomendado para tareas técnicas Liferay es /liferay-expert."
---

# Desarrollo en Liferay DXP (Especialista Universal)

> Para tareas técnicas Liferay, el entrypoint recomendado es `/liferay-expert`. Esta skill es la especialista de dominio para cambios de código, FTL, SCSS, DDM, fragments y Page Editor.

Esta skill te convierte en un arquitecto senior de Liferay DXP. Unifica todos los dominios de desarrollo de Liferay para asegurar una implementación cohesiva, consciente del sitio y eficiente.

## 🔄 El Ciclo de Vida de Liferay (Obligatorio)

1.  **Investigación**: Identifica el sitio afectado y el tipo de recurso. Utiliza la cadena de descubrimiento del portal antes de tocar el código:
   - `task liferay -- inventory sites`
   - `task liferay -- inventory pages --site /<site>`
   - `task liferay -- inventory page --url /web/<site>/<friendly-url>`
   - Si la tarea es intensiva en contenido, continúa con `task liferay -- inventory structures --site /<site>` y `task liferay -- inventory templates --site /<site>`
2.  **Estrategia**: Decide si el cambio pertenece al **Tema**, **Arquitectura de Contenido**, **Fragmentos** o **Backend**.
3.  **Ejecución**: Aplica cambios quirúrgicos usando `task deploy:...`, `task playwright` sobre `adminUrls` o el workflow manual mínimo del proyecto. `dev-cli liferay` actual es principalmente observacional.
4.  **Validación**: Verifica usando las reglas de validación específicas del dominio (ver abajo).

## Portal Discovery Golden Path (Camino de Descubrimiento)

Usa este flujo siempre que el usuario proporcione una URL incompleta, solo un sitio o simplemente el nombre de una página:

1. `task liferay -- inventory sites`
2. `task liferay -- inventory pages --site /<site>`
3. Copia la `fullUrl` e inspecciona con `task liferay -- inventory page --url <fullUrl>`

Notas:
- `inventory pages` es el índice navegable.
- `inventory page` es el comando de inspección detallada.
- Prefiere `fullUrl` sobre `friendlyUrl` cruda al encadenar comandos.
- Si un comando `task liferay -- inventory ...` falla con `java.net.ConnectException`, asume primero que el portal local no está levantado en el worktree actual. Revisa `task env:info` y ejecuta `task env:start` antes de investigar otras causas.
- Para cambios de composición/layout de página, `inventory page` es también el punto de entrega para la mutación: usa sus `adminUrls` con `task playwright` en lugar de inventar llamadas de escritura contra Headless Delivery.
- Para problemas de construcción de sitio, prefiere esta secuencia: `inventory page` -> `page-layout export` -> `adminUrls.Edit URL` -> mutación `task playwright` -> captura de pantalla -> verificación `page-layout diff`.
- Si `inventory page` devuelve `displayStyle: ddmTemplate_<ID>`, resuelve ese ADT primero con `task liferay -- resource resolve-adt --display-style ddmTemplate_<ID> --site /<site>`.
- Trata `pageDefinition` como descubrimiento de solo lectura a menos que `dev-cli` exponga un comando dedicado de escritura para páginas del sitio.
- Para trabajo en el Page Editor, usa sesiones separadas por intención:
  - una sesión de runtime, ej. `-s=runtime-<issue>`
  - una sesión de editor, ej. `-s=page-editor-<issue>`
- No lances dos helpers de `task playwright` concurrentemente contra la misma sesión. El wrapper ahora bloquea sesiones a propósito y devuelve `failureKind: session` with `reason: session-busy`.
- Inicializa la sesión del editor con `task playwright -- -s=page-editor-<issue> ensure-editor-session --url <pageUrl>`. Este comando es idempotente.
- Prefiere los helpers atómicos del editor sobre el `run-code` de bajo nivel siempre que se ajusten a la tarea.

---

## 🏗️ Flujos de Trabajo Especializados por Dominio

### 1. Frontend & Tema
**Cuándo**: Cambios visuales globales, SCSS o `portal_normal.ftl`.
- **Origen**: `liferay/themes/<tu-tema>/src/`
- **Acción**: `task deploy:theme`
- **Validación**: Recarga forzada del navegador. Mide espaciados/GAPs con `playwright-cli` si se solicita.
- **Referencia**: `references/theme.md`

### 2. Arquitectura de Contenido (Journal & ADT)
**Cuándo**: Creación o modificación de Estructuras, Plantillas o Plantillas de Visualización de Aplicación (ADT).
- **Origen**: `liferay/resources/journal/structures/<site>/`, `templates/<site>/`, `templates/application_display/<site>/`
- **Acción**: usa `task liferay -- inventory structures --site /<site>`, `task liferay -- inventory templates --site /<site>`, `task liferay -- resource structure --key <KEY>`, `task liferay -- resource template --id <ID>` y `task liferay -- resource resolve-adt --display-style ddmTemplate_<ID>` para discovery y resolución. Las mutaciones de resources no forman parte del `dev-cli` estable actual.
- **Seguridad**: no inventes writes por Headless o JSONWS solo porque el recurso es legible. Si hace falta mutar, usa UI/admin o el workflow explícito del proyecto.
- **Validación**: Revisa el JSON para la consistencia de key/ERC. Verifica el renderizado en el sitio local.
- **Referencia**: `references/structures.md`

### 3. Fragmentos de Página
**Cuándo**: Construcción o mantenimiento de juegos de fragmentos.
- **Origen**: `liferay/fragments/sites/<site>/src/`
- **Acción**: usa `task liferay -- resource fragments --site /<site>` para inventario y `task playwright`/Page Editor para verificación. La importación/sync de fragmentos no es parte de la superficie estable actual del `dev-cli`.
- **Validación**: verifica en el Page Editor, runtime y logs del portal.
- **Referencia**: `references/fragments.md`

### 4. Backend & OSGi
**Cuándo**: Sobrescritura de JSPs del núcleo, servicios OSGi o creación de nuevos módulos.
- **Origen**: `liferay/modules/`
- **Acción**: `task deploy:module -- <name>`
- **Validación**: Usa `task osgi:diag -- <bundle>` y `task osgi:gogo` para revisar el estado del bundle (`Active`).
- **Referencia**: `references/osgi.md`

---

## 🛡️ Principios Rectores

- **Conciencia del Sitio**: Siempre verifica si un recurso pertenece al sitio `global` (padre) o a un sitio hijo específico.
- **Herramientas Primero**: Prefiere los comandos `task` sobre llamadas manuales a Gradle/Docker.
- **Sin Cadenas Mágicas**: Usa constantes y patrones existentes.
- **Seguridad**: Para cambios destructivos en estructuras, haz una pausa y sugiere usar `migrating-journal-structures`.

## ✅ Lista de Verificación de Validación

- [ ] La salida del comando es verde (sin errores de compilación o ejecución del flujo aplicado).
- [ ] Los logs (`task env:logs`) están libres de nuevos `ERROR` o `Stacktrace`.
- [ ] Los bundles OSGi están en estado `Active`.
- [ ] El navegador muestra el cambio (¡limpia la caché!).
- [ ] La respuesta de la API/Headless (si aplica) coincide con las expectativas.

## 📚 Referencias (Conocimiento Contextual)
- Cambios disruptivos Liferay 7.4: `references/breaking-changes-74.md`
- Guía detallada de Tema/SCSS: `references/theme.md`
- Profundización en DDM/Journal: `references/structures.md`
- Patrones de fragmentos: `references/fragments.md`
- OSGi y sobrescrituras del núcleo: `references/osgi.md`
