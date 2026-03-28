# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ESLint and Prettier configuration for consistent code style
- `.editorconfig` for cross-editor consistency
- GitHub Actions CI pipeline (lint, typecheck, test, build, smoke, package validation)
- GitHub Actions release workflow (tag-triggered npm publish with provenance)
- Installed binary smoke test in CI (npm pack → global install → verify)
- `CONTRIBUTING.md` with development workflow and command creation guide
- `AUTOMATION.md` — standalone documentation for the JSON automation contract
- Vitest coverage configuration with v8 provider and 70% threshold
- This changelog

### Changed
- Consolidated all template assets under `templates/` directory (`docker/`, `liferay/`, `modules/`, `tools/ai/` → `templates/`)
- Split `liferay.command.ts` (807 lines) into focused sub-registries: `auth.command.ts`, `inventory.command.ts`, `page-layout.command.ts`, `resource.command.ts`
- Sub-organized `features/liferay/` (41 files) into `inventory/`, `resource/`, `page-layout/` subdirectories
- Renamed `core/liferay/` to `core/http/` to reflect its generic HTTP client nature
- Renamed `root-command-manifest.ts` to `command-registry.ts`
- Renamed `core/output/print.ts` to `core/output/printer.ts`
- Cleaned npm package `files` — only ships `dist/` and `templates/`
- Added `lint`, `format`, `format:check`, `prepack`, `test:coverage` npm scripts
- Enabled TypeScript declaration file generation (`dts: true`)
- Translated README to English

### Removed
- Build artifacts that were tracked in git (`modules/build/`, `liferay/.gradle/`, `liferay/build/`)

## [0.1.0] - 2026-03-28

### Added
- Initial CLI with core commands: `doctor`, `setup`, `start`, `stop`, `status`, `logs`, `shell`
- Workspace commands: `project init`, `project add`, `worktree`
- Runtime commands: `env`, `db`, `deploy`, `osgi`
- Liferay API commands: `liferay inventory`, `liferay resource`, `liferay page-layout`
- Automation contract v1 with `--json` / `--ndjson` output
- Unit, integration, and smoke test suites
