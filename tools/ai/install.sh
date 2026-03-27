#!/usr/bin/env bash
# ai/install.sh — Instala/actualiza AI/Skills de liferay-dxp-docker-dev en un proyecto
#
# Uso:
#   bash tools/ai/install.sh --target /ruta/al/proyecto [opciones]
#   task ai:install -- --target /ruta/al/proyecto
#   task ai:update  -- --target /ruta/al/proyecto
#
# Opciones:
#   --target, -t    Directorio raíz del proyecto destino (obligatorio)
#   --force, -f     Sobreescribir AGENTS.md si ya existe
#   --skills-only   Solo actualizar skills del manifiesto (modo update seguro)
#   --help, -h      Mostrar esta ayuda
#
# Modelo de coexistencia:
#   Las skills de vendor se listan en .agents/.vendor-skills (manifiesto).
#   El modo --skills-only SOLO actualiza esas skills; las skills proyecto-específicas
#   (no listadas en el manifiesto) no se tocan jamás.
#   Si un proyecto modifica una skill del vendor, `git diff` mostrará el cambio
#   tras el update; es la señal para decidir si contribuir la mejora de vuelta al vendor.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGET_DIR=""
FORCE=false
SKILLS_ONLY=false
CLAUDE_GENERATED=false
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/bootstrap-project-context.sh"

# --- Parse arguments -------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --target|-t)
      TARGET_DIR="$2"
      shift 2
      ;;
    --force|-f)
      FORCE=true
      shift
      ;;
    --skills-only)
      SKILLS_ONLY=true
      shift
      ;;
    --help|-h)
      sed -n '2,17p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "Error: argumento desconocido: $1" >&2
      echo "Usa --help para ver las opciones disponibles." >&2
      exit 1
      ;;
  esac
done

# --- Validaciones ----------------------------------------------------------
if [[ -z "$TARGET_DIR" ]]; then
  echo "Error: --target es obligatorio." >&2
  echo "Uso: $0 --target /ruta/al/proyecto [--force] [--skills-only]" >&2
  exit 1
fi

TARGET_DIR="$(realpath "$TARGET_DIR")"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Error: el directorio destino no existe: $TARGET_DIR" >&2
  exit 1
fi

SKILLS_SRC="$SCRIPT_DIR/skills"
SKILLS_DST="$TARGET_DIR/.agents/skills"
CLAUDE_AGENTS_SRC="$SCRIPT_DIR/.claude/agents"
CLAUDE_AGENTS_DST="$TARGET_DIR/.claude/agents"
CLAUDE_SKILLS_DST="$TARGET_DIR/.claude/skills"
AGENTS_SRC="$SCRIPT_DIR/agents"
AGENTS_DST="$TARGET_DIR/agents"
MANIFEST="$TARGET_DIR/.agents/.vendor-skills"

mkdir -p "$SKILLS_DST"

copy_skill_dir() {
  local skill_name="$1"
  rm -rf "$SKILLS_DST/$skill_name"
  cp -R "$SKILLS_SRC/$skill_name" "$SKILLS_DST/"
}

refresh_claude_skills_mirror() {
  mkdir -p "$CLAUDE_SKILLS_DST"

  local skill_name
  for skill_name in "${VENDOR_SKILLS[@]}"; do
    rm -rf "$CLAUDE_SKILLS_DST/$skill_name"
    ln -s "../../.agents/skills/$skill_name" "$CLAUDE_SKILLS_DST/$skill_name"
  done
}

# --- Instalar / actualizar skills ------------------------------------------
# Construir lista de skills disponibles en el vendor
VENDOR_SKILLS=()
for skill_dir in "$SKILLS_SRC"/*/; do
  [[ -d "$skill_dir" ]] && VENDOR_SKILLS+=("$(basename "$skill_dir")")
done

if [[ "$SKILLS_ONLY" == "true" ]] && [[ -f "$MANIFEST" ]]; then
  # Modo update seguro: solo actualizar skills listadas en el manifiesto
  echo "→ Actualizando skills del vendor (modo seguro) ..."
  UPDATED=0
  SKIPPED_LOCAL=0
  while IFS= read -r skill_name; do
    [[ -z "$skill_name" || "$skill_name" == \#* ]] && continue
    if [[ -d "$SKILLS_SRC/$skill_name" ]]; then
      copy_skill_dir "$skill_name"
      ((UPDATED++)) || true
    fi
  done < "$MANIFEST"

  # Detectar skills locales (no en manifiesto) para informar
  for skill_dir in "$SKILLS_DST"/*/; do
    skill_name="$(basename "$skill_dir")"
    if ! grep -qxF "$skill_name" "$MANIFEST" 2>/dev/null; then
      ((SKIPPED_LOCAL++)) || true
    fi
  done

  echo "  ✓ $UPDATED skills del vendor actualizadas"
  [[ $SKIPPED_LOCAL -gt 0 ]] && echo "  ✓ $SKIPPED_LOCAL skills locales conservadas sin tocar"

