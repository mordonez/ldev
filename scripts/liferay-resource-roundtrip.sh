#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-${1:-/tmp/test-liferay-init}}"
SITE="${SITE:-/global}"
WORK_DIR="${WORK_DIR:-$PROJECT_DIR/.tmp/liferay-resource-roundtrip}"

if ! command -v ldev >/dev/null 2>&1; then
  echo "ldev no está disponible en PATH" >&2
  exit 1
fi

if [[ ! -f "$PROJECT_DIR/.liferay-cli.yml" ]]; then
  echo ".liferay-cli.yml no encontrado en $PROJECT_DIR" >&2
  exit 1
fi

mkdir -p "$WORK_DIR/backups"

SITE_TOKEN="${SITE#/}"
if [[ -z "$SITE_TOKEN" ]]; then
  SITE_TOKEN="global"
fi

FRAGMENTS_PROJECT_DIR="$WORK_DIR/fragments-project"
ADTS_PROJECT_DIR="$WORK_DIR/adts-project"

log() {
  printf '[resource-roundtrip] %s\n' "$*"
}

run_cli_json() {
  local output
  output="$(cd "$PROJECT_DIR" && npm_config_loglevel=silent ldev liferay "$@" --format json)"
  printf '%s' "$output" | node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(0, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.ok === false) {
      console.error(data.error?.message || "ldev returned an error payload");
      process.exit(1);
    }
    process.stdout.write(raw);
  '
}

json_eval() {
  local script="$1"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(0,'utf8')); ${script}"
}

backup_file() {
  local file="$1"
  local backup="$WORK_DIR/backups/${file#$PROJECT_DIR/}"
  mkdir -p "$(dirname "$backup")"
  cp "$file" "$backup"
}

restore_file() {
  local file="$1"
  local backup="$WORK_DIR/backups/${file#$PROJECT_DIR/}"
  if [[ -f "$backup" ]]; then
    cp "$backup" "$file"
  fi
}

widget_dir() {
  case "$1" in
    asset-entry) echo "asset_entry" ;;
    breadcrumb) echo "breadcrumb" ;;
    category-facet) echo "category_facet" ;;
    custom-facet) echo "custom_facet" ;;
    custom-filter) echo "custom_filter" ;;
    language-selector) echo "language_selector" ;;
    navigation-menu) echo "navigation_menu" ;;
    search-result-summary) echo "search_result_summary" ;;
    searchbar) echo "searchbar" ;;
    similar-results) echo "search_results" ;;
    *)
      echo "widget-type ADT no soportado en smoke: $1" >&2
      exit 1
      ;;
  esac
}

write_file() {
  local target="$1"
  local content="$2"
  mkdir -p "$(dirname "$target")"
  printf '%s' "$content" > "$target"
}

mutate_structure_file() {
  local file="$1"
  local marker="$2"
  node - "$file" "$marker" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const marker = process.argv[3];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (data.name && typeof data.name === 'object') {
  for (const locale of Object.keys(data.name)) {
    data.name[locale] = `${String(data.name[locale]).replace(/\s+\[CLI-ROUNDTRIP-[^\]]+\]$/, '')} ${marker}`;
  }
} else if (typeof data.name === 'string') {
  data.name = `${data.name.replace(/\s+\[CLI-ROUNDTRIP-[^\]]+\]$/, '')} ${marker}`;
} else {
  data.name = {en_US: marker};
}
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
NODE
}

append_line() {
  local file="$1"
  local line="$2"
  printf '\n%s\n' "$line" >> "$file"
}

create_template_if_missing() {
  local templates_json="$1"
  if [[ "$(printf '%s' "$templates_json" | json_eval 'process.stdout.write(String(Array.isArray(data) ? data.length : 0));')" != "0" ]]; then
    return
  fi

  local file="$PROJECT_DIR/liferay/resources/journal/templates/$SITE_TOKEN/CLI-SMOKE-TEMPLATE.ftl"
  write_file "$file" '<#-- CLI smoke template -->'
  run_cli_json resource import-template --site "$SITE" --id CLI-SMOKE-TEMPLATE --file "$file" --structure-key "$STRUCTURE_KEY" --create-missing >/dev/null
}

create_adt_if_missing() {
  local adts_json="$1"
  if [[ "$(printf '%s' "$adts_json" | json_eval 'process.stdout.write(String(Array.isArray(data) ? data.length : 0));')" != "0" ]]; then
    return
  fi

  local file="$PROJECT_DIR/liferay/resources/templates/application_display/$SITE_TOKEN/search_result_summary/CLI-SMOKE-ADT.ftl"
  write_file "$file" '<#-- CLI smoke ADT -->'
  run_cli_json resource import-adt --site "$SITE" --key CLI-SMOKE-ADT --widget-type search-result-summary --file "$file" --create-missing >/dev/null
}

