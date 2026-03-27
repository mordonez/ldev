# Uso práctico de agentes (issue -> PR)

## 1. Flujo mínimo reproducible

```bash
# 1) Preparar contexto
task dev:llm-validate
task dev:skills-validate

# 2) Preparar entorno aislado
task worktree:new -- issue-123
cd .worktrees/issue-123

# 3) Ejecutar pipeline v2
# (usar skill /resolving-issues #123)
# issue-resolver -> build-verifier -> runtime-verifier -> pr-creator
```

## 2. Matriz de paridad funcional (v2)

| Capacidad operativa | Responsable en v2 |
|---|---|
| Brief de issue + criterios de aceptación | `issue-resolver` |
| Resolución de rutas candidatas | `issue-resolver` |
| Validación/preparación de entorno worktree | `issue-resolver` + `/managing-worktree-env` |
| Exploración de código acotada | `issue-resolver` |
| Plan de implementación | `issue-resolver` |
| Aplicación de fix | `issue-resolver` |
| Reintentos con evidencia | `issue-resolver` |
| Gate de build/deploy | `build-verifier` |
| Gate runtime/aceptación | `runtime-verifier` |
| Commit + PR + comentario final | `pr-creator` |

## 3. Escenarios de validación recomendados

Ejecutar estos 3 escenarios para considerar estable el cierre:

1. **CSS/Theme**: issue visual con evidencia Playwright.
2. **FTL/Journal**: issue de renderizado plantilla.
3. **Java/OSGi**: issue con módulo/bundle y estado ACTIVE.

Para cada escenario, registrar:

- Tiempo total.
- Nº de retries.
- Resultado final (`VERIFIED`/`ESCALATE`).
- Evidencia mínima (logs/estado/screenshot cuando aplique).

## 4. Checklist de Definition of Done

- Entorno aislado por worktree activo.
- Artefactos `/tmp` generados por `issue-resolver`.
- Build y runtime verificados por gates dedicados.
- PR creado y enlazado en issue.
