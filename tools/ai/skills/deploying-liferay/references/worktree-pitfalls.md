# Problemas frecuentes de worktree - Liferay DXP local

Problemas conocidos al usar worktrees de git para aislar issues.

## Error: "Exporting an empty package"

### Síntoma
```
error  : Exporting an empty package 'com.acme.quota.configuration'
error  : Exporting an empty package 'com.acme.quota.util'
```
Ocurre SOLO en worktrees (clones frescos), nunca en el workspace principal.

### Causa raíz
`liferay/.gitignore` excluye `**/*-api/src/main/java`, que incluye tanto los paquetes
**generados** por `buildService` como los paquetes **manuales** escritos a mano.

Los paquetes manuales (no generados) necesitan negaciones explícitas en `.gitignore`.

Ejemplo realista de módulo afectado:

| Módulo | Paquetes manuales frecuentes |
|---|---|
| `quota-control-api` | `configuration/`, `util/`, `wrapper/` |
| `customer-directory-api` | `constants/`, `exception/`, `dto/` |
| `news-service-api` | `helper/`, partes de `model/` o `service/` no generadas |

### Corrección correcta
Añadir negaciones específicas en `liferay/.gitignore` para los paquetes manuales:
```gitignore
!**/quota-control-api/src/main/java/com/acme/quota/configuration/
!**/quota-control-api/src/main/java/com/acme/quota/util/
!**/quota-control-api/src/main/java/com/acme/quota/wrapper/
```

Patrón reusable:
- Negar solo los directorios manuales.
- No negar árboles completos del `*-api`.
- Revisar especialmente módulos Service Builder híbridos: mezclan código generado y clases manuales.

### Lo que NO funciona
- Añadir `clean` al target de preparación — no resuelve nada, solo ralentiza
- Negaciones amplias `!**/<module>-api/**` — trackea ficheros generados innecesariamente

### Check rápido
```bash
git check-ignore -v liferay/modules/quota-control/quota-control-api/src/main/java/com/acme/quota/configuration/QuotaConfiguration.java
find liferay/modules -path '*-api/src/main/java/*' -type f | rg '/(configuration|util|wrapper|constants|exception)/'
```

---

## Error: `-Xmx4g: command not found`

### Síntoma
```
docker/.env: line 23: -Xmx4g: command not found
```

### Causa
`LIFERAY_JVM_OPTS` en `.env` sin comillas. Docker Compose requiere comillas
cuando el valor contiene espacios o flags con `-`.

### Corrección
```bash
# INCORRECTO:
LIFERAY_JVM_OPTS=-Xms4g -Xmx4g -XX:+UseG1GC

# CORRECTO:
LIFERAY_JVM_OPTS="-Xms4g -Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -Djava.net.preferIPv4Stack=true"
```

---

## Error: CSS/JS apuntan a puerto 8080 en worktree alternativo

### Síntoma
En un worktree con puerto diferente (ej. 8133), los recursos CSS/JS se cargan desde
`http://localhost:8080/o/<theme>/css/...` → 404 y página sin estilos.

### Causa
Si el worktree no genera `portal-ext.local.properties`, Liferay seguirá usando
el `web.server.http.port` base y construirá URLs absolutas incorrectas.

### Corrección
El flujo `task worktree:new` / `task env:start` debe generar
`liferay/configs/dockerenv/portal-ext.local.properties` con el puerto real:
```bash
printf "web.server.http.port=%s\n" "${HTTP_PORT}" \
  > "$PROJECT_ROOT/liferay/configs/dockerenv/portal-ext.local.properties"
```

### Señales secundarias habituales
- `inventory page` responde, pero la página queda sin estilos.
- `curl -I http://localhost:8080/o/<theme>/css/main.css` devuelve `404` mientras el worktree expone otro puerto.
- HTML correcto, assets rotos por host/puerto absoluto.

---

## Recomendaciones generales para worktrees

- **JVM mínimo**: `-Xms4g -Xmx4g` (con menos, arranque lento y riesgo de OOM)
- **Verificar siempre** `.env` tiene `LIFERAY_JVM_OPTS` entre comillas dobles
- El setup del worktree debe generar `portal-ext.local.properties` con el puerto real del worktree
- Los worktrees son clones frescos: no tienen ficheros de `.gitignore` disponibles
- Si algo “solo falla en worktree”, comparar primero `.env`, `portal-ext.local.properties` y `git check-ignore` antes de depurar lógica de negocio

---

## Comportamiento esperado del cache de prepare

### Síntoma
`task worktree:new` tarda varios minutos en cada ejecución y siempre vuelve a
pasar por el prepare completo.

### Causa
La primera ejecución de un commit nuevo debe poblar
`MAIN_ROOT/.worktree-build-cache/<commit>`. Solo a partir de la segunda
ejecución del mismo commit se puede reutilizar `liferay/build/docker`.

### Check rápido
```bash
git rev-parse HEAD
find ../.worktree-build-cache -maxdepth 1 -mindepth 1 -type d | tail
```

### Señal de éxito
En la segunda vuelta del mismo commit, el smoke/setup debe mostrar:
```text
[INFO] [2/3] Preparando artefactos build/docker
[INFO] Reutilizando artefactos preparados desde caché/raíz compartida
```

### Si no ocurre
- comprobar que existe `.prepared-from-commit` dentro de la caché del commit
- comprobar que `liferay/build/docker/configs/dockerenv/portal-ext.properties` y `deploy/` están completos