ensure_valid_fragment_fixture() {
  local fragments_json="$1"
  if printf '%s' "$fragments_json" | FRAGMENT_COLLECTION="cli-smoke" FRAGMENT_KEY="cli-smoke-fragment" json_eval '
    const found = Array.isArray(data) && data.some((row) => (
      String(row.collectionKey) === process.env.FRAGMENT_COLLECTION &&
      String(row.fragmentKey) === process.env.FRAGMENT_KEY
    ));
    process.exit(found ? 0 : 1);
  '; then
    return
  fi

  local base="$PROJECT_DIR/liferay/fragments/sites/$SITE_TOKEN/src/cli-smoke/fragments/cli-smoke-fragment"
  mkdir -p "$base"
  cat > "$PROJECT_DIR/liferay/fragments/sites/$SITE_TOKEN/src/cli-smoke/collection.json" <<'JSON'
{
  "name": "CLI Smoke",
  "description": "Created by functional smoke"
}
JSON
  write_file "$base/index.html" '<div class="cli-smoke-fragment">CLI smoke fragment</div>'
  write_file "$base/index.css" '.cli-smoke-fragment{color:#b50909;}'
  write_file "$base/index.js" 'console.log("cli smoke fragment");'
  cat > "$base/configuration.json" <<'JSON'
{
  "fieldSets": [
    {
      "fields": [
        {
          "dataType": "object",
          "label": "text-color",
          "name": "textColor",
          "type": "colorPalette"
        }
      ]
    }
  ]
}
JSON
  cat > "$base/fragment.json" <<'JSON'
{
  "configurationPath": "configuration.json",
  "jsPath": "index.js",
  "htmlPath": "index.html",
  "cssPath": "index.css",
  "icon": "adjust",
  "name": "CLI Smoke Fragment",
  "type": "component"
}
JSON
  run_cli_json resource import-fragment --site "$SITE" --fragment "cli-smoke/fragments/cli-smoke-fragment" >/dev/null
}

assert_structure_marker() {
  local marker="$1"
  local payload
  payload="$(run_cli_json resource structure --site "$SITE" --key "$STRUCTURE_KEY")"
  printf '%s' "$payload" | MARKER="$marker" json_eval '
    const marker = process.env.MARKER;
    const names = data.name && typeof data.name === "object" ? Object.values(data.name).map(String) : [String(data.name ?? "")];
    if (!names.some((value) => value.includes(marker))) {
      process.exit(1);
    }
  '
}

assert_template_marker() {
  local marker="$1"
  run_cli_json resource template --site "$SITE" --id "$TEMPLATE_ID" | MARKER="$marker" json_eval '
    if (!String(data.templateScript ?? "").includes(process.env.MARKER)) {
      process.exit(1);
    }
  '
}

assert_adt_marker() {
  local marker="$1"
  run_cli_json resource adts --site "$SITE" --widget-type "$ADT_WIDGET_TYPE" --include-script | MARKER="$marker" ADT_KEY="$ADT_KEY" json_eval '
    const row = Array.isArray(data) ? data.find((item) => String(item.templateKey) === process.env.ADT_KEY) : null;
    if (!row || !String(row.script ?? "").includes(process.env.MARKER)) {
      process.exit(1);
    }
  '
}

assert_fragment_marker() {
  local marker="$1"
  local dir="$WORK_DIR/verify-fragment"
  rm -rf "$dir"
  run_cli_json resource export-fragment --site "$SITE" --collection "$FRAGMENT_COLLECTION" --fragment "$FRAGMENT_KEY" --dir "$dir" >/dev/null
  if ! grep -Fq "$marker" "$dir/src/$FRAGMENT_COLLECTION/fragments/$FRAGMENT_KEY/index.html"; then
    echo "No se encontró el marcador del fragment en el export verificado" >&2
    exit 1
  fi
}

