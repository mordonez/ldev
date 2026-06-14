---
name: runtime-change-workflow
description: 'Runs the canonical reproducible Red -> Green loop for mutating ldev work. Use when non-trivial changes mutate code, portal resources, or runtime state.'
---

# Runtime Change Workflow

Owns the reusable gate order for mutating work. Project skills may add naming,
issue artifacts, reviewers, or handoff rules, but they must not redefine these
technical gates.

## Gate Order

1. Bootstrap and lock the active root before any file edit or runtime mutation:

```bash
ldev ai bootstrap --intent=develop --cache=60 --json
git rev-parse --show-toplevel
```

If a tool-capable agent has not completed this gate, do not Edit, Write, or
deploy. First load the routed skill, then mutate only inside the locked root.

2. For `ldev-native` non-trivial work, use `isolating-worktrees` unless the
   user explicitly chooses a lighter path.
   Exception: if the user asks for a vanilla sandbox, clean sandbox, or fresh
   Liferay sandbox, do not create a worktree. Create a fresh `ldev` project
   with `ldev project init`, lock that root, require an activation key before
   `ldev start`, and treat it as a separate runtime. Start the worktree runtime before Red reproduction. For vanilla sandboxes, start the sandbox runtime before Red reproduction. do not reproduce first in the primary checkout.

3. Reproduce Red in the active isolated runtime before edits. Production
   screenshots are context, not Red. If a URL is provided, resolve it in the
   worktree or sandbox runtime first with the full page inventory contract in
   [references/portal-discovery.md](references/portal-discovery.md).

4. Lock scope before the first edit:
   - list every file and portal resource you plan to touch
   - tie each item to the issue wording or inventory evidence
   - keep unproven sibling/copy resources out of scope

5. Route execution:
   - unclear failure -> `troubleshooting-liferay`
   - implementation -> `developing-liferay`
   - deploy/import verification -> `deploying-liferay`
   - portal resource change -> `portal-resource-workflow`
   - Journal migration risk -> `migrating-journal-structures`
   - browser evidence -> `automating-browser-tests`

6. Apply the smallest matching action. File edits alone are still Red.

7. Verify with fresh evidence:
   - read-after-write for portal resources
   - OSGi status/diag for bundles
   - `ldev portal check --json` and `ldev logs diagnose --since 5m --json`
   - browser validation for rendered behavior

## Non-Negotiable Safety Checks

- Use `--json` for agent-consumed command output.
- Use the resource mutation gates in
  [references/resource-mutation-gates.md](references/resource-mutation-gates.md).
- Resolve IDs, keys, site names, and URLs through `ldev portal inventory`.
- Diagnose failed commands before retrying.
- Do not claim Green until the original Red scenario no longer reproduces.

## Handoff

Report the locked root, changed files/resources, exact deploy/import/migration
commands, read-after-write evidence, browser evidence when applicable, and any
validation that remains blocked.
