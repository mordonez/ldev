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

Atajos top-level:

- `ldev setup` -> `ldev env setup`
- `ldev start` -> `ldev env start`
- `ldev stop` -> `ldev env stop`
- `ldev status` -> `ldev env status`
- `ldev logs` -> `ldev env logs`
- `ldev shell` -> `ldev env shell`

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

## Namespaces

- `project`: scaffold e integración en proyectos
- `env`: ciclo de vida Docker local
- `worktree`: worktrees y runtimes aislados
- `db`: backups LCP, import local y doclib
- `deploy`: build y deploy local
- `osgi`: runtime diagnostics y Gogo Shell
- `reindex`: observación y tuning temporal
- `ai`: assets y skills AI
- `liferay`: discovery y operaciones Liferay
- `doctor`: prerequisites y config efectiva

## Notas

- La configuración efectiva mantiene `.liferay-cli.yml` como archivo de proyecto.
- El módulo OAuth2 local sigue usando la app técnica `liferay-cli` por compatibilidad con el runtime actual.
- La referencia operativa de migraciones de resources está en [RESOURCE_MIGRATIONS.md](/home/mordonez/projects/ldev/RESOURCE_MIGRATIONS.md).
- La siguiente fase debe reducir los assets heredados y mover `project init/add` hacia generación explícita de los ficheros mínimos del entorno. Queda anotado en [ROADMAP.md](/home/mordonez/projects/ldev/ROADMAP.md).
