#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:?Usage: bootstrap-project-context.sh <target-dir>}"

find_first_file() {
  local path
  for path in "$@"; do
    [[ -f "$path" ]] && {
      printf '%s\n' "$path"
      return 0
    }
  done
  return 1
}

find_first_dir() {
  local path
  for path in "$@"; do
    [[ -d "$path" ]] && {
      printf '%s\n' "$path"
      return 0
    }
  done
  return 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

read_property_value() {
  local pattern="$1"
  shift
  local file
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    local line
    line="$(grep -E "^${pattern}" "$file" 2>/dev/null | head -1 || true)"
    if [[ -n "$line" ]]; then
      printf '%s\n' "$(trim "${line#*=}")"
      return 0
    fi
  done
  return 1
}

read_first_match() {
  local regex="$1"
  shift
  local file
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    local value
    value="$(grep -Eo "$regex" "$file" 2>/dev/null | head -1 || true)"
    if [[ -n "$value" ]]; then
      printf '%s\n' "$value"
      return 0
    fi
  done
  return 1
}

read_compose_default() {
  local variable_name="$1"
  if [[ -n "${DOCKER_COMPOSE_FILE:-}" && -f "${DOCKER_COMPOSE_FILE:-}" ]]; then
    sed -nE "s/.*\\$\\{${variable_name}:-([^}]*)\\}.*/\\1/p" "$DOCKER_COMPOSE_FILE" | head -1 || true
  fi
}

join_by() {
  local delimiter="$1"
  shift
  local first=1
  local value
  for value in "$@"; do
    [[ -z "$value" ]] && continue
    if [[ $first -eq 1 ]]; then
      printf '%s' "$value"
      first=0
    else
      printf '%s%s' "$delimiter" "$value"
    fi
  done
}

PROJECT_NAME="$(basename "$TARGET_DIR")"
WORKSPACE_DIR="$(find_first_dir "$TARGET_DIR/liferay" "$TARGET_DIR")"
DOCKER_DIR="$(find_first_dir "$TARGET_DIR/docker" || true)"
MODULES_DIR="$(find_first_dir "$TARGET_DIR/liferay/modules" "$TARGET_DIR/modules" || true)"
THEMES_DIR="$(find_first_dir "$TARGET_DIR/liferay/themes" "$TARGET_DIR/themes" || true)"
FRAGMENTS_DIR="$(find_first_dir "$TARGET_DIR/liferay/fragments" "$TARGET_DIR/liferay/ub-fragments" "$TARGET_DIR/fragments" "$TARGET_DIR/ub-fragments" || true)"
CI_DIR="$(find_first_dir "$TARGET_DIR/ci" || true)"
GITHUB_WORKFLOWS_DIR="$(find_first_dir "$TARGET_DIR/.github/workflows" || true)"

GRADLE_PROPERTIES_FILE="$(find_first_file "$TARGET_DIR/liferay/gradle.properties" "$TARGET_DIR/gradle.properties" || true)"
BUILD_GRADLE_FILE="$(find_first_file "$TARGET_DIR/liferay/build.gradle" "$TARGET_DIR/build.gradle" "$TARGET_DIR/modules/build.gradle" || true)"
GRADLE_WRAPPER_FILE="$(find_first_file "$TARGET_DIR/gradle/wrapper/gradle-wrapper.properties" "$TARGET_DIR/liferay/gradle/wrapper/gradle-wrapper.properties" || true)"
DOCKER_COMPOSE_FILE="$(find_first_file "$TARGET_DIR/docker/docker-compose.yml" "$TARGET_DIR/docker-compose.yml" || true)"
PORTAL_SETUP_WIZARD_FILE="$(find_first_file "$TARGET_DIR/liferay/configs/dockerenv/portal-setup-wizard.properties" "$TARGET_DIR/configs/dockerenv/portal-setup-wizard.properties" || true)"
LCP_FILE="$(find_first_file "$TARGET_DIR/liferay/LCP.json" "$TARGET_DIR/LCP.json" || true)"
CLAUDE_OUT="$TARGET_DIR/CLAUDE.md"
MANIFEST_OUT="$TARGET_DIR/agents/context/manifests/core.lst"

LIFERAY_PRODUCT="$(read_property_value 'liferay\.workspace\.product=' "$GRADLE_PROPERTIES_FILE" || true)"
LIFERAY_IMAGE="$(read_property_value 'liferay\.workspace\.docker\.image\.liferay=' "$GRADLE_PROPERTIES_FILE" || true)"
if [[ -z "$LIFERAY_IMAGE" ]]; then
  LIFERAY_IMAGE="$(read_first_match 'liferay/dxp:[A-Za-z0-9._-]+' "$DOCKER_COMPOSE_FILE" || true)"
fi

if [[ -n "$LIFERAY_IMAGE" ]]; then
  LIFERAY_DXP_DETAIL="imagen \`${LIFERAY_IMAGE}\`"
elif [[ -n "$LIFERAY_PRODUCT" ]]; then
  LIFERAY_DXP_DETAIL="workspace \`${LIFERAY_PRODUCT}\`"
else
  LIFERAY_DXP_DETAIL="[TODO: completar versión exacta]"
fi

JAVA_VERSION="$(read_first_match 'sourceCompatibility *= *\"?[0-9]+\"?' "$BUILD_GRADLE_FILE" | grep -Eo '[0-9]+' | head -1 || true)"
TARGET_JAVA_VERSION="$(read_first_match 'targetCompatibility *= *\"?[0-9]+\"?' "$BUILD_GRADLE_FILE" | grep -Eo '[0-9]+' | head -1 || true)"
if [[ -z "$JAVA_VERSION" && -n "$TARGET_JAVA_VERSION" ]]; then
  JAVA_VERSION="$TARGET_JAVA_VERSION"
fi
[[ -z "$JAVA_VERSION" ]] && JAVA_VERSION="21"

GRADLE_VERSION="$(read_first_match 'gradle-[0-9]+(\.[0-9]+)+' "$GRADLE_WRAPPER_FILE" | sed 's/^gradle-//' || true)"
[[ -z "$GRADLE_VERSION" ]] && GRADLE_VERSION="8.x"

POSTGRES_IMAGE="$(sed -nE 's/^[[:space:]]*image:[[:space:]]*(postgres:[A-Za-z0-9._-]+).*/\1/p' "$DOCKER_COMPOSE_FILE" | head -1 || true)"
[[ -z "$POSTGRES_IMAGE" ]] && POSTGRES_IMAGE="postgres:15-alpine"

NODE_HINT="$(find "$TARGET_DIR" -path '*/package.json' -type f 2>/dev/null | head -1 || true)"
if [[ -n "$NODE_HINT" ]]; then
  NODE_DETAIL="Node.js requerido (detectar versión exacta en \`$(realpath --relative-to="$TARGET_DIR" "$NODE_HINT")\`)"
else
  NODE_DETAIL="No detectado automáticamente"
fi

LIFERAY_CLOUD_DETAIL="No detectado"
if [[ -n "$LCP_FILE" ]]; then
  LIFERAY_CLOUD_DETAIL="Configuración Liferay Cloud detectada en \`$(realpath --relative-to="$TARGET_DIR" "$LCP_FILE")\`"
fi

CI_DETAILS=()
if find "$TARGET_DIR" -maxdepth 3 \( -name 'Jenkinsfile' -o -name 'Jenkinsfile-*' -o -name 'Jenkinsfile_*' \) -type f | grep -q . 2>/dev/null; then
  CI_DETAILS+=("Jenkins")
fi
if [[ -d "$GITHUB_WORKFLOWS_DIR" ]] && find "$GITHUB_WORKFLOWS_DIR" -name '*.yml' -o -name '*.yaml' | grep -q . 2>/dev/null; then
  CI_DETAILS+=("GitHub Actions")
fi
if [[ ${#CI_DETAILS[@]} -eq 0 ]]; then
  CI_DETAIL="No detectado automáticamente"
else
  CI_DETAIL="$(join_by ' + ' "${CI_DETAILS[@]}")"
fi

THEME_NAMES=()
if [[ -n "${THEMES_DIR:-}" ]]; then
  while IFS= read -r theme_dir; do
    THEME_NAMES+=("$(basename "$theme_dir")")
  done < <(find "$THEMES_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
fi

if [[ ${#THEME_NAMES[@]} -gt 0 ]]; then
  THEME_DETAIL="$(join_by ', ' "${THEME_NAMES[@]}")"
else
  THEME_DETAIL="No detectado automáticamente"
fi

if [[ -n "${FRAGMENTS_DIR:-}" ]]; then
  FRAGMENTS_RELATIVE="$(realpath --relative-to="$TARGET_DIR" "$FRAGMENTS_DIR")"
else
  FRAGMENTS_RELATIVE="[TODO: completar ruta de fragment sets]"
fi

ADMIN_EMAIL="$(read_property_value 'admin\.email\.from\.address=' "$PORTAL_SETUP_WIZARD_FILE" || true)"
if [[ -n "$ADMIN_EMAIL" ]]; then
  ADMIN_DETAIL="\`${ADMIN_EMAIL}\` / [TODO: confirmar password local]"
else
  ADMIN_DETAIL="[TODO: completar credenciales locales]"
fi

BIND_IP_DEFAULT="$(read_compose_default 'BIND_IP')"
HTTP_PORT_DEFAULT="$(read_compose_default 'LIFERAY_HTTP_PORT')"
DEBUG_PORT_DEFAULT="$(read_compose_default 'LIFERAY_DEBUG_PORT')"
GOGO_PORT_DEFAULT="$(read_compose_default 'GOGO_PORT')"
POSTGRES_PORT_DEFAULT="$(read_compose_default 'POSTGRES_PORT')"

[[ -z "$BIND_IP_DEFAULT" ]] && BIND_IP_DEFAULT="127.0.0.1"
[[ -z "$HTTP_PORT_DEFAULT" ]] && HTTP_PORT_DEFAULT="8080"
[[ -z "$DEBUG_PORT_DEFAULT" ]] && DEBUG_PORT_DEFAULT="8000"
[[ -z "$GOGO_PORT_DEFAULT" ]] && GOGO_PORT_DEFAULT="11311"
[[ -z "$POSTGRES_PORT_DEFAULT" ]] && POSTGRES_PORT_DEFAULT="5432"

LANGUAGE_HINTS=()
while IFS= read -r lang_file; do
  lang_name="$(basename "$lang_file")"
  lang_name="${lang_name#Language_}"
  lang_name="${lang_name%.properties}"
  [[ -n "$lang_name" ]] && LANGUAGE_HINTS+=("$lang_name")
done < <(find "$TARGET_DIR" -name 'Language_*.properties' -type f 2>/dev/null | sort | head -20)

if [[ ${#LANGUAGE_HINTS[@]} -gt 0 ]]; then
  LANGUAGE_DETAIL="$(printf '%s\n' "${LANGUAGE_HINTS[@]}" | sort -u | paste -sd ', ' -)"
else
  LANGUAGE_DETAIL="[TODO: completar idiomas activos]"
fi

PACKAGE_PREFIX="[TODO: completar prefijo de paquetes]"
if [[ -n "${MODULES_DIR:-}" ]]; then
  FIRST_JAVA_FILE="$(find "$MODULES_DIR" -name '*.java' -type f 2>/dev/null | head -1 || true)"
  if [[ -n "$FIRST_JAVA_FILE" ]]; then
    DETECTED_PACKAGE="$(grep -E '^package ' "$FIRST_JAVA_FILE" | head -1 | sed -E 's/^package ([^;]+);/\1/' || true)"
    if [[ -n "$DETECTED_PACKAGE" ]]; then
      PACKAGE_PREFIX="${DETECTED_PACKAGE%.*}.*"
    fi
  fi
fi

MODULE_ROWS=()
MODULE_COUNT=0
if [[ -n "${MODULES_DIR:-}" ]]; then
  while IFS= read -r module_dir; do
    module_name="$(basename "$module_dir")"
    [[ "$module_name" == "build" ]] && continue
    [[ "$module_name" == ".gradle" ]] && continue
    bundle_name=""
    bnd_file="$(find "$module_dir" -maxdepth 3 -name bnd.bnd -type f 2>/dev/null | head -1 || true)"
    if [[ -n "$bnd_file" ]]; then
      bundle_name="$(grep -E '^Bundle-SymbolicName:' "$bnd_file" | head -1 | sed 's/^Bundle-SymbolicName:[[:space:]]*//' || true)"
    fi
    [[ -z "$bundle_name" ]] && bundle_name="—"
    module_rel="$(realpath --relative-to="$TARGET_DIR" "$module_dir")"
    MODULE_ROWS+=("| \`${module_rel}\` | \`${bundle_name}\` | [TODO: completar descripción] |")
    MODULE_COUNT=$((MODULE_COUNT + 1))
  done < <(find "$MODULES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -12)
fi

if [[ ${#MODULE_ROWS[@]} -eq 0 ]]; then
  MODULE_TABLE='| [TODO] | [TODO] | [TODO] |'
else
  MODULE_TABLE="$(printf '%s\n' "${MODULE_ROWS[@]}")"
fi

LCP_REFERENCE="[TODO: completar ruta de configuración cloud si existe]"
if [[ -n "$LCP_FILE" ]]; then
  LCP_REFERENCE="$(realpath --relative-to="$TARGET_DIR" "$LCP_FILE")"
fi

CI_REFERENCE="[TODO: completar rutas de CI/CD si existen]"
if [[ -n "${CI_DIR:-}" ]] || [[ -n "${GITHUB_WORKFLOWS_DIR:-}" ]]; then
  CI_REFERENCE="$(join_by ', ' \
    "$( [[ -n "${CI_DIR:-}" ]] && realpath --relative-to="$TARGET_DIR" "$CI_DIR" )" \
    "$( [[ -n "${GITHUB_WORKFLOWS_DIR:-}" ]] && realpath --relative-to="$TARGET_DIR" "$GITHUB_WORKFLOWS_DIR" )")"
fi

mkdir -p "$(dirname "$CLAUDE_OUT")"
cat > "$CLAUDE_OUT" <<EOF
# CLAUDE.md — Contexto del Proyecto

> Este documento es el punto de entrada único de know-how para agentes que trabajan en este proyecto.
> Léelo completamente antes de tocar cualquier fichero.

> Nota de interoperabilidad: aunque se llama \`CLAUDE.md\`, este documento aplica
> a **cualquier agente** (Codex, Claude Code y otros). El punto de entrada
> neutral está en \`AGENTS.md\`.

---

## Stack Técnico

| Componente | Versión / Detalle |
|---|---|
| **Proyecto** | \`${PROJECT_NAME}\` |
| **Liferay DXP** | ${LIFERAY_DXP_DETAIL} |
| **Java** | ${JAVA_VERSION} (sourceCompatibility = ${JAVA_VERSION}, targetCompatibility = ${TARGET_JAVA_VERSION:-$JAVA_VERSION}) |
| **Gradle** | ${GRADLE_VERSION} |
| **PostgreSQL** | ${POSTGRES_IMAGE} |
| **Tema** | ${THEME_DETAIL} |
| **Fragment sets** | \`${FRAGMENTS_RELATIVE}\` |
| **Node.js** | ${NODE_DETAIL} |
| **Liferay Cloud** | ${LIFERAY_CLOUD_DETAIL} |
| **CI/CD** | ${CI_DETAIL} |
| **Idiomas** | ${LANGUAGE_DETAIL} |

---

## Estructura del Proyecto

\`\`\`
${PROJECT_NAME}/
├── AGENTS.md                      ← Políticas y entrypoint neutral para agentes
├── CLAUDE.md                      ← Este fichero
├── agents/                        ← Arquitectura, validación y contexto compartido para agentes
├── docker/                        ← Entorno local Docker
├── liferay/                       ← Workspace Liferay (si aplica)
├── modules/                       ← Módulos Gradle/OSGi fuera del workspace (si aplica)
├── .agents/skills/                ← Skills reutilizables instaladas
└── .claude/                       ← Compatibilidad con Claude (agentes + mirror de skills)
\`\`\`

Rutas detectadas relevantes:
- Workspace principal: \`$(realpath --relative-to="$TARGET_DIR" "$WORKSPACE_DIR")\`
- Docker: \`$( [[ -n "${DOCKER_DIR:-}" ]] && realpath --relative-to="$TARGET_DIR" "$DOCKER_DIR" || printf '[TODO: completar]')\`
- Módulos: \`$( [[ -n "${MODULES_DIR:-}" ]] && realpath --relative-to="$TARGET_DIR" "$MODULES_DIR" || printf '[TODO: completar]')\`
- Temas: \`$( [[ -n "${THEMES_DIR:-}" ]] && realpath --relative-to="$TARGET_DIR" "$THEMES_DIR" || printf '[TODO: completar]')\`

---

## Skills para Desarrollo

| Necesidad | Skill a Activar |
|---|---|
| **Resolución de Incidencias** | \`/issue-engineering\` |
| **Liferay Architect (CSS, DDM, Java)** | \`/liferay-expert\` |
| **Desarrollo sobre artefactos Liferay** | \`/developing-liferay\` |
| **Operaciones / Deployment** | \`/deploying-liferay\` |
| **Testing Visual / Page Editor** | \`/automating-browser-tests\` |
| **Diagnóstico de runtime** | \`/troubleshooting-liferay\` |

---

## Golden Paths Operativos

### Descubrimiento del portal

\`\`\`bash
task liferay -- inventory sites
task liferay -- inventory pages --site /<site>
task liferay -- inventory page --url <fullUrl>
\`\`\`

Reglas:
- Usar siempre \`fullUrl\` como input del siguiente comando.
- Si el portal devuelve \`ConnectException\`, verificar primero \`task env:info\` y arrancar con \`task env:start\`.
- Si la página devuelve \`displayStyle: ddmTemplate_<ID>\`, resolverlo con \`task liferay -- resource resolve-adt --display-style ddmTemplate_<ID> --site /<site>\`.

### Flujo de worktree

\`\`\`bash
task worktree:new -- issue-123
cd .worktrees/issue-123
task env:start
task env:info
\`\`\`

Reglas:
- No editar nunca desde el checkout principal si vas a modificar ficheros versionados.
- Todo comando que hable con Liferay debe ejecutarse desde el worktree activo.

### Recuperación de datos del worktree

\`\`\`bash
task env:stop
task env:init -- --clone-volumes
task env:start
\`\`\`

---

## Cómo Arrancar el Entorno Local

### Prerequisitos
- Docker Desktop / Docker Engine + Docker Compose
- Java ${JAVA_VERSION}
- Node.js si hay build de tema o frontend

### Arranque normal
\`\`\`bash
task env:start
\`\`\`

Liferay disponible en: **http://${BIND_IP_DEFAULT}:${HTTP_PORT_DEFAULT}**

### Parar / BD / PostgreSQL
\`\`\`bash
task env:stop
cd docker && docker compose exec postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>
\`\`\`

### Credenciales locales
- URL: http://${BIND_IP_DEFAULT}:${HTTP_PORT_DEFAULT}
- Admin: ${ADMIN_DETAIL}

---

## Módulos OSGi Custom

Todos usan el prefijo de paquete \`${PACKAGE_PREFIX}\`.

| Módulo (carpeta) | Bundle-SymbolicName | Descripción |
|---|---|---|
${MODULE_TABLE}

$( if [[ $MODULE_COUNT -ge 12 ]]; then printf '\nSe han incluido los primeros 12 módulos detectados. Completa manualmente si necesitas más detalle.\n'; fi )
---

## Convenciones de Idioma y Comunicación

- **Prosa operativa interna**: en el idioma del equipo.
- **Comandos, paths, flags, identificadores técnicos**: en inglés, sin traducir.
- **Commits**: prefijo convencional en inglés (\`fix:\`, \`feat:\`, \`docs:\`, \`chore:\`) y descripción en el idioma del equipo.

Formato recomendado:
\`\`\`
fix(scope): descripción del cambio (#NUM)
\`\`\`

---

## Convenciones de Código

### Paquetes Java
- Prefijo detectado: \`${PACKAGE_PREFIX}\`
- Servicios OSGi: Declarative Services con \`@Component\`
- Logging: seguir la convención del proyecto y evitar logs temporales

### Discovery de recursos en Liferay
- Estructuras: \`task liferay -- inventory structures --site /<site>\` + \`task liferay -- resource structure --key <KEY> --site /<site>\`
- Templates: \`task liferay -- inventory templates --site /<site>\` + \`task liferay -- resource template --id <ID> --site /<site>\`
- Fragments: \`task liferay -- resource fragments --site /<site>\`

### Deploy mínimo
- Módulo OSGi: \`task deploy:module -- <module-name>\`
- Tema: \`task deploy:theme\`
- Verificación: \`task osgi:status -- <bundle>\` + \`task env:logs SINCE=2m\`

---

## Entornos y Variables de Entorno

### Puertos expuestos (valores por defecto detectados)
| Puerto | Servicio |
|---|---|
| \`${HTTP_PORT_DEFAULT}\` | Liferay HTTP |
| \`${DEBUG_PORT_DEFAULT}\` | JPDA Debug |
| \`${GOGO_PORT_DEFAULT}\` | Gogo Shell |
| \`${POSTGRES_PORT_DEFAULT}\` | PostgreSQL |

### Variables clave
- \`BIND_IP\`
- \`LIFERAY_HTTP_PORT\`
- \`LIFERAY_DEBUG_PORT\`
- \`GOGO_PORT\`
- \`POSTGRES_PORT\`

---

## Scripts y Tooling

\`\`\`bash
task help
task env:start
task env:stop
task env:info
task deploy:module -- <module-name>
task deploy:theme
task env:logs SINCE=5m
bash agents/validate-all.sh
\`\`\`

---

## Integraciones Externas

- [TODO: completar integraciones externas específicas del proyecto si las hay]
- Si existe Liferay Cloud, revisar \`${LCP_REFERENCE}\`
- Si existen pipelines CI/CD, revisar \`${CI_REFERENCE}\`

---

## Notas de Deuda Técnica

- [TODO: documentar deuda técnica específica del proyecto]
- [TODO: completar módulos críticos, owners e integraciones]
- [TODO: confirmar credenciales locales y política de idioma del equipo]
EOF

mkdir -p "$(dirname "$MANIFEST_OUT")"
manifest_candidates=(
  "AGENTS.md"
  "CLAUDE.md"
  "README.md"
  "agents/README.md"
  "agents/agents.md"
  "agents/architecture.md"
  "agents/context/README.md"
  "agents/context/authority-map.md"
  "Taskfile.yml"
  "Taskfile.env.yml"
  "Taskfile.worktree.yml"
  "Taskfile.deploy.yml"
  "Taskfile.osgi.yml"
  "Taskfile.ai.yml"
  "docker/README.md"
  "docker/docker-compose.yml"
  "liferay/README.md"
  "liferay/build.gradle"
  "liferay/gradle.properties"
  "liferay/LCP.json"
)

: > "$MANIFEST_OUT"
for rel_path in "${manifest_candidates[@]}"; do
  [[ -e "$TARGET_DIR/$rel_path" ]] && printf '%s\n' "$rel_path" >> "$MANIFEST_OUT"
done

exit 0
