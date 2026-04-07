---
title: Installation
description: System requirements and installation guide for @mordonezdev/ldev. Setup Liferay local development in minutes.
---

# Install

Install `ldev` only after checking the [Support Matrix](/support-matrix), which covers platform/Docker provider support and the current Docker image baseline.

## Requirements

- Node.js `20+`
- Git in `PATH`
- Docker in `PATH`
- `docker compose` in `PATH`
- 8 GB RAM minimum available to Docker
- Linux or macOS for supported usage

## Install globally

```bash
npm install -g @mordonezdev/ldev
ldev --help
```

## Run without global install

```bash
npx @mordonezdev/ldev --help
```

## Package name

Install the public package `@mordonezdev/ldev`.

## Platform summary

- Supported: Linux + Docker Engine, macOS + Docker Desktop
- Experimental: macOS + OrbStack, Windows via WSL2
- Not supported: native Windows

If you are on macOS or Windows, do not assume Linux-only features such as Btrfs-backed worktree flows are available.

## Product baseline summary

- primary documented baseline: `liferay/dxp:2026.q1.0-lts`
- first-class statement: current DXP quarterly baseline used by the scaffold
- broader image compatibility should be treated as explicit project validation work unless the docs say otherwise

## Secret hygiene

- Treat `.liferay-cli.yml` as non-secret, version-controlled defaults only (paths, flags, metadata). Do not place runtime OAuth2 URLs/IDs/secrets there, even via `${VAR}` or `secret://...` indirection.
- Source OAuth2 credentials and other secrets from environment (`docker/.env`, `.env`, shell env) or your secret manager, and wire runtime from there.
- Keep secret values in local env files (`docker/.env`, `.env`) and ensure those files stay gitignored.
- Start from `docker/.env.example` and fill values in your local `docker/.env` only. If `ldev` warns about sensitive values in `.liferay-cli.yml`, treat it as misconfiguration and move/rotate those secrets before sharing.

## Next step

Continue with the [Quickstart](/quickstart).
