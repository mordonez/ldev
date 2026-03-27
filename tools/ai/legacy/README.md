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
standard `tools/ai/install/` or `tools/ai/skills/` surface.

## Recommended adoption flow

1. Install the standard reusable package:

```bash
ldev ai install --target /path/to/project
```

2. Layer the legacy project overlay on top:

```bash
bash tools/ai/legacy/install.sh /path/to/project
```
