# Issue Brief #NUM: TITULO

**Tipo**: Bug | Feature
**Prioridad**: crítica | alta | media | baja
**Capa**: CSS/Theme

**Síntoma exacto**: [CSS: color, tamaño, visibilidad, margen, alineación — describe lo que se ve vs lo que debería verse]
**Comportamiento actual**: [qué ocurre ahora visualmente]
**Comportamiento esperado**: [qué debería ocurrir]

**URLs afectadas**: [lista de URLs donde reproducir el problema]

**Selector CSS afectado**: [.clase o #id afectado, extraído de capturas/descripción — OBLIGATORIO]
**Clase Clay involucrada**: [p.ej. .btn-unstyled, .nav-item, .card — o N/A]
**Computed style actual**: [propiedad: valor_actual — extraer de descripción o capturas]
**Computed style esperado**: [propiedad: valor_esperado]

**Ficheros resueltos**: (rutas absolutas auto-detectadas por issue-analyst — vacío si no aplica)

**Módulos candidatos**: ub-theme (`liferay/themes/ub-theme/`)
**Ficheros probables**:
- `liferay/themes/ub-theme/src/css/` (SCSS overrides — buscar por selector)

**Criterios de aceptación**:
- [ ] El computed style de SELECTOR coincide con el valor esperado
- [ ] Sin regresiones visuales detectadas por `task liferay -- theme check`
