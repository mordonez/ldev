# Playwright CLI — Referencia Liferay

Esta referencia consolida patrones reutilizables para portales Liferay y diagnósticos comunes.

Regla práctica:
- `task playwright` es la interfaz por defecto.
- `playwright-cli` raw queda para `open`, perfiles persistentes y casos excepcionales.
- Para una sesión visible en escritorio, usa `task playwright-ui SESSION=<name> URL=<url>`.

## Content Page Editor: estrategia recomendada

Para issues de site building, la mutación debe hacerse en el **Page Editor** y no en el tema global.

Flujo recomendado:

1. Obtener `Edit URL` desde:

```bash
task liferay -- inventory page --url <fullUrl>
```

2. Abrir exactamente esa URL con `task playwright -- ... ensure-editor-session` o `task playwright-ui` si quieres verlo en vivo.
3. Desbloquear draft si el editor lo exige.
4. Operar sobre estructura/configuración de la página.
5. Publicar.
6. Capturar screenshot y, si hace falta, comparar con `task liferay -- page-layout export|diff`.

Regla práctica:
- `page-layout export/diff` sirve para inspección y comparación estructural tras `inventory page`.
- No usar copia bruta de `layoutStructure.data_` entre páginas distintas como solución final.

## 🔐 Login y Sesión (admin local)

```bash
playwright-cli -s=portal-admin open "http://localhost:8080/c/portal/login" --config=.playwright/cli.config.json

playwright-cli -s=portal-admin run-code 'async page => {
  await page.goto("http://localhost:8080/c/portal/login", { waitUntil: "domcontentloaded" });
  await page.fill("#_com_liferay_login_web_portlet_LoginPortlet_login", "admin@liferay.local");
  await page.fill("#_com_liferay_login_web_portlet_LoginPortlet_password", "test");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null),
    page.click("button[type=submit]")
  ]);
  return { url: page.url(), signedIn: await page.evaluate(() => window.Liferay?.ThemeDisplay?.isSignedIn()) };
}'
```

## ✏️ Abrir Page Editor y desbloquear draft

```bash
playwright-cli -s=page-editor open "<Edit URL>" --config=.playwright/cli.config.json

playwright-cli -s=page-editor run-code 'async page => {
  const unlock = page.getByRole("link", { name: /here|aquí|aqui/i }).first();
  if (await unlock.count()) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
      unlock.click()
    ]);
  }
  return { url: page.url(), title: await page.title() };
}'
```

Si no aparece enlace de desbloqueo, inspeccionar primero el DOM visible con `snapshot` y no asumir un selector.

## 🧱 Page Editor: mutaciones típicas

### Borrar un item sobrante

Patrón:
- localizar el item por texto visible o por su posición en el árbol de estructura
- seleccionarlo
- usar la acción visible `Delete`/`Eliminar`
- confirmar modal si aparece

### Reordenar estructura

Patrón:
- abrir el panel de estructura
- mover el item por drag/drop solo si Playwright lo resuelve de forma estable
- si drag/drop no es fiable, preferir acciones visibles del editor antes que coordenadas mágicas

### Configurar un fragment/widget

Patrón:
- seleccionar la instancia
- abrir panel lateral derecho
- modificar campos visibles por label/role
- guardar/publicar

## 📌 Publicación

Después de mutar composición/configuración:

```bash
playwright-cli -s=page-editor run-code 'async page => {
  const publish = page.getByRole("button", { name: /publish|publica|publicar/i }).first();
  if (await publish.count()) {
    await publish.click();
    await page.waitForTimeout(3000);
  }
}'
```

Si el label cambia según locale, inspecciona primero los botones visibles con `snapshot` y ajusta por texto real.

## 🔍 Diagnóstico CSS y Spacing

Usa **bounding rects** para medir el gap visual real entre elementos (evita problemas de margin-collapse en la medición).

```bash
playwright-cli -s=portal-admin run-code 'async page => await page.evaluate((sel) => {
  const items = Array.from(document.querySelectorAll(sel));
  return items.slice(0, 5).map((el, i, arr) => {
    const r = el.getBoundingClientRect();
    const prev = i > 0 ? arr[i-1].getBoundingClientRect() : null;
    const s = getComputedStyle(el);
    return {
      text: el.textContent.trim().substring(0, 20),
      gap: prev ? Math.round(r.top - prev.bottom) : 0,
      marginTop: s.marginTop,
      height: Math.round(r.height)
    };
  });
}, ".category-container")'
```

