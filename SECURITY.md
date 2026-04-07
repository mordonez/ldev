# Security Policy

## Reporting a Vulnerability

If you believe you have found a security issue in `ldev`, do **not** open a public GitHub issue first.

Instead, report it privately to:

- `mordonez@users.noreply.github.com`
- or a private GitHub security report if that workflow is enabled for the repository

Include:

- a short description of the issue
- affected versions or commit range if known
- reproduction steps or a proof of concept
- impact assessment
- any suggested mitigation if you already have one

## Response Expectations

This is a small open-source project, not a staffed security team.

Reasonable expectations:

- acknowledgement when the report is received
- clarification questions if reproduction is incomplete
- a fix or mitigation timeline only after the issue is understood

Please do not expect real-time support.

## Scope

Security reports are most useful when they involve:

- credential handling
- local secret exposure
- unsafe file writes or path traversal
- command execution vulnerabilities
- authentication or token leakage in portal-related workflows

Issues that are only local misconfiguration, unsupported host setups, or normal Docker/Liferay operational failures usually belong in normal support channels, not in private security reporting.

## Secret hygiene

- Never commit plaintext secrets in source control (including `.liferay-cli.yml`, `docker/.env`, `.env`, shell scripts, or docs).
- Do not store runtime URLs, OAuth2 client IDs, or OAuth2 client secrets in `.liferay-cli.yml`; keep it for non-secret defaults only.
- Keep OAuth2 credentials and other sensitive values in environment variables, local env files excluded from git, CI secret stores, or a dedicated secret manager.
- `ldev` emits a runtime warning if it detects likely plaintext secrets in `.liferay-cli.yml`, to catch accidental exposure even though those values are not read at runtime.
- Review `.gitignore` and keep local secret files (`.env`, `.env.*`, activation keys, key material) excluded from git.
- Prefer least privilege: use the `ldev-readonly` OAuth2 app for read-only automation, and reserve read/write credentials for workflows that truly need mutation.

## Disclosure

Please give the project a reasonable chance to understand and mitigate the problem before public disclosure.
