---
name: capturing-session-knowledge
description: "Capturing and synchronizing verified session knowledge. Use when closing a feature, fix, or investigation to reduce future exploration costs and prevent recurring errors."
---

# Capturing Session Knowledge (Knowledge Manager)

This skill consolidates learning from current sessions into permanent, reusable memory. It ensures that hard-won discoveries (e.g., a tricky CSS selector or a specific Gogo shell command) are not lost.

## 🔄 The Knowledge Lifecycle (Mandatory)

### 1. Research & Collection
- **Scan Session History**: Identify key discoveries, bug causes, and successful commands.
- **Consult Existing Memory**: **CRITICAL**: Search `CLAUDE.md` and `references/` files using `grep` to see if this knowledge is already documented. Do not duplicate information.

### 2. Strategy & Synthesis
- **Filter for Quality**: Only capture *verified* facts.
- **Hierarchy of Truth**:
  - **Project Stack/Structure** -> `CLAUDE.md`.
  - **Global AI Policies** -> `AGENTS.md`.
  - **Domain "How-to" / Examples** -> `.agents/skills/<skill>/references/`.
  - **Architecture/Design** -> `agents/architecture.md`.

### 3. Execution (Capturing)
- **Draft Note**: Create a concise, technical note using clear, actionable language.
- **Update File**: Use `replace` or `save_memory` to persist the data.

### 4. Validation & Verification
- **Cross-Reference**: Ensure the new knowledge does not contradict existing documentation.
- **Format Check**: Ensure the captured data follows project conventions (e.g., Markdown structure).

---

# Sincronizacion de conocimiento de sesion

## Objetivo

Convertir lo aprendido en esta sesion en conocimiento reusable del repositorio, priorizando evidencia verificable y pasos operativos concretos.

## Cuando usarlo

- Al cerrar una sesion con cambios de codigo, scripts o configuracion.
- Al finalizar una issue/feature (aunque no se haya creado PR todavia).
- Cuando se detectan fallos recurrentes y se obtiene una causa/solucion confirmada.

## Entradas minimas

- Alcance: issue/feature o problema trabajado.
- Evidencia: comandos, logs, checks runtime/test/build/playwright.
- Evidencia TDD (cuando aplique): test nuevo/modificado en rojo antes del fix y en verde despues del fix.
- Ficheros tocados y decisiones tomadas.
- Resultado final: que quedo verificado y que no.

Si falta evidencia, no promover a estandar: marcar `NO_VERIFICADO`.

## Flujo obligatorio

1. Recopilar evidencia minima:
   ```bash
   git status --short
   git diff --name-only
   ```
2. Extraer solo patrones transferibles:
   - `golden path` (flujo feliz reproducible)
   - `troubleshooting` (sintoma -> causa -> check -> fix)
   - `red/green TDD` (test-first: rojo confirmado -> implementacion minima -> verde)
   - decisiones con trade-offs
   - discovery chains verificadas para agentes (ej: `inventory sites -> inventory pages -> inventory page`)
3. Actualizar conocimiento en el menor numero de archivos posible:
   - `CLAUDE.md` (reglas globales/runbooks cortos)
   - `.agents/skills/*` (procedimientos especializados)
   - `AGENTS.md` (descubribilidad de skills, si aplica)
4. Incluir ejemplos ejecutables (comando + salida esperada o criterio de exito).
5. Evitar narrativa de sesion, duplicados y detalles irrelevantes.
6. Publicar resumen de cierre con: cambios hechos, pendientes y riesgos.

## Golden paths a priorizar

Capturar con prioridad cualquier flujo que reduzca exploracion ciega de agentes. Ejemplo canonico:

```bash
task liferay -- inventory sites
task liferay -- inventory pages --site /<site>
task liferay -- inventory page --url /web/<site>/<friendly-url>
```

Señales de exito:
- `inventory sites` devuelve `pagesCommand`
- `inventory pages` devuelve `fullUrl` y `pageCommand`
- `inventory page` devuelve el contexto tecnico profundo de la pagina

## Formato recomendado de salida

1. Resumen ejecutivo (5-8 lineas).
2. Cambios por archivo (ruta + bloque exacto).
3. Runbook reutilizable (pasos numerados).
4. Tabla de comandos (`comando | objetivo | senal de exito`).
5. Pendientes y riesgos (`NO_VERIFICADO` cuando corresponda).

## Criterios de calidad

- Accionable en menos de 5 minutos por otro agente.
- Basado en evidencia (logs, estados, resultados de comandos).
- Sin contradicciones con runbooks existentes.
- Sin duplicar contenido ya documentado.

## Checklist DoD de conocimiento

- [ ] Se anadio al menos un `golden path` reusable.
- [ ] Se documento al menos un caso de troubleshooting reutilizable.
- [ ] Se registro evidencia `red/green` o se marco `NO_APLICA` con motivo.
- [ ] Hay comandos con resultado esperado.
- [ ] Todo lo no probado esta marcado `NO_VERIFICADO`.
- [ ] No se introdujeron cambios funcionales de producto al cerrar sesion.
