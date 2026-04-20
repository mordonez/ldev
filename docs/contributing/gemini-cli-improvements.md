# Mejoras inspiradas en Gemini CLI

Análisis comparativo entre [Gemini CLI](https://github.com/google-gemini/gemini-cli) y ldev.
Cada item es independiente y puede resolverse de forma incremental.

---

## Índice

- [P1 — Alta prioridad](#p1--alta-prioridad)
  - [1. Cleanup handlers y signal management](#1-cleanup-handlers-y-signal-management)
  - [2. Jerarquía de errores con exit codes semánticos](#2-jerarquía-de-errores-con-exit-codes-semánticos)
- [P2 — Media prioridad](#p2--media-prioridad)
  - [3. MSW para mocks de API en tests de integración](#3-msw-para-mocks-de-api-en-tests-de-integración)
  - [4. Configuración multi-nivel (user settings)](#4-configuración-multi-nivel-user-settings)
  - [5. Doctor con auto-fix](#5-doctor-con-auto-fix)
- [P3 — Baja prioridad](#p3--baja-prioridad)
  - [6. Lazy loading de comandos](#6-lazy-loading-de-comandos)
  - [7. Versionado de config y migration path](#7-versionado-de-config-y-migration-path)
  - [8. Release channel @next](#8-release-channel-next)
- [P4 — Mejoras de DX](#p4--mejoras-de-dx)
  - [9. ESLint import/order](#9-eslint-importorder)
  - [10. Audit de outputs JSON estructurados](#10-audit-de-outputs-json-estructurados)

---

## P1 — Alta prioridad

### 1. Cleanup handlers y signal management

**Estado:** [ ] Pendiente

**Problema actual:**
Cuando `ldev env start` o cualquier operación larga se interrumpe con `Ctrl+C`, no hay garantía de que los recursos se liberen correctamente (procesos docker huérfanos, archivos temporales, conexiones abiertas).

**Referencia en Gemini CLI:**
`packages/cli/src/utils/cleanup.ts`

**Qué implementar:**

Crear `src/core/cleanup.ts` con un registro centralizado de cleanup handlers:

```typescript
// src/core/cleanup.ts
type CleanupFn = () => Promise<void> | void;

const handlers: CleanupFn[] = [];
let isRunning = false;

export function registerCleanup(fn: CleanupFn): void {
  handlers.push(fn);
}

export async function runCleanup(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  await Promise.allSettled(handlers.map((fn) => fn()));
}

export function setupSignalHandlers(): void {
  const handle = async (signal: string) => {
    process.stderr.write(`\nReceived ${signal}, cleaning up...\n`);
    await runCleanup();
    process.exit(signal === 'SIGINT' ? 130 : 1);
  };

  process.on('SIGINT', () => handle('SIGINT'));
  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGHUP', () => handle('SIGHUP'));
}
```

Registrar en `src/index.ts` antes de ejecutar comandos:

```typescript
import { setupSignalHandlers } from './core/cleanup.js';
setupSignalHandlers();
```

Usar en los adapters de runtime:

```typescript
// src/core/runtime/ldev-native-runtime-adapter.ts
import { registerCleanup } from '../cleanup.js';

export class LdevNativeRuntimeAdapter implements RuntimeAdapter {
  async start(options) {
    const proc = await docker.composeUp(options);
    registerCleanup(async () => {
      if (proc.isRunning()) await proc.stop();
    });
  }
}
```

**Archivos a modificar:**
- Crear: `src/core/cleanup.ts`
- Modificar: `src/index.ts`
- Modificar: `src/core/runtime/ldev-native-runtime-adapter.ts`
- Modificar: `src/core/runtime/blade-workspace-runtime-adapter.ts`

**Tests:**
- `tests/unit/core/cleanup.test.ts` — verificar que los handlers se ejecutan en orden y se llaman ante SIGINT

---

### 2. Jerarquía de errores con exit codes semánticos

**Estado:** [ ] Pendiente

**Problema actual:**
`CliError` es genérico. Todos los errores salen con el mismo código de salida, dificultando el scripting (`if ldev env start; then ...`) y el debugging en CI.

**Referencia en Gemini CLI:**
`packages/core/src/utils/errors.ts`

**Exit codes a adoptar:**

| Código | Clase | Situación |
|--------|-------|-----------|
| 0 | — | Éxito |
| 1 | `CliError` | Error genérico |
| 2 | `UsageError` | Argumentos incorrectos |
| 41 | `AuthError` | OAuth/credenciales inválidas |
| 42 | `ConfigError` | `.liferay-cli.yml` inválido o no encontrado |
| 43 | `RuntimeError` | Docker/Gradle no disponible o falla al arrancar |
| 44 | `NetworkError` | Liferay no responde, timeout de conexión |
| 130 | — | Cancelación por usuario (SIGINT) |

**Qué implementar:**

Extender `src/cli/errors.ts`:

```typescript
// src/cli/errors.ts

export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number = 1,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class UsageError extends CliError {
  constructor(message: string, details?: unknown) {
    super('USAGE_ERROR', message, 2, details);
    this.name = 'UsageError';
  }
}

export class AuthError extends CliError {
  constructor(message: string, details?: unknown) {
    super('AUTH_ERROR', message, 41, details);
    this.name = 'AuthError';
  }
}

export class ConfigError extends CliError {
  constructor(message: string, details?: unknown) {
    super('CONFIG_ERROR', message, 42, details);
    this.name = 'ConfigError';
  }
}

export class RuntimeError extends CliError {
  constructor(message: string, details?: unknown) {
    super('RUNTIME_ERROR', message, 43, details);
    this.name = 'RuntimeError';
  }
}

export class NetworkError extends CliError {
  constructor(message: string, details?: unknown) {
    super('NETWORK_ERROR', message, 44, details);
    this.name = 'NetworkError';
  }
}
```

Actualizar los lanzadores de errores en features para usar la subclase correcta:

```typescript
// src/features/env/env.service.ts — antes
throw new CliError('DOCKER_NOT_FOUND', 'Docker is not running');

// después
throw new RuntimeError('Docker is not running or not found in PATH');
```

**Archivos a modificar:**
- Modificar: `src/cli/errors.ts`
- Modificar: `src/features/env/*.ts` — usar `RuntimeError`
- Modificar: `src/features/oauth/*.ts` — usar `AuthError`
- Modificar: `src/core/config/project-context.ts` — usar `ConfigError`
- Modificar: `src/core/http/client.ts` — usar `NetworkError`

**Tests:**
- `tests/unit/cli/errors.test.ts` — verificar exit codes por tipo

---

## P2 — Media prioridad

### 3. MSW para mocks de API en tests de integración

**Estado:** [ ] Pendiente

**Problema actual:**
Los tests de integración que involucran llamadas a la API de Liferay requieren un portal real o no están cubiertos. No hay mock sistemático del `LiferayApiClient`.

**Referencia en Gemini CLI:**
Usa `msw@2.x` para interceptar `fetch`/`https` a nivel de proceso sin modificar código de producción.

**Qué implementar:**

Instalar MSW:

```bash
npm install --save-dev msw
```

Crear handlers base en `src/testing/`:

```typescript
// src/testing/msw-handlers.ts
import { http, HttpResponse } from 'msw';

export const liferayHandlers = [
  http.get('*/o/portal-security-auth-verifier/auth/token', () =>
    HttpResponse.json({ access_token: 'mock-token', expires_in: 3600 }),
  ),

  http.get('*/api/jsonws/journal.journalarticle/get-articles', () =>
    HttpResponse.json({ items: [], totalCount: 0 }),
  ),

  http.post('*/o/headless-delivery/v1.0/sites/:siteId/structured-contents', () =>
    HttpResponse.json({ id: 1, title: 'Mock Article' }, { status: 201 }),
  ),
];
```

Configurar server en tests de integración:

```typescript
// tests/integration/setup.ts
import { setupServer } from 'msw/node';
import { liferayHandlers } from '../../src/testing/msw-handlers.js';

export const server = setupServer(...liferayHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Usar en tests:

```typescript
// tests/integration/features/reindex.test.ts
import { server } from '../setup.js';
import { http, HttpResponse } from 'msw';

test('reindex handles 503 with retry', async () => {
  server.use(
    http.post('*/o/portal/search/reindex', () =>
      HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
    ),
  );
  // ...
});
```

**Archivos a crear/modificar:**
- Crear: `src/testing/msw-handlers.ts`
- Crear: `tests/integration/setup.ts`
- Modificar: `vitest.integration.config.ts` — añadir `setupFiles`
- Modificar: `package.json` — añadir `msw` en devDependencies

**Tests beneficiados:**
- `tests/integration/` — todos los que llamen a `LiferayApiClient`

---

### 4. Configuración multi-nivel (user settings)

**Estado:** [ ] Pendiente

**Problema actual:**
No existe un lugar para que el usuario defina preferencias globales (timeout por defecto, formato de output, URL de portal habitual). Todo se configura por proyecto en `.liferay-cli.yml`.

**Referencia en Gemini CLI:**
Merge de 3 niveles: system → user → workspace. Las claves de workspace sobreescriben al usuario.

**Qué implementar:**

Estructura de archivos de config:

```
~/.ldev/settings.yml        ← preferencias del usuario
./.liferay-cli.yml          ← config del proyecto (ya existe)
./.liferay-cli.local.yml    ← overrides locales (ya existe, git-ignored)
```

Schema Zod para user settings:

```typescript
// src/core/config/user-settings.ts
import { z } from 'zod';

export const UserSettingsSchema = z.object({
  version: z.literal(1).default(1),
  output: z
    .object({
      format: z.enum(['text', 'json', 'ndjson']).default('text'),
      color: z.boolean().default(true),
    })
    .optional(),
  http: z
    .object({
      timeout: z.number().int().min(1000).default(30000),
      retries: z.number().int().min(0).max(5).default(3),
    })
    .optional(),
  editor: z.string().optional(), // Para comandos que abren un editor
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

export async function loadUserSettings(): Promise<UserSettings> {
  const settingsPath = path.join(os.homedir(), '.ldev', 'settings.yml');
  if (!await fs.pathExists(settingsPath)) return UserSettingsSchema.parse({});
  const raw = yaml.parse(await fs.readFile(settingsPath, 'utf8'));
  return UserSettingsSchema.parse(raw);
}
```

Merge en el config builder:

```typescript
// src/core/config/config-builder.ts
const userSettings = await loadUserSettings();
const workspaceConfig = await loadWorkspaceConfig(cwd);

// workspaceConfig tiene prioridad sobre userSettings
const merged = deepMerge(userSettings, workspaceConfig);
```

**Archivos a crear/modificar:**
- Crear: `src/core/config/user-settings.ts`
- Modificar: `src/core/config/config-builder.ts`
- Modificar: `src/core/config/schema.ts` — incluir merged config type

**Tests:**
- `tests/unit/core/config/user-settings.test.ts`

---

### 5. Doctor con auto-fix

**Estado:** [ ] Pendiente

**Problema actual:**
`ldev doctor` identifica problemas pero el usuario debe resolverlos manualmente. Muchos de los fixes son mecánicos (crear archivo, instalar dependencia, añadir variable).

**Referencia en Gemini CLI:**
Cada check puede incluir un `fix()` async opcional. El CLI ofrece `--fix` para ejecutarlos.

**Qué implementar:**

Extender el tipo `DoctorCheck`:

```typescript
// src/features/doctor/types.ts

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  hint?: string;
  // NUEVO: función de auto-reparación opcional
  fix?: {
    description: string;
    run: () => Promise<void>;
  };
}
```

Añadir opción `--fix` al comando:

```typescript
// src/commands/doctor/doctor.command.ts
createDoctorCommand()
  .option('--fix', 'Attempt to auto-fix detected issues')
  .action(async (options, context) => {
    const report = await runDoctor(context.cwd, { config: context.config });

    if (options.fix) {
      const fixable = report.checks.filter(
        (c) => c.status === 'fail' && c.fix,
      );
      for (const check of fixable) {
        context.printer.info(`Fixing: ${check.fix!.description}`);
        await check.fix!.run();
      }
    }
    // render report...
  });
```

Ejemplo de check con auto-fix:

```typescript
// src/features/doctor/checks/liferay-cli-yml.check.ts
export async function checkLiferayCLIConfig(cwd: string): Promise<DoctorCheck> {
  const configPath = path.join(cwd, '.liferay-cli.yml');
  const exists = await fs.pathExists(configPath);

  return {
    id: 'liferay-cli-yml',
    name: '.liferay-cli.yml present',
    status: exists ? 'pass' : 'fail',
    message: exists
      ? 'Config file found'
      : 'Missing .liferay-cli.yml in project root',
    hint: 'Run `ldev doctor --fix` or `ldev project init`',
    fix: exists
      ? undefined
      : {
          description: 'Create .liferay-cli.yml from template',
          run: async () => {
            await fs.copy(
              path.join(TEMPLATES_DIR, 'liferay-cli.yml.template'),
              configPath,
            );
          },
        },
  };
}
```

**Archivos a modificar:**
- Modificar: `src/features/doctor/types.ts` — añadir campo `fix`
- Modificar: `src/commands/doctor/doctor.command.ts` — añadir `--fix`
- Modificar: `src/features/doctor/checks/*.ts` — añadir `fix` donde aplique
- Modificar: `src/features/doctor/doctor.service.ts` — exportar checks fixables

**Checks candidatos para auto-fix:**
- `.liferay-cli.yml` no encontrado → crear desde template
- `.env` no encontrado → copiar desde `.env.example`
- Docker no corriendo → `docker info` hint
- Puerto ocupado → identificar proceso con `lsof`

---

## P3 — Baja prioridad

### 6. Lazy loading de comandos

**Estado:** [ ] Pendiente

**Problema actual:**
Todos los módulos de comandos se importan estáticamente en `command-groups.ts`. Con 21 grupos de comandos, el tiempo de arranque de `ldev --help` crece con cada feature añadida.

**Referencia en Gemini CLI:**
`deferred.ts` — envuelve cada `CommandModule` en un dynamic import. El módulo solo se carga cuando se ejecuta ese comando específico.

**Qué implementar:**

Crear helper de lazy loading en Commander:

```typescript
// src/cli/lazy-command.ts
import type { Command } from 'commander';

type CommandFactory = () => Promise<{ default: (parent: Command) => Command }>;

/**
 * Registra un comando de forma lazy. El módulo solo se importa
 * cuando el usuario ejecuta ese subcomando específico.
 */
export function lazyCommand(
  parent: Command,
  name: string,
  description: string,
  loader: CommandFactory,
): void {
  parent
    .command(name, { hidden: false })
    .description(description)
    .allowUnknownOption()
    .action(async (_options, cmd) => {
      const { default: buildCommand } = await loader();
      const real = buildCommand(parent);
      // Re-parse args contra el comando real cargado
      real.parse(process.argv);
    });
}
```

Usar en `command-groups.ts` para comandos pesados:

```typescript
// src/cli/command-groups.ts — antes
import { createDeployCommand } from '../commands/deploy/deploy.command.js';
program.addCommand(createDeployCommand());

// después
lazyCommand(
  program,
  'deploy',
  'Deploy modules, themes or services',
  () => import('../commands/deploy/deploy.command.js'),
);
```

**Comandos candidatos (por peso de imports):**
- `deploy` — usa execa + file watching
- `worktree` — usa simple-git + btrfs
- `db` — usa JSZip + HTTP streaming
- `osgi` — usa SSH/gogo shell

**Archivos a crear/modificar:**
- Crear: `src/cli/lazy-command.ts`
- Modificar: `src/cli/command-groups.ts` — migrar comandos pesados

**Medición:**
Medir con `time ldev --help` antes y después para confirmar mejora.

---

### 7. Versionado de config y migration path

**Estado:** [ ] Pendiente

**Problema actual:**
`.liferay-cli.yml` no tiene campo `version`. Si el schema cambia entre versiones de ldev, la config antigua falla silenciosamente o con errores crípticos de Zod.

**Referencia en Gemini CLI:**
`settings-validation.ts` — valida settings contra JSON schema con mensajes de error amigables. `migratedTo` en extensions para deprecation.

**Qué implementar:**

Añadir `version` al schema:

```typescript
// src/core/config/schema.ts
export const AppConfigSchema = z.object({
  version: z.number().int().min(1).default(1),
  // ... resto del schema
});
```

Sistema de migrations:

```typescript
// src/core/config/migrations.ts
type Migration = {
  from: number;
  to: number;
  description: string;
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
};

const migrations: Migration[] = [
  {
    from: 1,
    to: 2,
    description: 'Rename liferayUrl to portal.url',
    migrate: (config) => {
      if (config['liferayUrl']) {
        config['portal'] = { url: config['liferayUrl'] };
        delete config['liferayUrl'];
      }
      return config;
    },
  },
];

export function migrateConfig(
  raw: Record<string, unknown>,
  targetVersion: number,
): Record<string, unknown> {
  let current = raw;
  let version = (current['version'] as number) ?? 1;

  while (version < targetVersion) {
    const migration = migrations.find((m) => m.from === version);
    if (!migration) break;
    current = migration.migrate(current);
    current['version'] = migration.to;
    version = migration.to;
  }

  return current;
}
```

Integrar en el config loader con aviso al usuario:

```typescript
// src/core/config/project-context.ts
const rawConfig = yaml.parse(await fs.readFile(configPath, 'utf8'));
const CURRENT_VERSION = 2;

if ((rawConfig.version ?? 1) < CURRENT_VERSION) {
  printer.warn(
    `Config version ${rawConfig.version ?? 1} is outdated. ` +
    `Run \`ldev config migrate\` to update to v${CURRENT_VERSION}.`
  );
}

const migrated = migrateConfig(rawConfig, CURRENT_VERSION);
const config = AppConfigSchema.parse(migrated);
```

**Archivos a crear/modificar:**
- Crear: `src/core/config/migrations.ts`
- Modificar: `src/core/config/schema.ts` — añadir `version`
- Modificar: `src/core/config/project-context.ts` — aplicar migrations
- Crear (opcional): `src/commands/config/config-migrate.command.ts`

**Tests:**
- `tests/unit/core/config/migrations.test.ts` — cada migration individualmente

---

### 8. Release channel @next

**Estado:** [ ] Pendiente

**Problema actual:**
El flujo actual es: commit → Release Please → tag → publish `@latest`. No hay forma de probar builds de `main` sin instalar desde el código fuente.

**Referencia en Gemini CLI:**
Tres canales: `nightly`, `preview`, `stable`. Permite adopción gradual.

**Qué implementar:**

Añadir workflow de publish a `@next` en cada merge a `main`:

```yaml
# .github/workflows/publish-next.yml
name: Publish @next

on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      - name: Set prerelease version
        run: |
          SHA=$(git rev-parse --short HEAD)
          DATE=$(date +%Y%m%d)
          npm version "0.0.0-next.${DATE}.${SHA}" --no-git-tag-version

      - run: npm run build

      - run: npm publish --tag next --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Uso por los consumidores:

```bash
# Instalar versión estable
npm install -g @mordonezdev/ldev

# Instalar build de main (puede tener breaking changes)
npm install -g @mordonezdev/ldev@next
```

**Archivos a crear:**
- Crear: `.github/workflows/publish-next.yml`

---

## P4 — Mejoras de DX

### 9. ESLint import/order

**Estado:** [ ] Pendiente

**Problema actual:**
Los imports no tienen un orden consistente, mezclando Node built-ins, dependencias externas e imports locales. Genera noise en PRs y dificulta lectura.

**Referencia en Gemini CLI:**
`eslint-plugin-import` con regla `import/order` y grupos definidos.

**Qué implementar:**

Instalar plugin:

```bash
npm install --save-dev eslint-plugin-import
```

Añadir regla en `eslint.config.js`:

```javascript
// eslint.config.js
import importPlugin from 'eslint-plugin-import';

export default [
  // ...configs existentes
  {
    plugins: { import: importPlugin },
    rules: {
      'import/order': [
        'error',
        {
          groups: [
            'builtin',      // node:fs, node:path
            'external',     // commander, zod, execa
            'internal',     // src/core/...
            'parent',       // ../utils
            'sibling',      // ./helpers
            'index',        // ./
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/newline-after-import': 'error',
    },
  },
];
```

**Archivos a modificar:**
- Modificar: `eslint.config.js`
- Modificar: `package.json` — añadir `eslint-plugin-import`

**Nota:** Ejecutar `npm run lint:fix` tras añadir la regla para auto-corregir todos los archivos existentes en un solo commit.

---

### 10. Audit de outputs JSON estructurados

**Estado:** [ ] Pendiente

**Problema actual:**
No todos los comandos tienen schemas Zod definidos para su output JSON. El flag `--json` existe pero los schemas no están documentados ni validados en tests.

**Referencia en Gemini CLI:**
`nonInteractiveCli.ts` — emite NDJSON con tipos estrictos para cada event type. Permite que herramientas externas (scripts, CI) consuman el output de forma fiable.

**Qué implementar:**

Definir y exportar el schema de output de cada comando:

```typescript
// src/commands/doctor/doctor.output.ts
import { z } from 'zod';

export const DoctorCheckOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['pass', 'warn', 'fail', 'skip']),
  message: z.string(),
  hint: z.string().optional(),
});

export const DoctorOutputSchema = z.object({
  checks: z.array(DoctorCheckOutputSchema),
  summary: z.object({
    pass: z.number(),
    warn: z.number(),
    fail: z.number(),
  }),
});

export type DoctorOutput = z.infer<typeof DoctorOutputSchema>;
```

Validar en tests que el output JSON cumple el schema:

```typescript
// tests/unit/commands/doctor.test.ts
import { DoctorOutputSchema } from '../../../src/commands/doctor/doctor.output.js';

test('doctor --json output matches schema', async () => {
  const result = await runCLI(['doctor', '--json']);
  const parsed = JSON.parse(result.stdout);
  expect(() => DoctorOutputSchema.parse(parsed)).not.toThrow();
});
```

**Comandos a auditar (por orden de uso):**
- [ ] `doctor`
- [ ] `env status`
- [ ] `env logs`
- [ ] `liferay inventory`
- [ ] `worktree list`
- [ ] `db list`
- [ ] `osgi list`
- [ ] `deploy`

**Archivos a crear por comando:**
- `src/commands/{cmd}/{cmd}.output.ts` — schema Zod de output
- `tests/unit/commands/{cmd}.output.test.ts` — validación del schema

---

## Progreso

| # | Item | Prioridad | Estado |
|---|------|-----------|--------|
| 1 | Cleanup handlers y signal management | P1 | [ ] Pendiente |
| 2 | Jerarquía de errores con exit codes | P1 | [ ] Pendiente |
| 3 | MSW para mocks de API | P2 | [ ] Pendiente |
| 4 | Configuración multi-nivel | P2 | [ ] Pendiente |
| 5 | Doctor con auto-fix | P2 | [ ] Pendiente |
| 6 | Lazy loading de comandos | P3 | [ ] Pendiente |
| 7 | Versionado de config y migrations | P3 | [ ] Pendiente |
| 8 | Release channel @next | P3 | [ ] Pendiente |
| 9 | ESLint import/order | P4 | [ ] Pendiente |
| 10 | Audit outputs JSON estructurados | P4 | [ ] Pendiente |

---

*Documento generado el 2026-04-14. Basado en análisis de [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) v0.39.x.*
