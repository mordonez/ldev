# Reindex JournalArticle: diagnostico avanzado

Usar este documento cuando el reindex global o por sitio se quede estancado, tarde mas de lo esperado o muestre datos inconsistentes entre BD y Elasticsearch.

## 1) Confirmar si existe tarea de reindex activa

```bash
cd docker
docker compose exec -T postgres psql -U ub -d ub -c \
"select backgroundtaskid,status,createdate,taskexecutorclassname \
 from backgroundtask \
 where lower(name)='reindex' \
 order by createdate desc limit 5;"
```

Interpretar `status` como criterio principal:
- `RUNNING`: tarea en curso.
- `SUCCESS`: finalizada.
- `FAILED`: revisar logs y causa raiz antes de reintentar.

## 2) Medir progreso real por sitio (groupId)

Comparar esperado en BD vs indexado en ES:

```bash
cd docker
# Esperado: articulos aprobados e indexables
docker compose exec -T postgres psql -U ub -d ub -t -A -c \
"select count(*) from journalarticle where groupid=2739584 and status=0 and indexable=true;"

# Indexado en ES para ese groupId
docker compose exec -T liferay bash -lc \
"curl -s -H 'Content-Type: application/json' -X POST \
 http://localhost:9201/liferay-20098/_count \
 -d '{\"query\":{\"bool\":{\"filter\":[
   {\"term\":{\"entryClassName\":\"com.liferay.journal.model.JournalArticle\"}},
   {\"term\":{\"groupId\":\"2739584\"}}
 ]}}}'"
```

Nota operativa:
- El delta `BD - ES` es orientativo.
- Puede llegar a `0` antes de que `backgroundtask` termine en `SUCCESS`.

## 3) Acelerar temporalmente indexacion (solo durante reindex)

Reducir coste de refresco ES:

```bash
cd docker
docker compose exec -T liferay bash -lc \
"curl -s -H 'Content-Type: application/json' -X PUT \
 http://localhost:9201/liferay-20098/_settings \
 -d '{\"index\":{\"refresh_interval\":\"-1\"}}'"
```

## 4) Restaurar configuracion de ES al terminar (obligatorio)

Restaurar `refresh_interval` y forzar refresh:

```bash
cd docker
docker compose exec -T liferay bash -lc \
"curl -s -H 'Content-Type: application/json' -X PUT \
 http://localhost:9201/liferay-20098/_settings \
 -d '{\"index\":{\"refresh_interval\":\"1s\"}}'"

docker compose exec -T liferay bash -lc \
"curl -s -X POST http://localhost:9201/liferay-20098/_refresh"
```

## 5) Buscar errores de parseo que bloquean indexacion

```bash
cd docker
docker compose logs liferay --since 2h 2>&1 | \
  grep -E "mapper_parsing_exception|failed to parse date field|JournalArticle_PORTLET"
```

Patron conocido:
- Valores invalidos en campos DDM de fecha (por ejemplo `ddmFieldValueKeyword_*_date`) pueden bloquear parte del reindex de `JournalArticle`.

## 6) Atajos del repositorio para seguimiento diario

```bash
task reindex:status
task reindex:watch
task reindex:speedup-on
task reindex:speedup-off
```

Detalles utiles:
- Sin opciones de grupo, `progress/watch` muestran estado global.
- Los campos resumidos (`faltan_estimados`, `reindex_running_tasks`, `desactivar_speedup`, `refresh_interval`) son los mas utiles para operacion.
- El comando `task reindex:status` muestra estado de indices.