else
  # Modo install completo: copiar todas las skills del vendor
  echo "→ Instalando skills en $SKILLS_DST ..."
  rm -rf "$SKILLS_DST"
  mkdir -p "$SKILLS_DST"
  cp -R "$SKILLS_SRC/." "$SKILLS_DST/"
  echo "  ✓ ${#VENDOR_SKILLS[@]} skills instaladas"
fi

refresh_claude_skills_mirror

# --- Escribir / actualizar manifiesto --------------------------------------
{
  echo "# Skills instaladas desde liferay-dxp-docker-dev"
  echo "# Actualizado: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# NO editar manualmente — generado por tools/ai/install.sh"
  for skill_name in "${VENDOR_SKILLS[@]}"; do
    echo "$skill_name"
  done
} > "$MANIFEST"

# --- Instalar AGENTS.md (solo en modo install completo) --------------------
if [[ "$SKILLS_ONLY" == "false" ]]; then
  mkdir -p "$CLAUDE_AGENTS_DST"
  mkdir -p "$AGENTS_DST"

  AGENTS_DST="$TARGET_DIR/AGENTS.md"
  if [[ -f "$AGENTS_DST" ]] && [[ "$FORCE" == "false" ]]; then
    echo "  ⚠ AGENTS.md ya existe. Usa --force para sobrescribir."
  else
    cp "$SCRIPT_DIR/AGENTS.md" "$AGENTS_DST"
    echo "  ✓ AGENTS.md instalado"
  fi

  # --- Instalar activos de validación y runbooks ---------------------------
  cp -R "$AGENTS_SRC/." "$TARGET_DIR/agents/"
  echo "  ✓ agents/ instalado (arquitectura + validación + contexto)"

  if [[ -d "$CLAUDE_AGENTS_SRC" ]]; then
    rm -rf "$CLAUDE_AGENTS_DST"
    mkdir -p "$CLAUDE_AGENTS_DST"
    cp -R "$CLAUDE_AGENTS_SRC/." "$CLAUDE_AGENTS_DST/"
    echo "  ✓ .claude/agents instalado"
  fi

  # --- Instalar CLAUDE.md bootstrapado desde contexto real -----------------
  CLAUDE_DST="$TARGET_DIR/CLAUDE.md"
  if [[ -f "$CLAUDE_DST" ]]; then
    echo "  ⚠ CLAUDE.md ya existe — no se sobreescribe (contiene configuración del proyecto)."
    echo "    Puedes revisar la plantilla en: $SCRIPT_DIR/CLAUDE.md.template"
  else
    "$BOOTSTRAP_SCRIPT" "$TARGET_DIR"
    CLAUDE_GENERATED=true
    echo "  ✓ CLAUDE.md generado con bootstrap de contexto real"
  fi
fi

# --- Resumen ---------------------------------------------------------------
echo ""
echo "Instalación completada en: $TARGET_DIR"
echo ""

if [[ "$SKILLS_ONLY" == "true" ]]; then
  echo "Skills del vendor actualizadas. Ejecuta:"
  echo "  git diff .agents/skills/   ← para ver qué cambió el vendor"
  echo ""
  echo "Regla: si una skill del vendor cambió Y tú la tenías modificada,"
  echo "el diff muestra tus customizaciones perdidas → contribuye el cambio"
  echo "de vuelta al vendor o mantenlo como override local documentado."
else
  if [[ "$CLAUDE_GENERATED" == "true" ]] || [[ ! -f "$TARGET_DIR/CLAUDE.md" ]] || diff -q "$SCRIPT_DIR/CLAUDE.md.template" "$TARGET_DIR/CLAUDE.md" &>/dev/null 2>&1; then
    echo "Próximos pasos:"
    echo "  1. Revisa CLAUDE.md y completa SOLO los huecos marcados con [TODO]."
    echo "  2. Valida la instalación con: bash agents/validate-all.sh"
    echo "  3. Revisa .agents/skills/ y añade skills proyecto-específicas si las necesitas."
    echo "     Usa un prefijo del proyecto para evitar colisiones: ub-*, acme-*, etc."
    echo "  4. Ejecuta: task env:start"
  else
    echo "Skills actualizadas. Ejecuta:"
    echo "  git diff .agents/skills/   ← para revisar cambios del vendor"
  fi
fi
