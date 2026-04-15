# Playbook de prompts para Claude Code - Refactor ldev

Este documento guarda prompts exhaustivos para ejecutar el plan de refactor R0-R18 en slices pequenas, con control de riesgo y verificacion continua.

## Como usar este playbook

1. Ejecuta un prompt por PR.
2. No mezcles refactors.
3. Pide siempre diff pequeno + tests + verificacion.
4. Si Claude detecta cambios fuera de alcance, debe parar y reportar.

## Criterio transversal de simplificacion y reduccion

En todos los prompts aplica este objetivo adicional:

1. Reducir codigo base neto cuando sea posible (menos duplicacion, menos helpers locales repetidos, menos ramas innecesarias).
2. Preferir extraccion y consolidacion sobre agregar nuevas capas si no aportan valor inmediato.
3. Evitar mover complejidad de sitio: cada PR debe dejar menos deuda estructural que la que encontro.
4. Excepcion permitida: se puede aumentar LOC solo si es para tests, contratos, o facades de compatibilidad temporal.
5. En el resumen final de cada PR, reportar delta aproximado: LOC eliminadas, LOC agregadas, y duplicaciones removidas.

## Prompt 0 - Setup de sesion (usar al inicio de cada bloque)

Copia y pega:

```text
Actua como ingeniero senior en TypeScript para este repositorio.
Objetivo: ejecutar SOLO el alcance que indico, sin cambios fuera de alcance.
Reglas obligatorias:
- No cambies APIs publicas salvo que lo pida explicitamente.
- No hagas refactors cosmeticos ni reformat global.
- Mantener compatibilidad hacia atras.
- Si detectas riesgo de regresion, prioriza tests antes de mover logica.
- Si aparece un cambio no relacionado en git, detente y reporta.
- Optimiza para reducir codigo total y duplicacion, no para crecer arquitectura sin necesidad.
Salida esperada:
1) Plan corto (3-6 pasos)
2) Lista de archivos a tocar (y por que)
3) Implementacion
4) Tests
5) Comandos de verificacion ejecutados y resultado
6) Riesgos remanentes
```

## Limpieza de sesion por prompt

Regla general:

1. Un prompt operativo = una sesion de trabajo.
2. Al cerrar PR de ese prompt, limpia sesion y abre una nueva para el siguiente.
3. Si Claude se desvia del alcance, limpia sesion de inmediato y reintenta con Prompt 0 + prompt objetivo.

Aplicacion concreta:

1. Prompt 0: usar al iniciar cada sesion nueva; no reemplaza la limpieza.
2. Prompt 1 (R0): limpiar al terminar PR de R0.
3. Prompt 2 (R2): limpiar al terminar PR de R2.
4. Prompt 3 (R1): limpiar al terminar PR de R1.
5. Prompt 4 (R3): limpiar al terminar PR de R3.
6. Prompt 5 (R15): limpiar al terminar PR de R15.
7. Prompt 6 (R4): limpiar al terminar PR de R4.
8. Prompt 7 (R5): limpiar al terminar PR de R5.
9. Prompt 8 (R13): limpiar al terminar PR de R13.
10. Prompt 9 (R6 templates): limpiar al terminar esa subfase.
11. Prompt 10 (R6 ADT): limpiar al terminar esa subfase.
12. Prompt 11 (R6 structures): limpiar al terminar esa subfase.
13. Prompt 12 (R11): limpiar al terminar PR de R11.
14. Prompt 13 (R10): limpiar al terminar PR de R10.
15. Prompt 14 (R7): limpiar al terminar PR de R7.
16. Prompt 15 (R8): limpiar al terminar PR de R8.
17. Prompt 16 (R9): limpiar al terminar PR de R9.
18. Prompt 17 (R12): limpiar al terminar PR de R12.
19. Prompt 18 (R14): limpiar al terminar PR de R14.
20. Prompt 19 (R16): limpiar al terminar PR de R16.
21. Prompt 20 (R17): limpiar al terminar PR de R17.
22. Prompt 21 (R18): limpiar al terminar PR de R18.
23. Prompt de revision de PR: usar sesion separada de review; limpiar al cerrar revision.
24. Prompt de hardening final: usar sesion separada; limpiar al terminar recomendacion go/no-go.

## Prompt 1 - R0 Contrato de salida CLI

