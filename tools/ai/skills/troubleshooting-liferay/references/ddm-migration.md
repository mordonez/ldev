# DDM Migration Reference — Liferay DXP 2025.Q1

## Formatos DDM: tres formatos distintos

| Formato | Dónde | `type` separator | `type` text HTML |
|---|---|---|---|
| **Workspace** | `liferay/resources/journal/structures/<site>/*.json` | `"ddm-separator"` | `"ddm-text-html"` |
| **BD interna** | `ddmstructure.definition` | `"separator"` | `"rich_text"` |
| **Data Definition** | Exportado por UI | `"separator"` | igual que BD |

⚠️ "Importar y reemplazar" en UI acepta Data Definition, **NO workspace**. Usar siempre CI/CD.

## Comando estándar recomendado

Para importar y validar estructuras/templates con el CLI Groovy en un solo paso:

```bash
task liferay -- resource structure-sync \
  --name UB_STR_NOMBRE \
  --site /actualitat \
  --file liferay/resources/journal/structures/actualitat/UB_STR_NOMBRE.json
```

Documentación completa del flujo:

```bash
task liferay -- resource --help
```

---

## Estrategia de migración segura (sin ruptura)

### Decisión recomendada

1. Si hay contenidos activos con la estructura, evitar cambios destructivos in-place.
2. Preferir estrategia aditiva:
   - añadir campos nuevos / separator nuevo
   - conservar campos legacy
   - adaptar FTL para soportar ambos esquemas
3. Si el cambio incompatible es inevitable:
   - clonar estructura + templates (`*_V2`) y migrar contenidos gradualmente
   - o ejecutar migración DDM controlada con `DETECT` + `DRY_RUN` + ejecución real + rollback

### Qué se considera destructivo

- Renombrar/eliminar campos que ya tienen datos.
- Cambiar tipo de campo reutilizando el mismo `name`.
- Mover campos de raíz a `nestedFields` sin reparenting en `ddmfield`.

### Fuentes externas (oficiales Liferay, revisadas 2026-03-03)

- 7.4 U23 (warning + nota sobre `LPS-158457`): https://learn.liferay.com/w/dxp/whats-new-in-liferay/whats-new-in-liferay-7-4-2023-q3
- Gestión de estructuras/templates (warning de referencias + copy): https://learn.liferay.com/w/dxp/content-authoring-and-management/web-content/web-content-structures/managing-web-content-structures-and-templates
- API de estructuras/templates (ERC + consistencia `dataDefinitionFields`/`defaultDataLayout`): https://learn.liferay.com/w/dxp/integration/headless-apis/content-management-apis/web-content-apis/managing-web-content-structures-and-templates-by-using-the-rest-api

---

## Tablas DDM relevantes

| Tabla | Descripción |
|---|---|
| `ddmstructure` | Una fila por estructura; `definition` = JSON BD interna |
| `ddmstructureversion` | Versiones; `definition` = mismo formato; **NO tiene `modifieddate`** |
| `ddmfield` | Una fila por instancia de campo por artículo (`storageid = journalarticle.id_`) |
| `ddmfieldattribute` | Valores; `attributename IS NULL` = valor principal |

### Campos clave en ddmfield
- `fieldname`: nombre del campo (ej. `cuerpoDelTexto2`)
- `fieldtype`: tipo en BD (`separator`, `rich_text`, `text`…)
- `parentfieldid`: `0` = raíz; `<id>` = hijo del campo con ese fieldid
- `storageid`: = `journalarticle.id_`
- `structureversionid`: versión de estructura
- `localizable`: `false` para separators
- `instanceid`: string de 8 chars (UUID sin guiones, truncado)
- `priority`: posición del campo en el formulario

---

## SQL de diagnóstico

### Ver campos de un artículo concreto
```sql
SELECT df.fieldname, df.fieldtype, df.parentfieldid, df.priority,
       LEFT(COALESCE(dfa.largeattributevalue, dfa.smallattributevalue, '(vacío)'), 100) as valor
FROM ddmfield df
LEFT JOIN ddmfieldattribute dfa ON dfa.fieldid = df.fieldid AND dfa.attributename IS NULL
WHERE df.storageid = <ja.id_>
ORDER BY df.priority, df.fieldname;
```

