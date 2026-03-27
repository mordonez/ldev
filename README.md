# `ldev`

CLI oficial para desarrollo local de proyectos Liferay DXP.

`ldev` está pensada para:

- instalación simple
- arranque rápido
- comandos cortos y predecibles
- defaults razonables
- uso directo desde proyectos nuevos y existentes

## Instalación

Instalación global:

```bash
npm i -g ldev
ldev --help
```

Uso sin instalación global:

```bash
npx ldev --help
```

## Primer uso

Flujo mínimo en un proyecto ya preparado:

```bash
ldev doctor
ldev setup
ldev start
```

Si el proyecto usa DXP con licencia local:

```bash
ldev start --activation-key-file /ruta/activation-key-*.xml
```

`ldev` copiará la key a `liferay/configs/dockerenv/osgi/modules/`, sustituirá otras keys locales y no la versionará.

Formas namespaced equivalentes:

- `ldev env setup`
- `ldev env start`
- `ldev env stop`
- `ldev env status`
- `ldev env logs`
- `ldev env shell`

## Proyectos Nuevos

Crear un proyecto nuevo:

```bash
ldev project init --name mi-proyecto --dir ~/projects/mi-proyecto
cd ~/projects/mi-proyecto
ldev doctor
ldev setup
ldev start
```

`project init` genera el scaffold del proyecto listo para operar con `ldev`. No depende de un symlink a un repo vendor.

En hosts con IP fija de acceso local, puedes crear el proyecto con `BIND_IP` en el entorno para que `docker/.env` nazca ya configurado:

```bash
BIND_IP=100.115.222.80 ldev project init --name mi-proyecto --dir ~/projects/mi-proyecto
```

## Proyectos Existentes

Añadir `ldev` a un repo existente:

```bash
cd ~/projects/mi-proyecto
ldev project add --target .
ldev doctor
ldev setup
ldev start
```

Si el proyecto necesita también scaffold Docker/Liferay:

```bash
ldev project add-community --target .
```

## AI Bootstrap En Proyectos

Instalar la base reutilizable de agentes y skills gestionada por `ldev`:

```bash
ldev ai install --target .
```

Eso instala:

- `AGENTS.md` estándar
- skills reutilizables en `.agents/skills/`
- manifiesto vendor-managed para futuras actualizaciones

Si además quieres portar el overlay legacy del proyecto original como base para
customización local, aplícalo encima de la instalación estándar:

```bash
bash tools/ai/legacy/install.sh .
```

Usa ese overlay sólo para contexto y workflows específicos de un proyecto. La
superficie reusable y soportada por producto sigue siendo la que instala
`ldev ai install`.

## Desarrollo Local De `ldev`

Para modificar `ldev` en local y probarlo al instante en proyectos Liferay sin publicar versiones en npm:

```bash
git clone git@github.com:mordonez/ldev.git
cd ldev
npm install
npm link
npm run build:watch
```

Con eso, cualquier proyecto Liferay de tu máquina puede usar el binario global enlazado:

```bash
cd ~/projects/mi-proyecto
ldev start
ldev doctor
ldev liferay inventory sites
```

Cada cambio recompilado en `ldev` queda disponible al momento. No hace falta publicar, versionar ni reinstalar el paquete.

## Empaquetado npm

El paquete queda preparado para:

- `npm i -g ldev`
- `npx ldev ...`
- binario `ldev`
- publicación limpia desde `dist/` y assets necesarios de scaffold

Scripts principales:

```bash
npm run build
npm run build:watch
npm run test
npm run typecheck
npm run check
```

## Modelo de comandos

`ldev` separa la CLI por intención, no por cantidad de comandos:

- `Core commands`: `doctor`, `setup`, `start`, `stop`, `status`, `logs`, `shell`
- `Workspace commands`: `project`, `worktree`
- `Runtime commands`: `env`, `db`, `deploy`, `osgi`
- `Liferay commands`: `liferay`

La idea es que el flujo diario viva en top-level y que los namespaces se usen sólo cuando necesitas una tarea explícita de workspace, runtime o scripting contra Liferay.

## Automation Contract v1

`ldev` expone un contrato estable para automatización. La superficie mínima soportada en v1 es:

- `ldev doctor --json`
- `ldev context --json`
- `ldev status --json`
- `ldev setup`
- `ldev start`
- `ldev stop`
- `ldev logs --no-follow`
- `ldev shell`
- `ldev liferay ... --json`

Reglas del contrato:

- Los comandos que declaran salida estructurada deben soportar `--json`.
- `--json` y `--ndjson` son alias directos de `--format json` y `--format ndjson`.
- Los errores en modo JSON salen por `stderr` con `{ ok: false, error: { code, message, details? } }`.
- En v1, `ok` siempre está presente en la salida JSON.
- En v1, el bloque `error` siempre usa la forma `{ code, message, details? }`.
- En v1, el contrato JSON es additive-only: se pueden añadir claves nuevas, pero no quitar ni renombrar claves existentes sin subir la versión del contrato.
- `context` es la entrada canónica para descubrir repo, paths, URL, worktree y config Liferay resuelta.
- `context` incluye también qué áreas del CLI están realmente disponibles en el contexto actual.

## Notas

- La configuración efectiva mantiene `.liferay-cli.yml` como archivo de proyecto.
- El módulo OAuth2 local sigue usando la app técnica `liferay-cli` por compatibilidad con el runtime actual.
- La referencia operativa de migraciones de resources está en [RESOURCE_MIGRATIONS.md](/home/mordonez/projects/ldev/RESOURCE_MIGRATIONS.md).
