# ADR 0005 — LiferayGateway as the single HTTP abstraction for all Liferay API calls

- **Status:** Accepted
- **Date:** 2026-05 (formalised)
- **Audience:** maintainers of `ldev`
- **Related:** [ADR 0006](./0006-domain-error-factories.md)

## Context

`ldev` communicates with a Liferay DXP instance through its REST and headless APIs for every significant operation: health checks, resource import/export, reindexing, OAuth installation, OSGi diagnostics, etc.

Before the migration completed in 2026-04 (PRs #50–58, #80–81), HTTP calls to Liferay were made in many different ways scattered across the codebase:

- Direct `fetch()` calls with ad-hoc `Authorization: Bearer <token>` header construction.
- A mix of helpers (`authedGet`, `fetchWithAuth`, `postForm`, …) that were partially overlapping, inconsistently typed, and duplicated authentication logic.
- Some paths obtained an OAuth token, others assumed it was already cached, others re-fetched it every call.

This caused recurring bugs: token cache misses, inconsistent 401 handling, missing error propagation, and tests that mocked HTTP at different layers depending on which helper was used.

## Decision

**All HTTP requests to the Liferay API go through a single `LiferayGateway` instance.** No feature module calls `fetch()` directly against Liferay endpoints.

`LiferayGateway` (`src/features/liferay/liferay-gateway.ts`) is a class that:

1. **Centralises authentication.** Obtains an OAuth access token via `OAuthTokenClient`, caches it for the process lifetime, and retries once on 401 with a fresh token.
2. **Types every response.** All methods are generic (`getJson<T>`, `postJson<T>`, `postForm<T>`, `putJson<T>`, `deleteJson<T>`, `getRaw<T>`). Callers declare what they expect; the gateway parses and returns it.
3. **Surfaces errors as `CliError`.** HTTP errors (non-2xx, network errors, parse failures) are converted to `CliError` with a meaningful code and message before they leave the gateway. Callers never handle raw fetch rejections.
4. **Accepts dependencies via constructor injection.** `LiferayGateway(config: AppConfig, httpClient: HttpApiClient, tokenClient: OAuthTokenClient)` — testable without HTTP mocking.

### What the gateway is NOT

- It is not an ORM or a repository. It does not model Liferay resources; it executes HTTP verbs.
- It is not used for the dashboard's internal HTTP server or for MCP tool HTTP calls to external services. Those have their own transport.

## Drivers

- One place to fix authentication bugs (token expiry, 401 retry, header format).
- One place to add observability (latency logging, error tracing) without touching each feature.
- Uniform test setup: tests mock `HttpApiClient`, not `fetch`, so they are stable across Node.js versions.
- Eliminates the class of bugs where a new feature author "forgot" to add a retry or cached the token incorrectly.

## Alternatives considered

### Alternative A — Keep per-feature fetch helpers

The status quo before 2026-04. Each feature had its own thin wrapper.

**Verdict:** rejected. Demonstrated to produce duplicate logic and inconsistent error handling. Real bugs traced to this pattern.

### Alternative B — A repository layer per resource type

Model each Liferay resource type as a typed repository class (`StructureRepository`, `TemplateRepository`, …) that encapsulates both HTTP and business logic.

**Pros:** familiar pattern from JPA / ActiveRecord worlds.
**Cons:** over-engineering for a CLI tool. The "business logic" is the CLI command; the gateway only needs to be an HTTP abstraction. Repository pattern would be one more layer to navigate.

**Verdict:** rejected. Gateway is the right granularity.

### Alternative C — Use a generated API client (OpenAPI codegen)

Liferay exposes OpenAPI specs. Generate a typed client.

**Pros:** eliminates hand-written typed responses.
**Cons:** generated clients are large, hard to customise, and Liferay's OpenAPI specs have historically been incomplete or incorrect for the endpoints `ldev` uses. Maintenance burden exceeds the benefit.

**Verdict:** rejected for now. Re-evaluate if Liferay stabilises its OpenAPI coverage for the headless APIs in use.

## Consequences

### Positive

- All 401 retry and token-caching logic lives in one 150-line file.
- Feature modules are simpler: they call `gateway.getJson<SomeType>(url)` and handle the domain result, not the HTTP error.
- Integration tests can use a `FakeHttpApiClient` to simulate any Liferay response without network.

### Negative

- `LiferayGateway` is a required constructor argument for any feature that talks to Liferay. This propagates through call chains. Mitigated by passing the fully-constructed gateway from the command layer.
- If two features need different OAuth scopes for the same request, the gateway's single-token model needs extension. This has not been a problem yet.

### Neutral

- The gateway does not validate Liferay response payloads. Validation is the caller's responsibility (see ADR 0003 for contract schemas). The gateway only guarantees the HTTP exchange succeeded.
