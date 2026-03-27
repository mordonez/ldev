# Reindex tras importar de cero: runbook quirurgico

Usar este documento justo despues de importar una BD limpia, cuando el portal ya
esta arrancado y hay que dejar la busqueda indexando de verdad.

## Objetivo

Lanzar el reindex global correctamente, seguirlo con dos señales fiables
(`backgroundtask` + crecimiento en Elasticsearch) y cerrar el speedup al final.

## 1) Preconditions

El portal debe estar sano antes de tocar nada:

```bash
task env:info
```

Senal de exito:
- `Portal: HEALTHY`

## 2) Acelerar Elasticsearch durante el reindex

```bash
task reindex:speedup-on
```

Senal de exito:
- `Reindex speedup ON (refresh_interval=-1)`

## 3) Lanzar el reindex global desde Search Admin

Ruta en UI:

1. Login en `http://127.0.0.1:8080/c/portal/login`
2. `Menú d'aplicacions`
3. `Tauler de control`
4. `Configuració`
5. `Cerca`
6. `Indexa les accions`
7. `Global > Tots els índexs de cerca > Reindexa`
8. Confirmar modal con `Executa`

**Importante**:
- Pulsar `Reindexa` no basta.
- Hasta pulsar `Executa` no se crea el `backgroundtask`.

## 4) Confirmar que el reindex ha arrancado de verdad

```bash
task reindex:tasks
task reindex:watch
```

Senales de exito:
- aparece un `RUNNING` con `com.liferay.portal.search.internal.background.task.ReindexPortalBackgroundTaskExecutor`
- el indice `liferay-20098` empieza a crecer desde `0`

Si `task reindex:watch` muestra `0` constante y no aparece un `RUNNING`, el
reindex no se ha lanzado realmente: volver a la UI y confirmar el modal.

## 5) Validar que no se ha roto por errores de parseo

```bash
cd docker
docker compose logs liferay --since 2h 2>&1 | \
  grep -E "mapper_parsing_exception|failed to parse date field|JournalArticle_PORTLET"
```

Interpretacion:
- sin salida: no hay evidencia de bloqueo por parseo
- con salida: el reindex puede terminar incompleto aunque siga corriendo

## 6) Validar esperado en BD vs indexado en ES

Global `JournalArticle` aprobado e indexable en BD:

```bash
cd docker
docker compose exec -T postgres psql -U ub -d ub -P pager=off -c \
"select count(*) as journal_approved_indexable
 from journalarticle
 where status=0 and indexable=true;"
```

Indexado en Elasticsearch para `JournalArticle`:

```bash
curl -s -H 'Content-Type: application/json' -X POST \
  'http://127.0.0.1:9200/liferay-20098/_count' \
  -d '{"query":{"bool":{"filter":[{"term":{"entryClassName.keyword":"com.liferay.journal.model.JournalArticle"}}]}}}'
```

Nota:
- durante la reindexacion el count de ES puede ir muy por detras
- comparar al final, no a mitad del proceso

## 7) Cerrar correctamente

Cuando `task reindex:tasks` deje de mostrar el reindex global en `RUNNING`:

```bash
task reindex:speedup-off
```

Senal de exito:
- `Reindex speedup OFF (refresh_interval=1s + refresh)`

## 8) Diferencias esperables con produccion

En este repo local y en `prd` esta desactivado el indexado de contenido binario
de Document Library:

```properties
dl.file.indexing.max.size=0
```

Eso no explica por si solo que falten `JournalArticle`. Si faltan contenidos web,
el check canónico es siempre:

1. `backgroundtask` real creado y finalizado
2. sin errores de parseo en logs
3. delta BD vs ES al final

## Comandos minimos

```bash
task env:info
task reindex:speedup-on
task reindex:tasks
task reindex:watch
task reindex:speedup-off
```
