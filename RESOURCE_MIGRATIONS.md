# Resource Migrations

Fuente de verdad para migraciones controladas de estructuras Journal con `ldev`.

## Objetivo

Una migración de estructura debe permitir:

- introducir campos nuevos sin romper contenidos existentes
- mover datos desde campos legacy a campos nuevos
- validar el resultado antes de borrar nada
- ejecutar una limpieza final cuando el nuevo modelo ya esté verificado

La CLI implementa esto con un descriptor único y dos fases internas:

- `introduce`: sincroniza dependencias, aplica la estructura puente cuando hace falta y migra datos al destino
- `cleanup`: limpia los campos origen marcados y deja la estructura final del repo

## Cuándo usarlo

Usa `migration-*` cuando el JSON final del repo elimina o recoloca campos y necesitas preservar datos existentes.

Casos típicos:

- mover datos de un campo legacy a otro nuevo
- mover datos a un campo dentro de un fieldset
- introducir una estructura final del repo que ya no contiene el campo antiguo

No hace falta descriptor si solo añades campos nuevos y no eliminas nada.

## Contrato del descriptor

Ejemplo mínimo:

```json
{
  "site": "/global",
  "structureKey": "BASIC-WEB-CONTENT",
  "templates": false,
  "dependentStructures": [
    "FIELDSET-NEW"
  ],
  "introduce": {
    "mappings": [
      {
        "source": "TextoLibre",
        "target": "Fieldset60763863[].TextNew",
        "cleanupSource": true
      }
    ]
  }
}
```

Semántica:

- `site`: site de la estructura principal
- `structureKey`: key de la estructura a migrar
- `templates`: `true` para sincronizar automáticamente templates asociados; `false` para no tocarlos
- `dependentStructures`: estructuras auxiliares que deben existir antes de la migración principal
  Caso típico: fieldsets compartidos
- `introduce.mappings[]`: reglas de migración de datos

Cada mapping:

- `source`: `fieldReference` origen
- `target`: `fieldReference` destino
- `cleanupSource`: si es `true`, el origen se limpiará en la segunda fase y desaparecerá de la estructura final

Sintaxis de destino:

- campo simple: `"newTitle"`
- campo dentro de fieldset: `"content[].newTitle"`

## Qué hace `cleanupSource`

`cleanupSource` no borra el origen durante `introduce`.

Comportamiento correcto:

1. `introduce`
   - mantiene el campo origen
   - migra datos al destino
   - no limpia el origen todavía
2. `cleanup`
   - limpia el origen solo en los contenidos realmente migrados
   - aplica la estructura final del repo, ya sin esos campos legacy

Esto permite usar una fase puente segura antes del cierre definitivo.

## Estructura puente y estructura final

Punto crítico: el fichero versionado en el repo es la estructura final.

Ejemplo:

- en runtime actual existe `TextoLibre`
- en repo ya has dejado solo `Fieldset60763863[].TextNew`

La CLI no debe importar directamente la estructura final antes de migrar datos, porque perderías la referencia al origen.

Por eso `migration-pipeline` hace internamente:

1. construir una estructura puente temporal
2. asegurar dependencias
3. migrar datos
4. solo en cleanup aplicar la estructura final del repo y retirar los campos legacy

## Generar el descriptor

Base:

```bash
ldev liferay resource migration-init --site /global --key BASIC-WEB-CONTENT --overwrite
```

Salida por defecto:

```text
liferay/resources/journal/migrations/<site>/<structureKey>.migration.json
```

`migration-init`:

- detecta `dependentStructures` a partir de fieldsets externos referenciados
- detecta `removedFieldReferences`
- propone `candidateTargetFieldReferences`
- no escribe `structureFile`
- no escribe `allowBreakingChange`

Después hay que revisar y editar `introduce.mappings`.

## Ejemplo real

Caso validado en entorno de pruebas:

- contenido: `33977`
- valor origen: `TextoLibre = "HelloWorld"`
- valor destino esperado: `Fieldset60763863[].TextNew = "HelloWorld"`

