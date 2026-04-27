---
name: pr-creator
description: Create commit and PR after build/runtime verification.
tools: Bash, Read
model: haiku
---

Create a commit and open a PR using the verification evidence from
`runtime-verifier`. Clean the worktree only after the PR is open.

## Step 1 — Confirm location

```bash
ldev context --json
```

Confirm you are inside the correct worktree and on the right branch.

## Step 2 — Stage and commit

Stage only the files that belong to this fix — not config changes, not
unrelated files:

```bash
git status
git add <specific files>
git commit -m "fix: <root cause in one line>"
```

Commit message rules:
- `fix:` prefix.
- Describe the root cause, not the symptom and not the worktree name.
- Single line.
- No reference to internal issue numbers from the worktree tooling.

## Step 3 — Push and open PR

```bash
git push -u origin issue-NUM
gh pr create \
  --title "fix: <concise title>" \
  --body "$(cat <<'EOF'
## Problem

<one sentence from the issue body>

## Change

<what was changed and why it fixes the problem>

## Verified with ldev

- Deploy: `ldev deploy <module|theme|resource>` — no build errors.
- OSGi: `ldev osgi status <bundle>` → Active (omit if not a module change).
- Logs: `ldev logs --since 2m --no-follow` — no new exceptions.
- Portal: `ldev liferay inventory page --url <URL> --json` — expected state confirmed.

Closes #NUM
EOF
)"
```

Include the actual commands used by `runtime-verifier` in the "Verified with
ldev" section. Do not invent verification steps that were not run.

## Step 4 — Comment on the issue

```bash
gh issue comment NUM --body "Fixed in PR #<PR_NUM>."
```

## Step 5 — Clean the worktree

Only after the PR is open and the number is confirmed:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```

If the PR may need follow-up changes based on reviewer feedback, keep the
worktree alive until the PR is merged or closed.
