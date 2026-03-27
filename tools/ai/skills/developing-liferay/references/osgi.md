---
name: overriding-liferay-core
description: "Extender y sobreescribir comportamiento del core de Liferay DXP con puntos de extension seguros (lifecycle events, model listeners, service wrappers, dynamic includes, filtros, overrides OSGi, localizacion y fragments/JSP hooks), incluyendo extraccion de codigo fuente desde bundles desplegados. Usar cuando un requisito necesite integrarse con logica core o reemplazar parcialmente comportamiento nativo."
---

# Sobrescritura del core de Liferay

No clonar el repositorio de Liferay. Extraer recursos desde el contenedor en ejecucion.
Preferir siempre el punto de extension menos invasivo.
Usar sobrescritura completa de JSP/recurso solo como ultima opcion.

Para detalles y snippets completos, cargar:
- [extending-liferay.md](extending-liferay.md)

Para flujos de page fragments (sin sobrescritura de core), usar:
- `developing-page-fragments`

## Comandos base

```bash
# Localizar JAR de un bundle desplegado
cd docker && docker compose exec liferay find /opt/liferay/osgi /opt/liferay/tomcat/webapps -name "com.liferay.journal.web*.jar" | head -1

# Listar contenido del JAR
cd docker && docker compose exec liferay jar tf /opt/liferay/osgi/portal/com.liferay.journal.web-<version>.jar

# Extraer un recurso concreto del JAR al host
cd docker && docker compose exec -T liferay jar xf /opt/liferay/osgi/portal/com.liferay.journal.web-<version>.jar META-INF/resources/view.jsp && \
  docker compose cp liferay:/opt/liferay/META-INF/resources/view.jsp /tmp/view.jsp

task deploy:module -- <module-name>
task osgi:status -- <bundle-symbolic-name>
task osgi:diag -- <bundle-symbolic-name>
task env:logs SINCE=2m
```

## Elegir punto de extension (orden recomendado)

1. `OSGi Config` cuando el comportamiento ya es configurable.
2. `Localization` cuando solo cambian textos/traducciones.
3. `DynamicInclude` para inyeccion UI sin copiar JSP completa.
4. `ModelListener` para reaccionar a eventos de entidad.
5. `ServiceWrapper` para extender llamadas de servicio existentes.
6. `PortletFilter` o `Servlet Filter` para interceptar flujo web.
7. `OSGi service override` solo si wrapper/listener/filter no cubren el requisito.
8. `OSGi Fragment` o `JSP Hook` solo cuando no exista punto de extension valido.

## Matriz rapida

| Patron | Cuando usar | Como |
|---|---|---|
| Lifecycle event (`ModuleServiceLifecycle`) | Ejecutar startup despues de hito del portal | `@Reference(target = ModuleServiceLifecycle.PORTAL_INITIALIZED)` |
| Model Listener | Reaccionar a create/update/remove | `BaseModelListener<T>` + DS component |
| Service Wrapper | Extender una llamada de servicio | `@Component(service = ServiceWrapper.class)` |
| Dynamic Include | Inyectar UI en punto conocido de JSP | `DynamicInclude` + include key |
| Portlet Filter | Interceptar render/action/resource/event | `javax.portlet.*` properties |
| Servlet Filter | Interceptar HTTP por URL/contexto | OSGi `Filter` + `url-pattern` |
| OSGi service override | Reemplazar servicio core | `service.ranking` mayor + target estricto |
| OSGi Fragment | Sobrescribir recurso/JSP sin punto de extension | `Fragment-Host` + copiar solo archivo modificado |
| JSP Hook | Sobrescritura legacy | `CustomJspBag` (ultima opcion) |
| ADT | Personalizar rendering soportado | ADT FreeMarker en portal |

## Flujo minimo

1. Confirmar requisito y elegir el punto de extension menos invasivo.
2. Extraer fuente/clave desde bundle desplegado (ver comandos base) antes de codificar.
3. Implementar el cambio minimo en un modulo aislado.
4. Desplegar y verificar bundle (`task deploy:module`, `task osgi:status`).
5. Validar comportamiento en runtime y revisar logs (`task env:logs SINCE=2m`).
6. Documentar riesgos de upgrade (clave include, rango `Fragment-Host`, orden de filtros).

## Playbooks frecuentes

### Inyectar UI sin copiar JSP
- Usar `DynamicInclude`.
- Extraer primero la JSP para localizar include key real.
- Mantener cambio aditivo y reversible.

### Extender logica de servicio existente
- Usar `ServiceWrapper` antes de sobrescritura completa OSGi.
- Mantener pre/post logica acotada y determinista.

### Reemplazar JSP/recurso core
- Usar `OSGi Fragment` como primera opcion de sobrescritura dura.
- Copiar solo el recurso modificado, no arboles completos.
- Revisar compatibilidad de `Fragment-Host` tras cada upgrade DXP.

## Reglas de seguridad

- No duplicar JSP completas salvo ausencia real de extension point.
- No parchear codigo core directamente dentro del contenedor.
- Evitar filtros globales con `url-pattern` amplio sin necesidad.
- Mantener overrides pequenos y aislados para reducir riesgo en upgrades.
- Revalidar en upgrades: `Fragment-Host`, include keys y `service.ranking`.
