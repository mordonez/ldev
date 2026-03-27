---
name: liferay-expert
description: "Usar cuando se va a realizar cualquier tarea técnica sobre la plataforma Liferay DXP: desarrollo, despliegue o diagnóstico. Actúa como router de dominio y delega a la skill especialista. No sustituye a issue-engineering (lifecycle de issues), ni a developing-liferay, deploying-liferay o troubleshooting-liferay."
---

# Liferay Expert — Router de Dominio Técnico

Este skill es el punto de entrada para tareas técnicas Liferay. Identifica el
dominio afectado y activa la skill correcta. No contiene playbooks propios.

**Importante:**
- Para resolver issues de GitHub (worktree, PR, lifecycle), el entrypoint es
  `/issue-engineering`, no este skill.
- Este skill no sustituye a `developing-liferay`, `deploying-liferay` ni
  `troubleshooting-liferay`. Los orquesta.

## Regla de entrada

Usa este skill cuando el usuario trae una incidencia o tarea técnica Liferay y
todavía no está claro si el problema es de desarrollo, deploy o diagnóstico.

No lo uses cuando:
- ya existe una issue o ticket que hay que llevar end-to-end: `issue-engineering`
- la causa raíz ya está clara y toca cambiar artefactos: `developing-liferay`
- el cambio ya está hecho y solo queda compilar, desplegar o verificar: `deploying-liferay`
- el problema es una migración DDM con contenido publicado: `migrating-journal-structures`

---

## Árbol de decisión

**¿Cuál es el foco principal de la tarea?**

**0. ¿Hay issue, ticket, PR o lifecycle de trabajo?**
Si el prompt habla de resolver una issue, preparar una PR, crear worktree,
seguir una DoD, hacer cleanup o completar un ciclo end-to-end.
→ salir de este skill y activar `issue-engineering`

**1. ¿La causa raíz aún no está clara?**
Hay un error funcional, una regresión visual, lentitud, un click que falla,
un formulario que no envía o un comportamiento extraño sin diagnóstico sólido.
→ activar `troubleshooting-liferay`

**2. Cambiar código o contenido**
Hay que modificar SCSS, FTL, estructuras DDM, templates, fragments, módulos
OSGi, o trabajar en el Page Editor.
→ activar `developing-liferay`

**3. Compilar, desplegar o verificar runtime**
El cambio ya está hecho. El foco es construir el artefacto, hot-deployer,
o confirmar que un bundle está `Active` y el portal refleja el cambio.
→ activar `deploying-liferay`

**4. Migración de estructuras Journal con riesgo de pérdida de datos**
El cambio implica modificar una estructura DDM con contenido publicado,
eliminar campos, o hacer una migración masiva de artículos.
→ activar `migrating-journal-structures`

Si la tarea mezcla diagnóstico, desarrollo y deploy:
- empezar por `troubleshooting-liferay` si la causa raíz no es clara
- empezar por `developing-liferay` si ya sabes qué artefacto cambiar
- usar `deploying-liferay` solo cuando el cambio ya existe y toca validar runtime

## Ejemplos de routing

| Prompt típico | Skill a activar |
|---|---|
| "Tengo un error al hacer click en el formulario de envío X" | `troubleshooting-liferay` |
| "La home tarda mucho en cargar" | `troubleshooting-liferay` |
| "El bundle com.acme.foo está en Installed" | `troubleshooting-liferay` |
| "Quiero cambiar el spacing del bloque de noticias" | `developing-liferay` |
| "Ya he cambiado el módulo, quiero desplegar y verificar" | `deploying-liferay` |
| "Hay que migrar una estructura Journal y preservar datos" | `migrating-journal-structures` |

---

## Flujo canónico orientativo

Todo trabajo Liferay sigue esta secuencia. Los comandos concretos dependen
del artefacto; la skill especialista tiene los detalles.

**Discover** — entender qué hay antes de tocar nada

Según el caso: `inventory page`, `inventory structures`, `resource resolve-adt`,
`env:info`. Si hay una URL afectada, `inventory page` es siempre el primer paso.

**Change** — cambio mínimo necesario sobre el artefacto identificado

**Deploy** — el más pequeño posible según el artefacto

`deploy:module` para OSGi, `deploy:theme` para tema,
o discovery read-only con `task liferay -- ...` cuando no exista mutación soportada por la CLI estable.

**Verify** — siempre, sin excepción

`osgi:status` si aplica, `env:logs SINCE=2m`, validación en runtime real
en la URL/puerto del worktree activo reportado por `task env:info`.

---

## Guardrails transversales

Estas reglas aplican en los tres dominios. Las skills especializadas las
desarrollan; aquí están consolidadas como contrato común.

**Entorno primero**
Si cualquier comando falla con `java.net.ConnectException`, verificar con
`task env:info` y arrancar con `task env:start` antes de depurar nada más.

**Deploy mínimo**
Nunca usar `deploy:all` o bulk cuando es posible hacer un deploy acotado.
El deploy más pequeño posible reduce el riesgo y acelera el ciclo.

**Verificar ACTIVE tras deploy**
No asumir que un deploy ha funcionado. Siempre `task osgi:status` +
`task env:logs` tras cualquier despliegue de módulo.

**No bulk sync en resources versionados**
`dev-cli` no expone todavía syncs ni pipelines mutantes estables para structures,
templates, ADTs o fragments. No improvisar esos writes por API. Si se necesita
un flujo mutante, documentarlo y tratarlo como workflow separado del producto actual.

---

## Referencias por dominio

**`developing-liferay`**
Activar cuando: cambios de código, FTL, SCSS, DDM, fragments, Page Editor.
No cubre: diagnóstico de fallos de runtime, compilación autónoma.
Referencias: `developing-liferay/references/` (theme, structures, fragments, osgi, breaking-changes)

**`deploying-liferay`**
Activar cuando: compilar, hot-deploy, verificar bundle `Active` o ejecutar validación runtime tras cambios ya hechos.
No cubre: decisión de qué cambiar, diagnóstico de causa raíz.
Referencias: `deploying-liferay/references/worktree-pitfalls.md`

**`troubleshooting-liferay`**
Activar cuando: portal caído, bundle `Installed`, regresión, FTL error, reindex,
problema sin causa raíz clara o degradación de rendimiento.
No cubre: implementación del fix, deploy del artefacto corregido. Cuando el
diagnóstico identifica el cambio necesario, derivar a la skill especialista.
Referencias: `troubleshooting-liferay/references/` (ddm-migration, reindex-journal)

**`migrating-journal-structures`**
Activar cuando: cambio de estructura DDM con contenido publicado o migración masiva. Tratarlo hoy como playbook de análisis/ejecución manual, no como flujo automatizado del `dev-cli`.
No cubre: desarrollo general ni despliegues de módulo.
