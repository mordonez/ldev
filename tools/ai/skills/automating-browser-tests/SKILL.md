---
name: automating-browser-tests
description: "Automating browser-based testing using Playwright. Use when you need to verify UI changes, capture visual evidence, reproduce frontend issues, or perform end-to-end functional checks in the Liferay portal."
allowed-tools: Bash(playwright-cli:*)
---

# Automating Browser Tests (QA Specialist)

This skill manages browser-based automation to ensure frontend reliability. It specializes in Liferay-specific patterns (Admin login, modal handling, asset verification).

Regla operativa:
- Usa `task playwright` como interfaz por defecto.
- **Excepciones permitidas**: `playwright-cli open` (para abrir sesión), `task playwright-ui` (para observar en escritorio) o perfiles persistentes de GitHub.
- **Comparación remota/producción**: SOLO si es pedida explícitamente por el usuario o como fase de contraste documentada tras la reproducción local. Evita usar Playwright remoto/MCP como camino normal de resolución.
- Si quieres ver el navegador en escritorio durante una prueba manual, usa `task playwright-ui`.

## Cuándo es el camino correcto

Usa esta skill no solo para QA visual, sino también para **mutaciones reales en el Liferay Page Editor** cuando el problema es de:

- layout/composition de una content page
- fragment instances mal colocadas, duplicadas o sobrantes
- configuración de widgets/fragmentos a nivel de página
- site building hecho en UI y no versionado como código fuente

En esos casos, `task playwright` es el camino canónico de escritura. No intentes inventar writes contra Headless Delivery solo porque `pageDefinition` sea legible.

## 🔄 The Automation Lifecycle (Mandatory)

### 1. Research & Analysis
- **Identify Target**: Locate the page or component that needs testing.
- **Consult Patterns**: Check `REFERENCE.md` for Liferay-specific login or modal selectors.

### 2. Strategy & Planning
- **Design Script**: Decide if a full `run-code` script is needed or if a simple `snapshot` is enough.
- **Define Pass Rate**: Determine what counts as a successful test (e.g., "Page contains text X", "Button is clickable").

### 3. Execution (Running)
- **Open Session**: Use `playwright-cli -s=<name> open` with repo config.
- **Perform Action**: Execute scripts using `run-code` or manual navigation.
- **Capture Evidence**: Take screenshots or snapshots for the PR.
- **Persist Evidence**: Save screenshots and browser artifacts under `.tmp/<issue-or-session>/` so validation is reproducible and easy to reference later.
- **Publish Evidence**: For visual/UI fixes, the final closeout must upload the key screenshot/video to GitHub as a native attachment in the PR or issue comment composer. Use GitHub's `Attach files` control or drag and drop the file into the comment box so GitHub inserts the anonymized asset URL. `.tmp/...` is staging, not the final reviewer-facing destination.
- **Escalate When Needed**: For flaky or hard-to-explain browser failures, prefer `tracing-start`/`tracing-stop` before spending time on guesswork. Use `video-start`/`video-stop` when a visual replay is more useful than a static screenshot.

### 4. Validation & Verification
- **Assertion**: Compare current state against the expected baseline.
- **Cleanup**: Close all sessions (`playwright-cli close-all`) after completion.

## Mutaciones de Page Editor en Liferay

Flujo obligatorio cuando la issue es de composición/configuración de página:

1. Descubre la página con:

```bash
task liferay -- inventory page --url <fullUrl>
```

2. Usa `adminUrls` del inventario como fuente de verdad:
- `Edit URL` para abrir el editor
- `Configure URL (...)` solo para settings de página, no para composición interna

3. Antes de tocar nada, exporta la estructura actual:

```bash
task liferay -- page-layout export --url <fullUrl>
```

4. Abre el `Edit URL` con `task playwright -- ... ensure-editor-session` o, si quieres verlo en escritorio, con `task playwright-ui`.

Flujo operativo recomendado con el wrapper del repo:

```bash
playwright-cli -s=runtime-<issue> open "<runtime-url>" --config=.playwright/cli.config.json

task playwright -- -s=page-editor-<issue> ensure-editor-session --url <pageUrl>
task playwright -- -s=page-editor-<issue> editor-state --url <pageUrl>
```

Reglas operativas:
- usa una sesión para runtime y otra distinta para editor
- no lances dos helpers contra la misma sesión a la vez
- si sale `reason: session-busy`, espera a que termine el helper anterior y repite
- bootstrap del editor con `ensure-editor-session`; es idempotente y deja la sesión lista en `p_l_mode=edit`
- para cambios frecuentes de site building, prefiere helpers atómicos frente a `run-code`

