# ADR 0006 — Domain error factories: typed, coded, and secret-sanitized throws

- **Status:** Accepted
- **Date:** 2026-05 (formalised; pattern established 2026-04)
- **Audience:** maintainers of `ldev`
- **Related:** [ADR 0005](./0005-liferay-gateway.md), [ADR 0003](./0003-zod-contracts-in-core.md)

## Context

A CLI tool throws errors for two different audiences:

1. **The user** — who reads the terminal message and decides what to do.
2. **The agent** (Claude Code, Cursor) — who reads the error JSON from an MCP tool call and decides how to recover.

Before 2026-04 (PRs #79, #96–100), most `ldev` features threw errors with `throw new Error("message")` or `throw new CliError("message", code)` directly at the throw site. This caused several problems:

1. **Secret leakage.** Some error messages were built by interpolating config values that could contain OAuth client secrets, passwords, or API keys. These appeared in terminal output and in MCP tool error responses.
2. **No stable codes.** Agents checking for specific error conditions had to match on message strings, which broke when messages were reworded.
3. **Inconsistency.** Two features handling the same class of error (e.g., "site not found") produced different messages, different exit codes, and different structure — no shared vocabulary.
4. **Throw sites proliferated.** Every feature re-implemented "how to throw a Liferay error" slightly differently, making it impossible to change the format globally.

## Decision

**Each domain has exactly one error factory module.** Features throw errors only through their domain's factory. Direct `throw new Error()` or `throw new CliError()` at business-logic sites are prohibited.

### Structure

```
src/features/env/errors/env-error-factory.ts          → EnvErrors
src/features/deploy/errors/deploy-error-factory.ts    → DeployErrors
src/features/worktree/errors/worktree-error-factory.ts → WorktreeErrors
src/features/liferay/errors/liferay-error-factory.ts  → LiferayErrors
src/core/errors/cli-error.ts                          → CliError (base class)
src/core/errors/errors-sanitize.ts                    → sanitize helper
```

### Factory contract

Each factory exports a named-function object (`LiferayErrors`, `EnvErrors`, …). Every method:

1. Returns a `CliError` with:
   - A **stable string code** (e.g., `LIFERAY_SITE_NOT_FOUND`, `ENV_ALREADY_RUNNING`).
   - A **user-facing message** that does not contain sensitive values.
   - An optional `details` object for structured data (safe, non-secret).
   - An `exitCode` (default 1).
2. Runs the message and details through `sanitizeSecrets()` before constructing the error object.
3. Is named after the condition, not the location: `LiferayErrors.siteNotFound(site)`, not `LiferayErrors.siteQueryFailed(url, response)`.

### Sanitization

`sanitizeSecrets(value)` (`src/core/errors/errors-sanitize.ts`) scans message strings and object trees for known secret patterns (OAuth client secret shape, common password field names) and replaces them with `[REDACTED]`. This runs at error-construction time, not at display time, so the CliError object is always safe to serialize and send to an MCP client.

### Where `new Error()` is still allowed

- Test files (throw freely for test setup).
- `src/core/` infrastructure where the error is immediately caught and re-thrown as a `CliError` by the caller.
- Third-party libraries that throw `Error` — caught at the boundary, wrapped into a `CliError` by the importing feature.

## Drivers

- Secret sanitization must happen at throw time, not at display time. An unsanitized error object that propagates through an MCP tool response could leak secrets to the agent's context even if the terminal display sanitises it separately.
- Stable codes are the stable API for agents. `LIFERAY_SITE_NOT_FOUND` can be grepped in agent templates; the message text cannot.
- A single factory per domain means the message format changes once and applies everywhere.
- Auditing "where do we throw in feature X" becomes a grep for `XErrors.`, not a regex for `throw new`.

## Alternatives considered

### Alternative A — Throw at the site, sanitize at the top-level error handler

Sanitize once in the global error handler (`cli.command.ts`) before printing.

**Verdict:** rejected. Errors propagate through MCP tools, dashboard HTTP responses, and test assertions before reaching the CLI handler. Sanitizing only at the print site is too late.

### Alternative B — One global `LdevErrors` factory

A single `LdevErrors.envAlreadyRunning()`, `LdevErrors.siteNotFound()`, etc.

**Pros:** simpler import path.
**Cons:** the factory grows to hundreds of methods with no domain coherence. It also becomes a dependency of every feature, creating a `features/* → core/LdevErrors` coupling that is harder to refactor.

**Verdict:** rejected. Domain-scoped factories keep cohesion.

### Alternative C — Error class hierarchy (`class EnvError extends CliError`)

A class per domain, used with `throw new EnvError(...)`.

**Pros:** `instanceof` checks at catch sites are precise.
**Cons:** inheritance hierarchies for errors are notoriously fragile across module boundaries (fails with different class instances from the same module loaded twice). The factory function pattern achieves the same goal (typed, coded errors) without class inheritance.

**Verdict:** rejected. Factory functions are simpler and more predictable.

## Consequences

### Positive

- No secret has leaked to a terminal or MCP response since the pattern was adopted in 2026-04.
- Agent-facing MCP tools can document stable error codes in their descriptions.
- Global error message changes (e.g., "add a docs URL to all `SITE_NOT_FOUND` errors") require editing one factory file.

### Negative

- A new feature must create a factory file before it can throw. Cheap upfront cost, enforced by code review.
- Existing callsites that were migrated (PRs #79, #96–100) required mechanical but significant churn.

### Neutral

- `CliError` is the base type. Any code that catches `CliError` and reads `.code` is stable. Code that reads `.message` should be treated as display text, not a stable identifier.
