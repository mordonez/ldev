---
title: Advanced Commands
description: Minimal reference for OSGi diagnostics, isolated worktrees, and specialized tooling.
---

# Advanced Commands

## `ldev osgi status`

Inspect one bundle state.

```bash
ldev osgi status com.acme.foo.web
```

## `ldev osgi diag`

Run Gogo diagnostics for one bundle.

```bash
ldev osgi diag com.acme.foo.web
```

## `ldev worktree setup`

Create an isolated branch environment.

```bash
ldev worktree setup --name incident-123 --with-env
```

## `ldev worktree clean`

Remove an isolated worktree and its runtime data.

```bash
ldev worktree clean incident-123 --force
```

## `ldev mcp check`

Inspect MCP runtime availability when you need Liferay MCP integration checks.

```bash
ldev mcp check --json
```
