---
layout: default
title: Getting Started
---

# Getting Started

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

`ldev` copies the key to `liferay/configs/dockerenv/osgi/modules/`, replaces any other local keys, and keeps it out of version control.

## New Projects

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev doctor
ldev setup
ldev start
```

`project init` generates the full project scaffold: Docker Compose setup, Liferay Gradle workspace, and configuration files.

On hosts with a fixed local-access IP:

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

## AI Bootstrap

Install the reusable agent and skills base:

```bash
ldev ai install --target .
```

This installs standard `AGENTS.md`, reusable skills in `.agents/skills/`, and a vendor-managed manifest for future updates.

[Back to Home](./)