```text
Implementa R0: contrato de salida CLI para JSON/NDJSON en modo compatible por defecto.
Contexto clave:
- Error envelope ya existe y debe mantenerse.
- Exito hoy sale como payload crudo; agregar modo estricto con envelope uniforme.
Objetivo funcional:
- Modo default: sin breaking changes.
- Modo estricto (flag): exito con { ok: true, ... } y error con { ok: false, error: { code, message, details? } }.
Alcance tecnico:
- Capa CLI/output solamente.
- No tocar logica de negocio de inventory/resource.
Entregables:
- Implementacion del flag estricto.
- Normalizacion centralizada para salida estructurada.
- Tests unitarios para json y ndjson en exito/error.
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- src/cli o tests relacionados de salida
- Reporta ejemplos reales de salida final para ambos modos.
```

## Prompt 2 - R2 Unificar guards y auth options

```text
Implementa R2: unificar utilidades de respuesta HTTP y auth options.
Objetivo:
- Consolidar expectJsonSuccess, ensureData y auth options en modulo shared.
Restricciones:
- Mantener comportamiento y codigos actuales.
- No mover aun a gateway completo.
- No cambiar firmas publicas existentes.
Alcance:
- Template sync
- ADT sync
- Structure utils
- Fragments ensure data
Entregables:
- Un solo modulo shared de guards
- Reemplazo de implementaciones duplicadas
- Tests unitarios para status 4xx/5xx y data null
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests/unit/liferay-resource-*.test.ts
```

## Prompt 3 - R1 Gateway base

```text
Implementa R1 fase 1: crear LiferayGateway base sin migracion masiva.
Objetivo:
- Centralizar token, headers, timeout, get/post/put json y form/multipart.
- Mantener DI para apiClient/tokenClient.
Restricciones:
- No migrar todo el repo en esta fase.
- Introducir facade compatible para adopcion incremental.
Entregables:
- Nuevo modulo gateway con metodos base.
- Tests de headers Authorization, timeout y propagacion de errores.
- Documentar via comentarios breves la estrategia de compatibilidad.
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests gateway nuevos
```

## Prompt 4 - R3 ResolveSite pipeline

```text
Implementa R3: refactor resolveSite a pipeline declarativo (chain of responsibility).
Objetivo:
- Mantener semantica actual exacta de fallback.
- Hacer pasos testeables por separado.
Pasos esperados:
1) by id headless-admin-site
2) by friendly-url headless-admin-site
3) by friendly-url headless-admin-user
4) paginado headless-admin-site
5) fallback JSONWS
Restricciones:
- Misma firma publica de resolveSite.
- Mismos codigos de error en no encontrado.
- Al tocar transporte HTTP en resolveSite, usar LiferayGateway en lugar de llamadas directas al apiClient.
Entregables:
- pipeline y steps desacoplados
- resolveSite como facade
- hooks simples de observabilidad (paso ganador)
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests de inventory/shared
```

## Prompt 5 - R15 Tests de resolveSite

```text
Implementa R15 como hardening de no-regresion para resolveSite.
Objetivo:
- Blindar semantica de fallback y semantica de errores (no solo happy-path).
Alcance minimo obligatorio:
1) Orden de resolucion estable:
- by id (headless-admin-site)
- by friendly-url (headless-admin-site)
- by friendly-url (headless-admin-user)
- paginacion (headless-admin-site)
- fallback JSONWS
2) Contrato de errores:
- 403/404 en discovery se tratan como miss y permiten continuar fallback.
- errores inesperados (500, auth/transporte, parsing invalido) se propagan; no se convierten en site-not-found.
- cuando todos los pasos devuelven miss, termina con LIFERAY_SITE_NOT_FOUND.
3) Observabilidad:
- validar hooks de paso ganador y paso con fallo.
Entregables:
- tests unitarios dirigidos en resolver + inventory.
- cobertura explicita de fallback JSONWS y de casos de error inesperado.
Restricciones:
- No acoplar tests a URL completa; usar stringContaining donde aplique.
- No relajar comportamiento para que pasen tests: ajustar tests y codigo al contrato esperado.
Verificacion:
- npm run test:unit -- tests/unit/liferay-site-resolver.test.ts tests/unit/liferay-inventory.test.ts
- npm run test:unit -- tests/unit/liferay-inventory-sites.test.ts
```

## Prompt 6 - R4 Matriz de capacidades/router

