# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ESLint and Prettier configuration for consistent code style
- `.editorconfig` for cross-editor consistency
- GitHub Actions CI pipeline (lint, typecheck, test, build, smoke, package validation)
- `CONTRIBUTING.md` with development workflow and command creation guide
- This changelog

### Changed
- Split `liferay.command.ts` (807 lines) into focused sub-registries: `auth.command.ts`, `inventory.command.ts`, `page-layout.command.ts`, `resource.command.ts`
- Renamed `core/liferay/` to `core/http/` to reflect its generic HTTP client nature
- Renamed `root-command-manifest.ts` to `command-registry.ts`
- Renamed `core/output/print.ts` to `core/output/printer.ts`
- Renamed `scaffold/` to `templates/`
- Cleaned npm package `files` — only ships `dist/` and `templates/` (removed `docker/`, `liferay/`, `modules/`, `tools/ai/`)
- Added `lint`, `format`, `format:check`, and `prepack` npm scripts
- Enabled TypeScript declaration file generation (`dts: true`)

## [0.1.0] - 2026-03-28

### Added
- Initial CLI with core commands: `doctor`, `setup`, `start`, `stop`, `status`, `logs`, `shell`
- Workspace commands: `project init`, `project add`, `worktree`
- Runtime commands: `env`, `db`, `deploy`, `osgi`
- Liferay API commands: `liferay inventory`, `liferay resource`, `liferay page-layout`
- Automation contract v1 with `--json` / `--ndjson` output
- Unit, integration, and smoke test suites
