# Issue Brief #NUM: TITULO

**Tipo**: Bug | Feature
**Prioridad**: crítica | alta | media | baja
**Capa**: FTL Template

**Síntoma exacto**: [descripción del problema en la plantilla FreeMarker]
**Comportamiento actual**: [qué renderiza ahora]
**Comportamiento esperado**: [qué debería renderizar]

**URLs afectadas**: [lista de URLs donde se usa la plantilla]

**Estructura DDM afectada**: [nombre de la estructura UB_STR_* — o N/A si es nueva]
**Naming esperado de plantilla**: [UB_TPL_NOMBRE_DESCRIPTOR — OBLIGATORIO para code-explorer]
**Variables DDM disponibles**: [campos del JSON de estructura relevantes para el fix]

**Ficheros resueltos**: (rutas absolutas auto-detectadas por issue-analyst — vacío si no aplica)

**Template IDs (BD)**: (poblar aquí — usar `task liferay -- inventory templates --site /SITE` para obtener IDs por site)
- `UB_TPL_NOMBRE`: templateid=XXXXXX

**Fix aplicado**: [fragmento de código introducido por el fix — build-verifier y runtime-verifier lo buscan en ddmtemplate.script]

**Módulos candidatos**: `liferay/resources/journal/`
**Ficheros probables**:
- `liferay/resources/journal/structures/<site>/UB_STR_NOMBRE.json`
- `liferay/resources/journal/templates/<site>/UB_TPL_NOMBRE.ftl`

**Criterios de aceptación**:
- [ ] La plantilla renderiza correctamente en la URL afectada
- [ ] Los campos DDM se muestran con el formato esperado
