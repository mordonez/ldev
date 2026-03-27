# Developing Content Structures (Journal & ADT)

Esta skill te convierte en un experto en la arquitectura de información de Liferay: Estructuras, Plantillas (Templates) y Application Display Templates (ADTs).

## 📍 Mapa del Territorio

- **Estructuras Web Content**: `liferay/resources/journal/structures/<site>/`
  - La base es el site `global/`, el resto son sites específicos.
  - Formato: JSON (Schema de Liferay 7.4+).
  - Naming: `STR_<NOMBRE>.json` (adaptar al convenio del proyecto).
- **Plantillas Web Content**: `liferay/resources/journal/templates/<site>/`
  - Formato: Freemarker (`.ftl`).
  - Naming: `TPL_<NOMBRE>_<VISTA>.ftl` (adaptar al convenio del proyecto).
- **ADTs (Application Display Templates)**: `liferay/resources/templates/application_display/<site>/<portlet_type>/`
  - Formato: Freemarker (`.ftl`).
  - Naming: `ADT_<PORTLET>_<VISTA>.ftl` (adaptar al convenio del proyecto).

## 🛠️ Flujo de Trabajo

### 1. Desarrollo de Estructuras (JSON)
No edites el JSON a mano desde cero.
1.  **Prototipar**: Crea la estructura en el UI de Liferay (Entorno Local).
2.  **Exportar**:
    ```bash
    task liferay -- inventory structures --site /<site> --format json
    task liferay -- resource structure --key <STRUCTURE_KEY> --site /<site>
    # Usa la salida para localizar la estructura y copiar el JSON relevante al fichero en liferay/resources/...
    ```
3.  **Refinar**: Limpia IDs autogenerados si es necesario, asegúrate de que los `fieldReference` sean legibles (`titulo`, `imagen`, no `TextField4859`).

### 2. Desarrollo de Templates (FTL)
1.  **Editar**: Trabaja en el fichero local `.ftl`.
2.  **Inspeccionar runtime**:
    ```bash
    task liferay -- inventory templates --site /<site>
    task liferay -- resource template --id <TEMPLATE_ID> --site /<site>
    ```
3.  **Aplicar cambio**: usa el workflow explícito del proyecto o UI. `dev-cli` actual no sincroniza templates.
4.  **Verificar**: Refresca la página en local.

### 3. Desarrollo de ADTs
1.  **Editar**: Trabaja en `liferay/resources/templates/application_display/...`.
2.  **Resolver**:
    ```bash
    task liferay -- resource resolve-adt --display-style ddmTemplate_<ID> --site /<site>
    ```
3.  **Aplicar cambio**: usa el workflow explícito del proyecto o UI. `dev-cli` actual no sincroniza ADTs.
4.  **Verificar**: Refresca la página y comprueba el widget/portlet afectado.

## 🛡️ Reglas de Seguridad

- **Nunca edites** la clave (`key`) de una estructura existente directamente: provoca huerfanos de contenido.
- **Nunca borres** campos de una estructura con contenido publicado sin un plan de migración (`/migrating-journal-structures`).
- No asumir syncs masivos o individuales desde `dev-cli`; si existen en el proyecto, deben estar documentados aparte.

## 🔍 Diagnóstico

Si un template no se actualiza:
1. Verifica que el sync fue exitoso (sin errores en la salida).
2. Limpia la caché del portal: `task osgi:gogo -- "refresh"`.
3. Revisa los logs para errores FTL: `task env:logs SINCE=2m`.
