# Project AI Assets

This folder contains project-owned assets that `ldev ai install` may copy into a
target repository.

The intent is to keep the standard reusable surface small while still providing
lightweight project entrypoints and optional project-owned overlays.

Rules for this folder:

- Files copied by default should remain generic templates:
  `CLAUDE.md`, `.github/copilot-instructions.md`.
- Optional project context scaffolding is installed with `ldev ai install --project-context`
  or `ldev ai install --project`:
  `docs/ai/project-context.md`, `docs/ai/project-context.md.sample`.
- Project-owned skills and agents remain optional overlays installed only with
  `ldev ai install --project`.
- Project-owned overlays should stay focused on repository-specific process and
  context. Reusable `ldev` technical workflows belong in vendor-managed skills.
- It must still use `ldev` as the official local tooling entrypoint.
- Everything here should be safe to copy into a project and adapt in place.

If an asset becomes generally reusable, move it into `install/` or `skills/`.

## Recommended adoption flow

1. Install the standard reusable package:

```bash
ldev ai install --target /path/to/project
```

If the repository wants to keep agent/editor tooling local, use:

```bash
ldev ai install --target /path/to/project --local --project-context
```

2. If the repository wants project context scaffolding, add it:

```bash
ldev ai install --target /path/to/project --project-context
```

3. If the repository wants the project-owned issue workflow overlay, add it:

```bash
ldev ai install --target /path/to/project --project
```
