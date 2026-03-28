# `ldev`

Official CLI for Liferay DXP local development.

`ldev` is designed for:

- Simple installation
- Fast startup
- Short, predictable commands
- Sensible defaults
- Direct use with new and existing projects

## Installation

Global installation:

```bash
npm i -g ldev
ldev --help
```

Usage without global installation:

```bash
npx ldev --help
```

## First Use

Minimal flow in an already prepared project:

```bash
ldev doctor
ldev setup
ldev start
```

If the project uses DXP with a local license:

```bash
ldev start --activation-key-file /path/to/activation-key-*.xml
```

`ldev` will copy the key to `liferay/configs/dockerenv/osgi/modules/`, replace any other local keys, and keep it out of version control.

Equivalent namespaced forms:

- `ldev env setup`
- `ldev env start`
- `ldev env stop`
- `ldev env status`
- `ldev env logs`
- `ldev env shell`

## New Projects

Create a new project:

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev doctor
ldev setup
ldev start
```

`project init` generates the project scaffold ready to operate with `ldev`. It does not depend on a symlink to a vendor repo.

On hosts with a fixed local-access IP, you can create the project with `BIND_IP` in the environment so that `docker/.env` is generated with the correct configuration:

```bash
BIND_IP=100.115.222.80 ldev project init --name my-project --dir ~/projects/my-project
```

## Existing Projects

Add `ldev` to an existing repo:

```bash
cd ~/projects/my-project
ldev project add --target .
ldev doctor
ldev setup
ldev start
```

If the project also needs Docker/Liferay scaffolding:

```bash
ldev project add-community --target .
```

## AI Bootstrap in Projects

Install the reusable agent and skills base managed by `ldev`:

```bash
ldev ai install --target .
```

This installs:

- Standard `AGENTS.md`
- Reusable skills in `.agents/skills/`
- Vendor-managed manifest for future updates

If you also want to port the legacy overlay from the original project as a base for local customization, apply it on top of the standard installation:

```bash
bash templates/ai/legacy/install.sh .
```

Use that overlay only for project-specific context and workflows. The reusable, product-supported surface remains what `ldev ai install` provides.

## Local Development of `ldev`

To modify `ldev` locally and test it instantly in Liferay projects without publishing to npm:

```bash
git clone git@github.com:mordonez/ldev.git
cd ldev
npm install
npm link
npm run build:watch
```

With that, any Liferay project on your machine can use the linked global binary:

```bash
cd ~/projects/my-project
ldev start
ldev doctor
ldev liferay inventory sites
```

Every recompiled change in `ldev` is available immediately. No need to publish, version, or reinstall the package.

## npm Packaging

The package is set up for:

- `npm i -g ldev`
- `npx ldev ...`
- `ldev` binary
- Clean publishing from `dist/` and required scaffold assets

Main scripts:

```bash
npm run build
npm run build:watch
npm run test
npm run typecheck
npm run check
```

## Command Model

`ldev` organizes the CLI by intent, not by number of commands:

- `Core commands`: `doctor`, `setup`, `start`, `stop`, `status`, `logs`, `shell`
- `Workspace commands`: `project`, `worktree`
- `Runtime commands`: `env`, `db`, `deploy`, `osgi`
- `Liferay commands`: `liferay`

The idea is that the daily workflow lives at the top level and namespaces are used only when you need an explicit workspace, runtime, or Liferay scripting task.

## Automation Contract

`ldev` exposes a stable JSON contract for CI pipelines and scripting. Commands that support structured output accept `--json` and `--ndjson` flags.

See [AUTOMATION.md](AUTOMATION.md) for the full contract specification, error format, and usage examples.

## Notes

- The effective configuration uses `.liferay-cli.yml` as the project file.
- The local OAuth2 module still uses the `liferay-cli` technical app for compatibility with the current runtime.
- The operational reference for resource migrations is in [RESOURCE_MIGRATIONS.md](RESOURCE_MIGRATIONS.md).