Mapping:

```json
{
  "source": "TextoLibre",
  "target": "Fieldset60763863[].TextNew",
  "cleanupSource": true
}
```

Tras `migration-pipeline --run-cleanup`:

- `TextNew` conserva `HelloWorld`
- `TextoLibre` desaparece del contenido
- `TextoLibre` desaparece de la estructura runtime

## Comandos

Validación puente:

```bash
ldev liferay resource migration-pipeline --migration-file liferay/resources/journal/migrations/global/BASIC-WEB-CONTENT.migration.json --check-only
```

Validación completa con cleanup:

```bash
ldev liferay resource migration-pipeline --migration-file liferay/resources/journal/migrations/global/BASIC-WEB-CONTENT.migration.json --check-only --run-cleanup
```

Ejecución de fase puente:

```bash
ldev liferay resource migration-pipeline --migration-file liferay/resources/journal/migrations/global/BASIC-WEB-CONTENT.migration.json
```

Ejecución completa:

```bash
ldev liferay resource migration-pipeline --migration-file liferay/resources/journal/migrations/global/BASIC-WEB-CONTENT.migration.json --run-cleanup
```

Si necesitas aislar una fase:

```bash
ldev liferay resource migration-run --migration-file liferay/resources/journal/migrations/global/BASIC-WEB-CONTENT.migration.json --stage introduce
ldev liferay resource migration-run --migration-file liferay/resources/journal/migrations/global/BASIC-WEB-CONTENT.migration.json --stage cleanup
```

## Flujo recomendado

### Entorno previo

1. Ajustar el JSON final de la estructura en el repo.
2. Generar o regenerar el descriptor con `migration-init`.
3. Editar `introduce.mappings`.
4. Ejecutar:

```bash
ldev liferay resource migration-pipeline --migration-file <descriptor> --check-only
ldev liferay resource migration-pipeline --migration-file <descriptor> --check-only --run-cleanup
```

### Producción prudente

1. Desplegar código y artefactos.
2. Ejecutar solo fase puente:

```bash
ldev liferay resource migration-pipeline --migration-file <descriptor>
```

3. Verificar funcionalmente:
   - render de contenidos
   - templates y display pages
   - valores en campos destino
   - que el origen legacy sigue presente mientras no cierres cleanup
4. Ejecutar cleanup final:

```bash
ldev liferay resource migration-pipeline --migration-file <descriptor> --run-cleanup
```

## Repetibilidad

La fase puente puede lanzarse varias veces:

```bash
ldev liferay resource migration-pipeline --migration-file <descriptor>
```

Eso es útil para:

- hacer despliegues prudentes
- verificar el estado antes del cleanup
- repetir la copia a destino si aún no quieres cerrar la migración

Después de `--run-cleanup`, la migración se considera cerrada:

- el origen ya no existe
- la estructura final ya está aplicada
- el descriptor queda como histórico, no como operación repetible

## Verificación recomendada

Para contenido web:

- usa `inventory page` sobre la display page del artículo
- o consulta el contenido estructurado directamente si necesitas más detalle

Ejemplo:

```bash
ldev liferay inventory page --url /web/guest/w/titulo --format json
```

Si necesitas ver el valor de un campo migrado:

- busca `articleProperties.contentFields` en display pages
- o `journalArticles[].contentFields` en páginas con Journal Content incrustado

Importante:

- `/web/<site>/<slug>` es una página normal
- `/web/<site>/w/<urlTitle>` es una display page de contenido

Si el artículo es `titulo`, `/web/guest/titulo` no es correcto; debe ser `/web/guest/w/titulo`.

## Qué no forma parte del descriptor

No forma parte del contrato de migración:

- `allowBreakingChange`
- un segundo `structureFile` de cleanup
- listas manuales de `cleanup.fields`

Si alguien quiere forzar un breaking change sin migración, eso debe hacerse explícitamente con los comandos de import/sync, no con `migration-*`.
