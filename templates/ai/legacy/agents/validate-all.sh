#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Unified Agent and Skill Validator
#
# It runs a comprehensive set of checks to ensure the integrity of agent
# definitions, skills, documentation, and context manifests.
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

errors=0
warnings=0

if [[ -d ".agents/skills" ]]; then
  SKILLS_DIR=".agents/skills"
else
  SKILLS_DIR="skills"
fi

if [[ -f "CLAUDE.md" ]]; then
  CLAUDE_DOC="CLAUDE.md"
else
  CLAUDE_DOC="CLAUDE.md.template"
fi

# ==============================================================================
# Logging Helpers
# ==============================================================================
err() {
  echo "ERROR: $*" >&2
  errors=$((errors + 1))
}

warn() {
  echo "WARN: $*" >&2
  warnings=$((warnings + 1))
}

section() {
  echo "=============================================================================="
  echo "=> $1"
  echo "=============================================================================="
}

# ==============================================================================
# Validation: Context Manifests (from build-context.sh)
# ==============================================================================
validate_manifests() {
  section "Validating Context Manifests"
  local manifest_errors=0
  local MANIFEST_DIR="agents/context/manifests"

  for manifest in "$MANIFEST_DIR"/*.lst; do
    [[ -f "$manifest" ]] || continue
    local line=0
    while IFS= read -r rel_path || [[ -n "$rel_path" ]]; do
      line=$((line + 1))
      [[ -z "$rel_path" ]] && continue
      [[ "$rel_path" =~ ^# ]] && continue

      if [[ "$rel_path" = /* ]]; then
        err "Manifests: Ruta absoluta no permitida en $(basename "$manifest"):$line -> $rel_path | Corrección: usa una ruta relativa al repo (ej: agents/context/README.md)."
        manifest_errors=$((manifest_errors + 1))
        continue
      fi

      if [[ ! -e "$ROOT_DIR/$rel_path" ]]; then
        err "Manifests: Ruta inexistente en $(basename "$manifest"):$line -> $rel_path | Corrección: crea el archivo/directorio o actualiza/elimina esta entrada en el .lst."
        manifest_errors=$((manifest_errors + 1))
      fi
    done < "$manifest"
  done

  if [[ "$manifest_errors" -eq 0 ]]; then
    echo "Manifests: OK."
  fi
}

# ==============================================================================
# Validation: Skills (from validate-skills.sh)
# ==============================================================================
validate_skills() {
  section "Validating Skills"
  local skill_errors=0

  if [[ ! -d "$SKILLS_DIR" ]]; then
    err "Skills: No existe el directorio de skills: $SKILLS_DIR"
    return
  fi

  local skill_name_dir
  for skill_dir in "$SKILLS_DIR"/*; do
    [[ -d "$skill_dir" ]] || continue

    skill_name_dir="$(basename "$skill_dir")"
    local skill_file="$skill_dir/SKILL.md"

    if [[ ! -f "$skill_file" ]]; then
      err "Skill '$skill_name_dir': Falta SKILL.md"
      skill_errors=$((skill_errors + 1))
      continue
    fi

    if [[ "$(sed -n '1p' "$skill_file")" != "---" ]]; then
      err "Skill '$skill_name_dir': SKILL.md no empieza con frontmatter YAML ('---')"
      skill_errors=$((skill_errors + 1))
      continue
    fi

    if ! awk 'NR>1 && /^---$/ { found=1; exit } END { exit(found ? 0 : 1) }' "$skill_file"; then
      err "Skill '$skill_name_dir': No se encontró cierre de frontmatter YAML"
      skill_errors=$((skill_errors + 1))
      continue
    fi

    local skill_name
    skill_name="$(awk '/^name:/ {print $2}' "$skill_file" | tr -d '"' || true)"
    local description
    description="$(awk '/^description:/ {$1=""; print $0}' "$skill_file" | sed 's/^ *//; s/"//g' || true)"

    if [[ -z "$skill_name" ]]; then
      err "Skill '$skill_name_dir': Falta campo frontmatter 'name'"
      skill_errors=$((skill_errors + 1))
    elif [[ "$skill_name" != "$skill_name_dir" ]]; then
      err "Skill '$skill_name_dir': 'name' ($skill_name) no coincide con carpeta ($skill_name_dir)"
      skill_errors=$((skill_errors + 1))
    fi

    if [[ -z "$description" ]]; then
      err "Skill '$skill_name_dir': Falta campo frontmatter 'description'"
      skill_errors=$((skill_errors + 1))
    elif ! grep -Eiq '(use when|usar cuando|usar al|trigger only when|when the user)' <<<"$description"; then
      warn "Skill '$skill_name_dir': La descripción no deja claro el trigger (falta 'Use when'/'Usar cuando')"
    fi
  done

  if [[ "$skill_errors" -eq 0 ]]; then
    echo "Skills: OK."
  fi
}