5. Haz el cambio en UI como lo haría un editor humano:
- borrar widgets/fragmentos sobrantes
- mover items dentro del árbol de estructura
- editar configuración de fragment instance/widget
- publicar la página

6. Verifica después con doble evidencia:
- captura visual con `task playwright` o `task playwright-ui` si quieres observarla en vivo
- `task liferay -- page-layout export|diff` si quieres confirmar cambio estructural

Secuencia mínima preferida:

```bash
task liferay -- inventory page --url <pageUrl>
task liferay -- page-layout export --url <pageUrl> > .tmp/<issue>/before.json
task playwright -- -s=runtime-<issue> runtime-check --url "<fullRuntimeUrl>" --artifacts-dir .tmp/<issue> --screenshot-name before.png
task playwright -- -s=page-editor-<issue> ensure-editor-session --url <pageUrl>
task playwright -- -s=page-editor-<issue> editor-hide-items --url <pageUrl> --name "<label1>" --name "<label2>"
task playwright -- -s=page-editor-<issue> editor-publish-and-verify --url <pageUrl> --verify-runtime-url "<fullRuntimeUrl>" --runtime-artifacts-dir .tmp/<issue> --runtime-screenshot-name after.png
task liferay -- page-layout export --url <pageUrl> > .tmp/<issue>/after.json
```

No aceptes una mutación solo porque “se ve mejor”. En páginas de búsqueda o agenda, valida al menos:
- un caso vacío o imposible
- y, si los datos del entorno lo permiten, un caso con resultados esperados

## Regla de seguridad

- Para incidencias de site building, **no** cierres la issue con un fix en tema JS/CSS si el problema real es una composición incorrecta de la content page y el Page Editor es accesible.
- `page-layout` es para inspección y comparación estructural, no para descubrir la página: empieza siempre por `inventory page`.
- No copies `layoutStructure.data_` de una página a otra como solución final: puede arrastrar referencias internas de instancia y dejar la página visualmente corrupta.

---

## Arranque rápido
...
```bash
playwright-cli open
playwright-cli goto https://playwright.dev
playwright-cli snapshot
playwright-cli close
```

## Bootstrap obligatorio

Antes de dedicar tiempo a depurar la herramienta:

1. Crea siempre un directorio de evidencias antes de ejecutar capturas:

```bash
mkdir -p .tmp/<issue-o-sesion>/
```

2. Si `playwright-cli` informa de que falta `chromium` y estás usando la config del repo (`.playwright/cli.config.json`), instala primero la copia de Playwright que cuelga del propio wrapper global:

```bash
node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium
```

Esto instala la revisión exacta que espera `playwright-cli`. En este repo es preferible a `npx playwright install chromium`, porque el wrapper puede ir desalineado de la versión/revisión que tenga `npx`.

3. Reintenta inmediatamente el comando original con la config del repo:

```bash
playwright-cli -s=<sesion> open "<url>" --config=.playwright/cli.config.json
```

4. No pierdas tiempo con `playwright-cli install-browser chromium` si entra en bucle o repite el mismo error de navegador no instalado. Con la combinación actual de wrapper/config (`channel: "chromium"`), esa ruta puede no recuperar el runtime aunque el mensaje la sugiera.

5. Si `playwright-cli` no existe en `PATH`, si la instalación embebida anterior no está disponible, o si el wrapper sigue fallando tras instalar su runtime, usa directamente `npx playwright ...` para capturas y validaciones simples.

6. Si el binario global falla pero quieres seguir usando la sintaxis de `playwright-cli`, prueba el wrapper efímero antes de desviarte:

```bash
npx playwright-cli open https://example.com
```

Si incluso así sigue fallando el bootstrap del wrapper, instala `chromium` para el runtime de `npx` y usa `npx playwright screenshot ...` como ruta principal para la validación de la issue:

```bash
npx playwright install chromium
```

## Publicación final en GitHub

Para cerrar una issue o dejar una PR lista para review:

1. Genera la evidencia en `.tmp/<issue-o-sesion>/`.
2. Sube el fichero final desde la interfaz web de GitHub en la caja de comentario de la PR o de la issue usando `Attach files` o arrastrando el archivo.
3. Verifica que GitHub ha insertado en el comentario la URL anonimizada del asset antes de publicar el comentario.
4. No añadas capturas o vídeos al repo para "hacerlas visibles" en GitHub. Eso introduce ruido en el codebase y no es un sustituto válido del attachment nativo.
5. Si no puedes subir el attachment nativo con las herramientas o la sesión disponible, no cierres la issue como resuelta. Deja la evidencia en `.tmp/...` como staging local y reporta el bloqueo.