run_singular_roundtrip() {
  local marker="$1"
  log "Roundtrip singular"

  run_cli_json resource export-structure --site "$SITE" --key "$STRUCTURE_KEY" >/dev/null
  local structure_file="$PROJECT_DIR/liferay/resources/journal/structures/$SITE_TOKEN/$STRUCTURE_KEY.json"
  backup_file "$structure_file"
  mutate_structure_file "$structure_file" "$marker"
  run_cli_json resource import-structure --site "$SITE" --key "$STRUCTURE_KEY" --file "$structure_file" >/dev/null
  assert_structure_marker "$marker"

  local template_export
  template_export="$(run_cli_json resource export-template --site "$SITE" --id "$TEMPLATE_ID")"
  local template_file
  template_file="$(printf '%s' "$template_export" | json_eval 'process.stdout.write(String(data.outputPath));')"
  backup_file "$template_file"
  append_line "$template_file" "<#-- $marker -->"
  run_cli_json resource import-template --site "$SITE" --id "$TEMPLATE_ID" --file "$template_file" >/dev/null
  assert_template_marker "$marker"

  rm -rf "$ADTS_PROJECT_DIR"
  run_cli_json resource export-adt --site "$SITE" --key "$ADT_KEY" --widget-type "$ADT_WIDGET_TYPE" --dir "$ADTS_PROJECT_DIR" >/dev/null
  local adt_file="$ADTS_PROJECT_DIR/$SITE_TOKEN/$(widget_dir "$ADT_WIDGET_TYPE")/$ADT_KEY.ftl"
  backup_file "$adt_file"
  append_line "$adt_file" "<#-- $marker -->"
  run_cli_json resource import-adt --site "$SITE" --key "$ADT_KEY" --widget-type "$ADT_WIDGET_TYPE" --file "$adt_file" >/dev/null
  assert_adt_marker "$marker"

  rm -rf "$FRAGMENTS_PROJECT_DIR"
  run_cli_json resource export-fragment --site "$SITE" --collection "$FRAGMENT_COLLECTION" --fragment "$FRAGMENT_KEY" --dir "$FRAGMENTS_PROJECT_DIR" >/dev/null
  local fragment_file="$FRAGMENTS_PROJECT_DIR/src/$FRAGMENT_COLLECTION/fragments/$FRAGMENT_KEY/index.html"
  backup_file "$fragment_file"
  append_line "$fragment_file" "<div class=\"cli-roundtrip-marker\">$marker</div>"
  run_cli_json resource import-fragment --site "$SITE" --dir "$FRAGMENTS_PROJECT_DIR" --fragment "$FRAGMENT_COLLECTION/fragments/$FRAGMENT_KEY" >/dev/null
  assert_fragment_marker "$marker"

  restore_file "$structure_file"
  restore_file "$template_file"
  restore_file "$adt_file"
  restore_file "$fragment_file"

  run_cli_json resource import-structure --site "$SITE" --key "$STRUCTURE_KEY" --file "$structure_file" >/dev/null
  run_cli_json resource import-template --site "$SITE" --id "$TEMPLATE_ID" --file "$template_file" >/dev/null
  run_cli_json resource import-adt --site "$SITE" --key "$ADT_KEY" --widget-type "$ADT_WIDGET_TYPE" --file "$adt_file" >/dev/null
  run_cli_json resource import-fragment --site "$SITE" --dir "$FRAGMENTS_PROJECT_DIR" --fragment "$FRAGMENT_COLLECTION/fragments/$FRAGMENT_KEY" >/dev/null
}