## 🖼️ Iconos SVG y Asset Publisher

### Verificar existencia de iconos en el sprite
```bash
# ¿El sprite del tema tiene el icono?
curl -s http://localhost:8080/o/<theme-name>/images/clay/icons.svg | grep "id=\"NOMBRE-ICONO\""
```

### Acceder a configuración de portlet (Modal)
```bash
playwright-cli -s=portal-admin run-code 'async page => {
  // 1. Obtener instanceId (ej. AssetPublisher)
  const html = await page.content();
  const inst = (html.match(/AssetPublisherPortlet_INSTANCE_([a-zA-Z0-9]+)/) || [])[1];
  if (!inst) return "instance not found";

  // 2. Abrir modal vía Liferay JS
  const sitePath = "/group/<site-friendly-url>";
  const url = `${sitePath}/~/control_panel/manage?p_p_id=com_liferay_portlet_configuration_web_portlet_PortletConfigurationPortlet&p_p_lifecycle=0&p_p_state=pop_up&_com_liferay_portlet_configuration_web_portlet_PortletConfigurationPortlet_mvcPath=%2Fedit_configuration.jsp&_com_liferay_portlet_configuration_web_portlet_PortletConfigurationPortlet_portletResource=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_${inst}`;

  await page.evaluate((u) => Liferay.Portlet.openModal({ title: "Config", url: u }), url);
  await page.waitForTimeout(3000);

  // 3. Acceder al frame del modal
  const frame = page.frames().find(f => f.url().includes("PortletConfigurationPortlet"));
  return { frameUrl: frame?.url() };
}'
```

## 🔄 Regresiones Comunes

### Toggle/Collapse behavior
```bash
playwright-cli -s=interaction-check run-code "async page => {
  const node = page.locator('a[data-toggle=\"liferay-collapse\"], [aria-controls]').first();
  const targetId = await node.getAttribute('aria-controls');
  const target = page.locator(`#${targetId}`);
  const before = await target.getAttribute('class');
  await node.click();
  await page.waitForTimeout(500);
  const after = await target.getAttribute('class');
  return { before, after };
}"
```

## 🧭 Trazas y Vídeo

### Trace para fallos intermitentes o debugging profundo
```bash
mkdir -p .tmp/<issue-o-sesion>/
playwright-cli tracing-start
# reproducir incidencia
playwright-cli tracing-stop .tmp/<issue-o-sesion>/trace.zip
```

### Vídeo para replay visual
```bash
mkdir -p .tmp/<issue-o-sesion>/
playwright-cli video-start
# reproducir flujo
playwright-cli video-stop .tmp/<issue-o-sesion>/session.webm
```

## 🛠 Pitfalls
- **Worktrees**: Siempre usar la URL con el puerto real del worktree (`task env:info`).
- **Contexto**: Ejecutar desde la raíz del repo para que cargue `.playwright/cli.config.json`.
- **Limpieza**: Si hay errores de sesión, `playwright-cli close-all` y reautenticar.
- **Evidencia**: Guardar capturas en `.tmp/<issue-o-sesion>/` y reutilizar esa ruta en issue/PR/final.
- **Falta `chromium` en `playwright-cli`**: Instalar primero la revisión embebida del wrapper con `node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium`.
- **`install-browser` puede no recuperar el runtime**: Si `playwright-cli install-browser chromium` repite el error, no insistir; reintentar `open` tras la instalación embebida o pasar a `npx playwright`.
- **Fallback rápido**: Si `playwright-cli` no está disponible o se encalla, usar `npx playwright ...` y `npx playwright install chromium`.
- **No parchear tema por comodidad**: Si el problema es layout/composición de una content page y el editor está accesible, no resolverlo con JS/CSS global salvo que demuestres que la causa raíz está en frontend compartido.
- **No clonar páginas por copia bruta de estructura**: Dos páginas distintas pueden compartir apariencia pero no las mismas referencias internas de instancia.
