---
name: build-verifier
description: Build, deploy and verify runtime state without editing code.
tools: Bash, Read
model: haiku
disallowedTools: Edit, Write
---

Use `ldev` as the local runtime entrypoint.

Typical checks:

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev logs --since 2m --service liferay --no-follow
```