## GitHub con 2FA

Para repos privados o cuentas con doble autenticación, no intentes automatizar el login web con usuario/contraseña en cada ejecución.

Flujo confirmado:

1. Crear o reutilizar un perfil persistente fuera del repo:

```bash
mkdir -p ~/.github-playwright-profile
```

En este repo, preferir el task ya preparado:

```bash
task dev:github-profile
```

Ese task usa el camino validado aquí:

```bash
playwright-cli -s=gh-profile open "https://github.com/login" \
  --persistent \
  --profile ~/.github-playwright-profile \
  --browser chrome \
  --headed
```

2. Bootstrap manual una vez para la sesión GitHub:

```bash
playwright-cli -s=gh-profile open "https://github.com/login" \
  --persistent \
  --profile ~/.github-playwright-profile \
  --browser chrome \
  --headed
```

Completa el login y el 2FA manualmente. A partir de ahí Playwright puede reutilizar esa sesión web. Si la sesión caduca, vuelve a ejecutar `task dev:github-profile` para refrescarla.

3. Abrir la PR/issue con `playwright-cli` usando ese perfil persistente:

```bash
playwright-cli -s=gh-attach open "https://github.com/<owner>/<repo>/pull/<num>" \
  --persistent \
  --profile ~/.github-playwright-profile \
  --browser chrome
```

4. Subir un fichero de `.tmp/...` al composer y extraer la URL `user-attachments`:

```bash
playwright-cli -s=gh-attach run-code 'async page => {
  const assetPath = "/abs/path/to/.tmp/evidence.png";
  const commentField = page.locator("textarea[name=\"comment[body]\"]").last();
  await commentField.scrollIntoViewIfNeeded();
  await commentField.click();
  await page.locator("input[type=file]").last().setInputFiles(assetPath);
  await page.waitForFunction(() => {
    const fields = Array.from(document.querySelectorAll("textarea[name=\"comment[body]\"]"));
    const value = fields.at(-1)?.value || "";
    return value.includes("https://github.com/user-attachments/assets/");
  }, { timeout: 120000 });
  const body = await commentField.inputValue();
  const match = body.match(/https:\/\/github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+/);
  if (!match) throw new Error("Attachment URL not found");
  return { attachmentUrl: match[0], commentBody: body };
}'
```

5. Publicar el comentario final con `gh api` o `gh pr comment` usando esa URL:

```bash
gh api repos/<owner>/<repo>/issues/<pr-or-issue-number>/comments \
  -f body='![evidence](https://github.com/user-attachments/assets/...)'
```

6. Cerrar la sesión cuando termines:

```bash
playwright-cli -s=gh-attach close
```

Notas verificadas:
- El fichero origen puede y debe salir de `.tmp/...`.
- El token de `gh` sirve para publicar el comentario por API, pero no sustituye la sesión web/cookies que necesita GitHub para el upload del attachment en navegador.
- En repos privados, la URL `user-attachments` puede devolver `404` sin autenticación directa. La verificación fiable es que GitHub la haya insertado en el textarea y que el comentario publicado la contenga/renderice en la PR o issue autenticada.

## Prerrequisito del repo

Ejecutar desde la raíz del repositorio para cargar `.playwright/cli.config.json`.

```bash
playwright-cli -s=portal-admin open "http://localhost:8080/c/portal/login" --config=.playwright/cli.config.json
```

Si aparece `Chromium distribution 'chrome' is not found`, abriste sin config del repo.
Si aparece `Browser "chromium" is not installed`, instala primero el runtime embebido del wrapper con `node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium` y reintenta el `open`.

## Flujo recomendado para Liferay admin

1. Limpiar sesiones si vienes de pruebas previas:
```bash
playwright-cli close-all || true
playwright-cli kill-all || true
```

2. Abrir login y autenticar:
```bash
playwright-cli -s=portal-admin open "http://localhost:8080/c/portal/login" --config=.playwright/cli.config.json
playwright-cli -s=portal-admin run-code 'async page => {
  await page.fill("#_com_liferay_login_web_portlet_LoginPortlet_login", "admin@liferay.local");
  await page.fill("#_com_liferay_login_web_portlet_LoginPortlet_password", "test");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null),
    page.click("button[type=submit]")
  ]);
}'
```

