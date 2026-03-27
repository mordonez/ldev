# Product Rules for AI Assets

These rules decide what belongs in the reusable `ldev` AI package and what must
stay in a specific project.

## Belongs in `ldev`

An asset belongs in `ldev` only if all of these are true:

- It is reusable across multiple Liferay projects.
- It uses `ldev` as the official entrypoint.
- It does not depend on a client, repository or organization-specific workflow.
- It remains useful without private project context.
- It can be installed safely as vendor-managed content.

Typical examples:

- domain routers such as `liferay-expert`
- local deploy and troubleshooting playbooks
- resource migration guidance based on stable `ldev liferay ...` commands
- generic agent bootstrap instructions that point to `ldev doctor` and `ldev context --json`

## Does Not Belong in `ldev`

Keep an asset out of `ldev` if any of these are true:

- It depends on a project-specific repository layout.
- It assumes a client workflow, team ritual or GitHub process.
- It requires project-owned credentials, URLs or organization policy.
- It references legacy wrappers instead of the public `ldev` CLI.
- It is only useful for authors of the AI package itself.

Typical examples:

- issue lifecycle playbooks tied to GitHub labels, PR templates or attachment policy
- per-project context templates such as `CLAUDE.md`
- browser automation tied to a project wrapper that `ldev` does not provide
- Claude-only runbooks and hidden agent pipelines

## Installation Rules

`ldev ai install` should install only:

- the standard `AGENTS.md`
- curated vendor skills from `install/vendor-skills.txt`
- the vendor manifest `.agents/.vendor-skills`

It should not install by default:

- project knowledge templates
- project-specific issue workflows
- runtime-specific agent pipelines
- legacy compatibility wrappers

## Evolution Rules

When a new asset is proposed:

1. Ask whether it is reusable without knowledge of the original project.
2. Ask whether every command example can be expressed with public `ldev` commands.
3. If there is doubt, keep it out of `ldev`.
4. Prefer small reusable skills over large multi-purpose runbooks.
5. Prefer deletion over carrying a legacy wrapper forward.