```text
Implementa R4: matriz declarativa operacion -> superficie primaria + fallbacks.
Objetivo:
- Sacar decisiones de transporte fuera de comandos concretos.
Alcance inicial:
- site.resolve
- inventory.listSites
- inventory.listTemplates
Entregables:
- capabilities.ts con tipos estrictos
- helper getOperationPolicy
- consumo inicial en 2-3 operaciones
- En las operaciones migradas, ejecutar transporte via LiferayGateway (sin romper compatibilidad publica).
- tests de consistencia de matriz
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit
```

## Prompt 7 - R5 Contratos Zod por superficie

```text
Implementa R5: contratos Zod por superficie + validacion opcional runtime.
Objetivo:
- Definir schemas para inventory/resource/fragments/structures.
- Mantener compatibilidad aditiva.
Dependencia funcional:
- Integrar con R0 (modo estricto)
Entregables:
- Archivos contract por superficie
- Tipos inferidos
- Tests de parse con muestras reales y tolerancia a campos opcionales
- Script verify:schema
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests de contracts
- npm run verify:schema
```

## Prompt 8 - R13 Fabrica de errores

```text
Implementa R13: fabrica de errores estable y sanitizada.
Objetivo:
- Unificar codigos de error de features Liferay.
- Evitar fuga de secretos en message/details.
Entregables:
- modulo de errores de dominio
- helpers tipados (siteNotFound, breakingChange, etc.)
- reemplazo progresivo en puntos criticos
- tests de invariantes de codigo
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests de errores y comandos json
```

## Prompt 9 - R6 SyncEngine (fase templates)

```text
Implementa R6 fase templates: crear SyncEngine generico y migrar solo template sync.
Objetivo:
- Extraer flujo comun sin cambiar API publica.
Flujo:
resolveSite -> resolveLocalArtifact -> readLocal -> findRemote -> upsert -> verifyRemote
Restricciones:
- No migrar ADT ni structures en este PR.
- Mantener hash verification actual.
- Si se modifica transporte HTTP del flujo de templates, enrutarlo por LiferayGateway.
Entregables:
- sync-engine.ts
- estrategia template conectada al engine
- tests existentes de template en verde + nuevos del engine
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests/unit/liferay-resource-sync-template.test.ts
```

## Prompt 10 - R6 SyncEngine (fase ADT)

```text
Implementa R6 fase ADT: migrar ADT sync al SyncEngine existente.
Objetivo:
- Reusar pipeline generico y mantener fallback a /global.
Restricciones:
- Sin cambios de comportamiento en createMissing/checkOnly.
Entregables:
- estrategia ADT en engine
- eliminar duplicacion local equivalente
- tests de ADT actualizados
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests/unit/liferay-resource-sync-adt.test.ts
```

## Prompt 11 - R6 SyncEngine (fase structures)

```text
Implementa R6 fase structures: adoptar SyncEngine donde sea razonable sin romper migracion existente.
Objetivo:
- Mantener logica de migration/diff intacta en esta fase.
Entregables:
- integracion parcial o completa al engine
- sin regresion en structure sync
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests/unit/liferay-resource-sync-structure.test.ts
```

## Prompt 12 - R11 Identificadores unificados

```text
Implementa R11: resolver id/key/name/erc de forma consistente.
Objetivo:
- helper unico de matching + precedencia explicita.
- eliminar dead code de matching deshabilitado.
Entregables:
- modulo identifiers.ts
- adopcion en template/adt/list templates donde aplique
- tests de colisiones y precedencia
Verificacion:
- npm run test:unit -- tests relacionados
```

## Prompt 13 - R10 Localized map tipada

```text
Implementa R10: localizedMap tipada con serializacion tardia.
Objetivo:
- trabajar con objeto tipado internamente.
- serializar solo en borde JSONWS.
Restricciones:
- mantener locales default actuales.
Entregables:
- helper makeLocalizedMap
- wrappers compatibles para llamadas existentes
- tests de salida serializada
Verificacion:
- npm run test:unit -- tests de sync template y adt
```

## Prompt 14 - R7 postFormCandidates shared

```text
Implementa R7: mover postFormCandidates a shared y reutilizarlo.
Objetivo:
- preservar orden de candidatos y acumulacion de errores.
Entregables:
- helper compartido
- uso en fragments y al menos un flujo adicional
- tests de primer candidato falla/segundo funciona
Verificacion:
- npm run test:unit -- tests/unit/liferay-resource-sync-fragments.test.ts
```

## Prompt 15 - R8 Modularizacion fragments