run_plural_roundtrip() {
  local marker="$1"
  log "Roundtrip plural"

  run_cli_json resource export-structures --site "$SITE" >/dev/null
  run_cli_json resource export-templates --site "$SITE" >/dev/null
  rm -rf "$ADTS_PROJECT_DIR"
  run_cli_json resource export-adts --site "$SITE" --key "$ADT_KEY" --widget-type "$ADT_WIDGET_TYPE" --dir "$ADTS_PROJECT_DIR" >/dev/null
  rm -rf "$FRAGMENTS_PROJECT_DIR"
  run_cli_json resource export-fragments --site "$SITE" --collection "$FRAGMENT_COLLECTION" --fragment "$FRAGMENT_KEY" --dir "$FRAGMENTS_PROJECT_DIR" >/dev/null

  local structure_file="$PROJECT_DIR/liferay/resources/journal/structures/$SITE_TOKEN/$STRUCTURE_KEY.json"
  local template_file="$PROJECT_DIR/liferay/resources/journal/templates/$SITE_TOKEN/$TEMPLATE_ID.ftl"
  local adt_file="$ADTS_PROJECT_DIR/$SITE_TOKEN/$(widget_dir "$ADT_WIDGET_TYPE")/$ADT_KEY.ftl"
  local fragment_file="$FRAGMENTS_PROJECT_DIR/src/$FRAGMENT_COLLECTION/fragments/$FRAGMENT_KEY/index.html"

  backup_file "$structure_file"
  backup_file "$template_file"
  backup_file "$adt_file"
  backup_file "$fragment_file"

  mutate_structure_file "$structure_file" "$marker"
  append_line "$template_file" "<#-- $marker -->"
  append_line "$adt_file" "<#-- $marker -->"
  append_line "$fragment_file" "<div class=\"cli-roundtrip-marker\">$marker</div>"

  run_cli_json resource import-structures --site "$SITE" >/dev/null
  run_cli_json resource import-templates --site "$SITE" >/dev/null
  run_cli_json resource import-adts --site "$SITE" --widget-type "$ADT_WIDGET_TYPE" --dir "$ADTS_PROJECT_DIR" >/dev/null
  run_cli_json resource import-fragments --site "$SITE" --dir "$FRAGMENTS_PROJECT_DIR" >/dev/null

  assert_structure_marker "$marker"
  assert_template_marker "$marker"
  assert_adt_marker "$marker"
  assert_fragment_marker "$marker"

  restore_file "$structure_file"
  restore_file "$template_file"
  restore_file "$adt_file"
  restore_file "$fragment_file"

  run_cli_json resource import-structures --site "$SITE" >/dev/null
  run_cli_json resource import-templates --site "$SITE" >/dev/null
  run_cli_json resource import-adts --site "$SITE" --widget-type "$ADT_WIDGET_TYPE" --dir "$ADTS_PROJECT_DIR" >/dev/null
  run_cli_json resource import-fragments --site "$SITE" --dir "$FRAGMENTS_PROJECT_DIR" >/dev/null
}

log "Descubriendo recursos en $PROJECT_DIR ($SITE)"

STRUCTURES_JSON="$(run_cli_json inventory structures --site "$SITE")"
STRUCTURE_KEY="${STRUCTURE_KEY:-$(printf '%s' "$STRUCTURES_JSON" | json_eval 'const item = (Array.isArray(data) ? data.find((row) => row.key === "BASIC-WEB-CONTENT") : null) ?? (Array.isArray(data) ? data[0] : null); if (!item) process.exit(1); process.stdout.write(String(item.key));')}"

TEMPLATES_JSON="$(run_cli_json inventory templates --site "$SITE")"
create_template_if_missing "$TEMPLATES_JSON"
TEMPLATES_JSON="$(run_cli_json inventory templates --site "$SITE")"
TEMPLATE_ID="${TEMPLATE_ID:-$(printf '%s' "$TEMPLATES_JSON" | json_eval 'const item = Array.isArray(data) ? data[0] : null; if (!item) process.exit(1); process.stdout.write(String(item.externalReferenceCode || item.id));')}"

ADTS_JSON="$(run_cli_json resource adts --site "$SITE" --include-script)"
create_adt_if_missing "$ADTS_JSON"
ADTS_JSON="$(run_cli_json resource adts --site "$SITE" --include-script)"
ADT_KEY="${ADT_KEY:-$(printf '%s' "$ADTS_JSON" | json_eval 'const preferred = Array.isArray(data) ? data.find((row) => row.templateKey === "SEARCH-RESULTS-LIST-FTL") : null; const item = preferred ?? (Array.isArray(data) ? data[0] : null); if (!item) process.exit(1); process.stdout.write(String(item.templateKey));')}"
ADT_WIDGET_TYPE="${ADT_WIDGET_TYPE:-$(printf '%s' "$ADTS_JSON" | ADT_KEY="$ADT_KEY" json_eval 'const item = Array.isArray(data) ? data.find((row) => String(row.templateKey) === process.env.ADT_KEY) : null; if (!item) process.exit(1); process.stdout.write(String(item.widgetType));')}"

FRAGMENTS_JSON="$(run_cli_json resource fragments --site "$SITE")"
ensure_valid_fragment_fixture "$FRAGMENTS_JSON"
FRAGMENT_COLLECTION="cli-smoke"
FRAGMENT_KEY="cli-smoke-fragment"

SINGULAR_MARKER="[CLI-ROUNDTRIP-SINGULAR-$(date +%s)]"
PLURAL_MARKER="[CLI-ROUNDTRIP-PLURAL-$(date +%s)]"

run_singular_roundtrip "$SINGULAR_MARKER"
run_plural_roundtrip "$PLURAL_MARKER"

log "OK"
log "structure=$STRUCTURE_KEY template=$TEMPLATE_ID adt=$ADT_KEY fragment=$FRAGMENT_COLLECTION/$FRAGMENT_KEY"