# ==============================================================================
# Validation: Agent Docs & Structure (from validate-agent-docs.sh)
# ==============================================================================
validate_agent_docs() {
  section "Validating Agent Docs & Links"
  local doc_errors=0

  # 1. Chequear links rotos en ficheros Markdown
  check_file_links() {
    local f="$1"
    local base
    base="$(dirname "$f")"

    # Usar grep y sed para extraer links (menos robusto que Python pero sin dependencias)
    while read -r link; do
      if [[ -z "$link" ]]; then
          continue
      fi
      if [[ "$link" =~ ^(https?://|#|mailto:) ]]; then
        continue # Ignorar links externos, anclas y mailto
      fi
      local target="${link%%#*}" # Quitar ancla
      [[ -z "$target" ]] && continue

      if [[ "$target" = /* ]]; then
        # Ruta absoluta desde la raíz del repo
        [[ -e "${target#/}" ]] || { err "Docs: Link roto en '$f': $target | Corrección: ajusta el destino del enlace o crea la ruta objetivo."; doc_errors=$((doc_errors + 1)); }
      else
        # Ruta relativa al fichero
        [[ -e "$base/$target" ]] || { err "Docs: Link roto en '$f': $target | Corrección: ajusta el enlace relativo desde '$base' o crea la ruta objetivo."; doc_errors=$((doc_errors + 1)); }
      fi
    done < <(grep -Eo '\[[^]]+]\([^)]+\)' "$f" | sed -E 's/\[[^]]+]\(([^)]+)\)/\1/')
  }

  local docs_paths=(AGENTS.md "$CLAUDE_DOC" agents "$SKILLS_DIR")
  [[ -e .claude ]] && docs_paths+=(.claude)

  while read -r f; do
    check_file_links "$f"
  done < <(find "${docs_paths[@]}" -name '*.md' -type f 2>/dev/null | sort)

  # 2. Rutas canónicas deben existir
  for p in AGENTS.md "$CLAUDE_DOC" agents/context/authority-map.md "$SKILLS_DIR"; do
    [[ -e "$p" ]] || { err "Docs: Ruta canónica faltante: $p"; doc_errors=$((doc_errors + 1)); }
  done

  # 3. Skills declaradas en AGENTS.md deben existir (con grep y while read)
  local declared_skills=()
  while IFS= read -r skill; do
      [[ -n "$skill" ]] && declared_skills+=("$skill")
  done < <(grep -Eo '`/[a-z0-9-]+' AGENTS.md | cut -c3-)

  if (( ${#declared_skills[@]} == 0 )); then
    err "Docs: No se pudieron extraer skills declaradas desde AGENTS.md"
    doc_errors=$((doc_errors + 1))
  else
    for skill in "${declared_skills[@]}"; do
      [[ -f "$SKILLS_DIR/$skill/SKILL.md" ]] || { err "Docs: Skill declarada en AGENTS.md no existe: $skill | Corrección: crea $SKILLS_DIR/$skill/SKILL.md o elimina la referencia en AGENTS.md."; doc_errors=$((doc_errors + 1)); }
    done
  fi

  # 4. Si hay runbooks Claude, validar pipeline mínimo
  if [[ -d ".claude/agents" ]]; then
    local required_agents=(
      ".claude/agents/issue-resolver.md"
      ".claude/agents/build-verifier.md"
      ".claude/agents/runtime-verifier.md"
      ".claude/agents/pr-creator.md"
    )
    local agent_path
    for agent_path in "${required_agents[@]}"; do
      [[ -f "$agent_path" ]] || {
        err "Docs: Runbook Claude faltante: $agent_path"
        doc_errors=$((doc_errors + 1))
      }
    done
  fi

  # 5. Si hay mirror Claude de skills, validar que cada skill declarada tenga enlace/entrada
  if [[ -d ".claude/skills" && "$SKILLS_DIR" == ".agents/skills" ]]; then
    local skill
    for skill in "${declared_skills[@]}"; do
      [[ -e ".claude/skills/$skill" ]] || {
        err "Docs: Mirror Claude faltante para skill declarada: .claude/skills/$skill"
        doc_errors=$((doc_errors + 1))
      }
    done
  fi

  if [[ "$doc_errors" -eq 0 ]]; then
    echo "Agent Docs: OK."
  fi
}


# ==============================================================================
# Main Execution
# ==============================================================================
main() {
  validate_manifests
  validate_skills
  validate_agent_docs

  echo "------------------------------------------------------------------------------"
  if [[ "$errors" -gt 0 ]]; then
    echo "Validación fallida con $errors error(es) y $warnings warning(s)."
    exit 1
  elif [[ "$warnings" -gt 0 ]]; then
    echo "Validación completada con $warnings warning(s) (pero sin errores)."
    exit 0
  else
    echo "Validación completada con éxito."
    exit 0
  fi
}

main