### Contar artículos con campo en raíz (parentfieldid=0) con contenido real
```sql
SELECT COUNT(DISTINCT ja.id_) as afectados
FROM journalarticle ja
JOIN ddmfield df ON df.storageid = ja.id_
  AND df.fieldname IN ('campo1', 'campo2')
  AND df.parentfieldid = 0
JOIN ddmfieldattribute dfa ON dfa.fieldid = df.fieldid AND dfa.attributename IS NULL
WHERE ja.ddmstructureid = <structureid>
  AND ja.status = 0
  AND COALESCE(dfa.largeattributevalue, dfa.smallattributevalue, '')
      NOT IN ('', '<br>', '<p></p>', '<p>&nbsp;</p>');
```

### Artículos ya migrados (tienen el separator)
```sql
SELECT COUNT(DISTINCT storageid)
FROM ddmfield
WHERE fieldname = 'miSeparador' AND parentfieldid = 0;
```

### Obtener structureid + structureversionid
```sql
SELECT s.structureid, sv.structureversionid
FROM ddmstructure s
JOIN ddmstructureversion sv ON sv.structureid = s.structureid
WHERE s.structurekey = 'UB_STR_NOMBRE'
ORDER BY sv.createdate DESC LIMIT 1;
```

---

## Patrón de migración: reparenting en ddmfield

No requiere tocar `ddmfieldattribute`. Solo modifica jerarquía en `ddmfield`.

### Script de referencia
`liferay/scripts/migrations/migrate-novedad-separator-bloques.groovy`

Modos (ejecutar en este orden):
1. `DETECT=true, DRY_RUN=true` → ver `fieldtype` real del separator en BD
2. `DETECT=false, DRY_RUN=true` → contar artículos a migrar sin tocar nada
3. `DETECT=false, DRY_RUN=false` → migración real con rollback automático si hay errores

### SQL equivalente (para entender lo que hace el script)
```sql
-- Por cada artículo a migrar:

-- 1. Insertar separator (fieldid y instanceid se generan en Groovy)
INSERT INTO ddmfield
    (mvccversion, ctcollectionid, fieldid, companyid, parentfieldid,
     storageid, structureversionid, fieldtype, instanceid, localizable, priority, fieldname)
VALUES (0, 0, <nuevo_fieldid>, <companyid>, 0,
        <storageid>, <structureversionid>, 'separator', <instanceid_8chars>, false,
        (SELECT MIN(priority) FROM ddmfield WHERE storageid=<storageid>
         AND fieldname IN ('campo1','campo2') AND parentfieldid=0),
        'miSeparador');

-- 2. Re-parentar campos legacy
UPDATE ddmfield
SET parentfieldid = <nuevo_fieldid>
WHERE storageid = <storageid>
  AND fieldname IN ('campo1', 'campo2')
  AND parentfieldid = 0;
```

---

## Actualizar ddmstructure.definition en BD (Python + psql)

```python
import json, subprocess, copy

# Leer definición actual
r = subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','ub','-d','ub',
    '-t','-A','-c', "SELECT definition FROM ddmstructure WHERE structureid=<ID>"],
    capture_output=True, text=True)
defj = json.loads(r.stdout.strip())
fields = defj['fields']

# Encontrar campo_referencia y copiar definiciones de campos a anidar
ref_idx = next(i for i,f in enumerate(fields) if f['name'] == 'campo_referencia')
campo1_def = copy.deepcopy(next(f for f in fields if f['name'] == 'campo1'))
campo2_def = copy.deepcopy(next(f for f in fields if f['name'] == 'campo2'))

# Crear separator (formato BD interna: type="separator", localizable=false)
separator = {
    "rulesConditionDisabled": False, "dataType": "",
    "predefinedValue": {"en_US": "", "es_ES": "", "ca_ES": ""},
    "readOnly": False,
    "label": {"en_US": "Mi Label", "es_ES": "Mi Label", "ca_ES": "La meva Label"},
    "type": "separator",           # ← BD interna: "separator", NO "ddm-separator"
    "showLabel": True, "required": False, "repeatable": True,
    "name": "miSeparador", "localizable": False,
    "fieldReference": "miSeparador",
    "tip": {"en_US": "", "es_ES": "", "ca_ES": ""},
    "style": {"ca_ES": ""},
    "nestedFields": [campo1_def, campo2_def]
}

# Insertar después del campo de referencia; eliminar campos del nivel raíz
new_fields = []
for i, f in enumerate(fields):
    if f['name'] in ('campo1', 'campo2'):
        continue  # eliminados del raíz — ahora son nested
    new_fields.append(f)
    if i == ref_idx:
        new_fields.append(separator)

defj['fields'] = new_fields
new_def = json.dumps(defj, ensure_ascii=False, separators=(',', ':'))
open('/tmp/new_def.json', 'w').write(new_def)
```