3. Si redirige a `license_activation`, resetear conexión:
```bash
playwright-cli -s=portal-admin run-code 'async page => {
  if (page.url().includes("/c/portal/license_activation")) {
    const reset = page.getByRole("link", { name: /here/i }).first();
    if (await reset.count()) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null),
        reset.click()
      ]);
    }
  }
}'
```

## Flujo recomendado para Liferay Page Editor

1. Descubrir `Edit URL`:

```bash
task liferay -- inventory page --url <fullUrl>
```

2. Abrir el editor con sesión semántica:

```bash
playwright-cli -s=page-editor open "<Edit URL>" --config=.playwright/cli.config.json
```

3. Si el draft está bloqueado, desbloquearlo antes de editar. Preferir una acción por texto/rol visible frente a selectores frágiles.

4. Antes de mutar, inspeccionar botones y labels visibles:

```bash
playwright-cli -s=page-editor snapshot
```

5. Ejecutar cambios pequeños y verificables con `run-code`:
- seleccionar item en el árbol de estructura
- abrir panel lateral de configuración
- borrar/reordenar/configurar
- publicar

6. Revalidar visualmente y cerrar sesión:

```bash
playwright-cli -s=page-editor screenshot --output=.tmp/<issue>/page-after.png
playwright-cli -s=page-editor close
```

## Patrones de verificación runtime

### Verificar ausencia de error tras acción UI

```bash
playwright-cli -s=runtime-check open "http://localhost:8080/ruta-afectada" --config=.playwright/cli.config.json
playwright-cli -s=runtime-check run-code 'async page => {
  // ejecutar acción del brief
}'
```

Luego revisar logs con `task env:logs SINCE=2m`.

### Evidencia visual (CSS/theme)

```bash
playwright-cli -s=runtime-check screenshot --output=artifacts/post-fix.png
```

Usar baseline/post-fix en el PR cuando aplique.

## Buenas prácticas

- Nombrar sesiones de forma semántica (`issue-mobile`, `portal-admin`, `checkout-trace`) y no con identificadores genéricos.
- Preferir navegación por clic tras login frente a deep-links encadenados.
- Mantener scripts `run-code` pequeños y deterministas.
- Usar `run-code` como escape hatch explícito para iframes, permisos, `storageState`, waits complejos o extracción estructurada de datos.
- Si falla por estado stale de sesión, resetear y reabrir.
- Si la incidencia es intermitente, capturar primero `tracing-start`/`tracing-stop`; usar vídeo cuando haga falta una replay visual para issue/PR.
- Para entornos worktree, usar `HTTP_HOST`/`HTTP_PORT` del `.env` del worktree (`task env:info`).
- Si falta `chromium` con la config del repo, instalarlo con `node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium` antes de degradar a fallback.
- Si `playwright-cli install-browser chromium` repite el mismo error, no insistir: esa ruta puede no recuperar el runtime en la combinación actual de wrapper/config.
- Si el wrapper `playwright-cli` falla o no está disponible, usa `npx playwright screenshot` o `npx playwright` como fallback inmediato en vez de bloquear la validación.
- Antes de publicar evidencia final, revisa que la captura o vídeo no contiene información sensible. GitHub sirve el asset mediante URL anonimizada.

## Nota Sobre Upstream

Este repo no adopta el skill upstream de `microsoft/playwright-cli` como skill principal.

Motivos:
- nuestro flujo necesita contexto específico de worktrees, puertos dinámicos y `.playwright/cli.config.json`;
- añadimos patrones propios de Liferay, login admin y rutas de evidencia en `.tmp/...`;
- el skill upstream se usa como referencia táctica para mejorar el nuestro, no como sustitución completa.

Prácticas upstream incorporadas aquí:
- sesiones nombradas y cleanup explícito;
- `run-code` como escape hatch para casos avanzados;
- `tracing` y `video` como herramientas de diagnóstico/evidencia.

Prácticas upstream no adoptadas por defecto:
- `test-generation`, porque aquí priorizamos validación quirúrgica de incidencias y no generar tests semiautomáticos durante la resolución;
- `request-mocking`, porque en este repo puede ocultar problemas reales de integración si se usa como atajo;
- `storage-state` como patrón base, porque puede introducir fugas de estado entre validaciones si no se gestiona con mucho cuidado.

## Referencias

- Patrones Liferay y diagnósticos: [REFERENCE.md](REFERENCE.md)
