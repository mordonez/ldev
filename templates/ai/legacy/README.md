# Legacy Project AI Package

This folder is not part of the standard `ldev ai install` surface.

It is a project-oriented overlay preserved so it can be copied into a concrete
repository such as `~/projects/labweb` with minimal extra work.

Rules for this folder:

- It may contain project-level assets such as `CLAUDE.md.template`,
  GitHub-issue workflows and Claude-specific runbooks.
- It must still use `ldev` as the official local tooling entrypoint.
- It should be safe to copy into a project and adapt in place.

If an asset becomes generally reusable, move it out of `legacy/` and into the
standard `templates/ai/skills/` or `templates/ai/install/` surface.
Update `docs/ASSET_INVENTORY.md` and convert the legacy copy to a redirect.

## Recommended adoption flow

1. Install the standard reusable package:

```bash
ldev ai install --target /path/to/project
```

2. Layer the legacy project overlay on top:

```bash
bash templates/ai/legacy/install.sh /path/to/project
```