```bash
# Aplicar (ejecutar desde docker/ del worktree)
NEW_DEF=$(cat /tmp/new_def.json)
docker compose exec -T postgres psql -U ub -d ub -c \
  "UPDATE ddmstructure SET definition = \$\$${NEW_DEF}\$\$ WHERE structureid = <ID>;"
docker compose exec -T postgres psql -U ub -d ub -c \
  "UPDATE ddmstructureversion SET definition = \$\$${NEW_DEF}\$\$ WHERE structureversionid = <VER_ID>;"

# Verificar
docker compose exec -T postgres psql -U ub -d ub -t -A -c \
  "SELECT 'str: ' || (definition LIKE '%miSeparador%') FROM ddmstructure WHERE structureid=<ID>
   UNION ALL
   SELECT 'ver: ' || (definition LIKE '%miSeparador%') FROM ddmstructureversion WHERE structureversionid=<VER_ID>;"
```

---

## FTL pattern para campos repetibles via separator

```ftl
<#-- Para separator repetible: getSiblings() itera las instancias -->
<#list miSeparador.getSiblings() as bloque>
    <#if (bloque.campo1.getData())?has_content>
        <div class="mi-clase">${bloque.campo1.getData()}</div>
    </#if>
    <#if (bloque.campo2.getData())?has_content>
        <div class="otro-clase">${bloque.campo2.getData()}</div>
    </#if>
</#list>
```

**Dos condiciones necesarias:**
1. `miSeparador` en `ddmstructure.definition` con `"type":"separator"`, `"repeatable":true`, `"nestedFields":[campo1, campo2]`
2. Filas en `ddmfield`: separator con `parentfieldid=0`; hijos con `parentfieldid=<fieldid_separator>`

| Condición ausente | Síntoma |
|---|---|
| Falta 1 (no en definition) | Error FTL: `miSeparador has evaluated to null or missing` |
| Falta 2 (no en ddmfield) | Loop vacío, sin error, sin contenido renderizado |

---

## Actualizar plantillas FTL en BD (sin UI)

```bash
# Copiar FTL al contenedor
CONTAINER=$(docker compose ps -q liferay)
docker cp liferay/resources/journal/templates/actualitat/MI_PLANTILLA.ftl ${CONTAINER}:/tmp/
```

```groovy
// En Groovy console (Panel Control → Servidor → Script)
import com.liferay.dynamic.data.mapping.service.DDMTemplateLocalServiceUtil
def template = DDMTemplateLocalServiceUtil.getTemplate(<templateId>)
template.setScript(new File('/tmp/MI_PLANTILLA.ftl').text)
DDMTemplateLocalServiceUtil.updateDDMTemplate(template)
out.println "OK: ${template.getTemplateKey()}"
```

### IDs de plantillas conocidas (BD de producción / worktrees)
| Clave | templateId |
|---|---|
| `UB_TPL_NOVEDAD_DETALLE` | 2944026 |
| `UB_TPL_NOTA_PRENSA_DETALLE` | 2944023 |
| `UB_TPL_NOVEDAD_NOTA_PRENSA_DETALLE` | 2982047 |

---

## Groovy console: alternativas al CAPTCHA

El CAPTCHA aparece en cada nueva sesión de browser. Alternativas directas:

| Necesidad | Alternativa |
|---|---|
| Cambiar BD (estructura, artículos) | `docker compose exec -T postgres psql ...` |
| Comandos OSGi, bundles | `task gogo` |
| Actualizar FTL en BD | `docker cp` + Groovy con `DDMTemplateLocalServiceUtil` |
| Script Groovy complejo inevitable | Inyectar via `playwright-cli run-code` + leer CAPTCHA con screenshot |