```text
Implementa R8: modularizar liferay-resource-sync-fragments sin romper API publica.
Objetivo:
- separar local, api, zip e importer.
Restricciones:
- mantener runLiferayResourceSyncFragments como facade.
- no cambiar flags ni formato de resultado.
Entregables:
- nuevos modulos por responsabilidad
- fichero facade delgado
- tests de regresion allSites/filter/candidates
Verificacion:
- npm run lint
- npm run typecheck
- npm run test:unit -- tests/unit/liferay-resource-sync-fragments.test.ts
```

## Prompt 16 - R9 Tipado minimo payloads

```text
Implementa R9: tipado minimo + parse tolerante de payloads legacy.
Objetivo:
- reducir Record<string, unknown> en rutas criticas.
- mantener compatibilidad con respuestas parciales.
Entregables:
- schemas internos minimos
- normalizadores tolerantes
- tests con payloads incompletos
Verificacion:
- npm run test:unit -- tests de resource shared + fragments
```

## Prompt 17 - R12 Cache de lookups

```text
Implementa R12: cache de lookups costosos con TTL y bypass.
Objetivo:
- cachear classNameId, resolveSite u otros lookups estables.
- soporte forceRefresh/bypass.
Restricciones:
- evitar stale cache severo; TTL corto por defecto.
Entregables:
- helper cacheado en gateway/shared
- adopcion en lookups clave
- tests hit/miss/invalidation
Verificacion:
- npm run test:unit -- tests de inventory/resource shared
```

## Prompt 18 - R14 API comun de artifact paths

```text
Implementa R14: resolver rutas de templates/structures/fragments con API comun.
Objetivo:
- evitar reglas divergentes con siteToken y fileOverride.
Entregables:
- artifact-paths.ts
- migracion de consumidores
- modo compat para rutas historicas
- tests de combinaciones de path
Verificacion:
- npm run test:unit -- tests de paths y sync
```

## Prompt 19 - R16 Tests contracts + candidates

```text
Implementa R16: tests de contratos Zod y postFormCandidates.
Objetivo:
- validar tolerancia y consistencia de schemas por superficie.
- validar estrategia de candidatos y errores.
Entregables:
- tests unitarios dedicados
- fixtures realistas
Verificacion:
- npm run test:unit -- tests nuevos
- npm run verify:schema
```

## Prompt 20 - R17 Docs generadas desde codigo

```text
Implementa R17: generar docs de capacidades/contratos desde codigo.
Objetivo:
- fuente unica para matriz de operaciones.
Entregables:
- script generate-liferay-capabilities
- doc de referencia generada
- comando docs:gen y chequeo en CI/docs
Verificacion:
- npm run docs:build
- npm run docs:check-links
- npm run docs:gen
```

## Prompt 21 - R18 Preflight de superficies

```text
Implementa R18: preflight opt-in de superficies API para modo automation.
Objetivo:
- reportar disponibilidad de adminSite/adminUser/jsonws y fallback esperado.
Restricciones:
- no ejecutar siempre; debe ser opt-in o cacheado.
Entregables:
- preflight.ts
- integracion por flag en comandos inventory/resource
- tests de escenarios 403/404
Verificacion:
- npm run test:unit -- tests de preflight
```

## Prompt de revision de PR (usar siempre)

```text
Haz una code review tecnica del diff actual con foco en:
1) regresiones funcionales
2) cambios de contrato JSON/NDJSON
3) manejo de errores y codigos
4) compatibilidad hacia atras
5) cobertura de tests
Entrega:
- Hallazgos ordenados por severidad
- Archivo y linea aproximada
- Riesgo si no se corrige
- Fix propuesto minimo
Si no hay hallazgos, dilo explicitamente y menciona riesgos remanentes.
```

## Prompt de hardening final

```text
Ejecuta hardening final del plan completado.
Objetivo:
- detectar deuda residual antes de release.
Checklist:
- Compatibilidad modo default intacta
- Modo estricto coherente en salida estructurada
- verify:schema integrado en CI
- tests criticos verdes (inventory/resource/fragments)
- docs sincronizadas con capabilities
Entrega:
1) Lista de riesgos abiertos
2) Lista de mejoras opcionales post-release
3) Recomendacion go/no-go para release
```

## Checklist corto para cada PR

- Alcance de R unico y claro
- Sin cambios fuera de alcance
- API publica compatible
- Tests nuevos y existentes en verde
- Diff pequeno
- Reduccion neta de complejidad o LOC (salvo excepcion justificada)
- Riesgos documentados
- Plan de rollback simple
