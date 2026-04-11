# GitHub Visual Evidence

Use this reference when reviewers need visual evidence directly in GitHub issue
or PR comments without committing screenshot artifacts to the branch.

Do not commit PNG, JPG, or SVG evidence files to the repository or issue branch.

## Guardrails

- A secret gist is unlisted, not private. Only publish sanitized evidence that is
  safe to share with everyone who can read the GitHub comment.
- `gh gist create` and `gh gist edit` should receive text SVG files, not raw
  PNG/JPG uploads.
- Generate SVG text files with `scripts/png_to_evidence_svg.mjs`; do not hand-roll
  the wrapper. The SVG root `width`, `height`, and `viewBox` must match the real
  PNG dimensions or the raw URL may render as a cropped icon in browsers.
- Use versioned gist `raw_url` values from `gh api gists/<id>` to avoid stale
  cache links.
- Store the reusable gist ID in the primary checkout `.liferay-cli.local.yml`,
  not in tracked repo files and not in a worktree-local copy. Worktrees are
  disposable; config written under `.worktrees/<name>` will be lost when the
  worktree is cleaned.

Local config key:

```yaml
ai:
  evidence:
    gistId: <gist-id>
```

## Minimal Reusable Flow

1. Generate evidence SVG files from local screenshots.

   Example names:

   - `issue-NUM-before.svg`
   - `issue-NUM-after.svg`

   ```bash
   node .agents/skills/project-issue-engineering/scripts/png_to_evidence_svg.mjs .tmp/issue-NUM/before.png .tmp/issue-NUM/issue-NUM-before.svg
   node .agents/skills/project-issue-engineering/scripts/png_to_evidence_svg.mjs .tmp/issue-NUM/after.png .tmp/issue-NUM/issue-NUM-after.svg
   ```

   The helper reads the PNG dimensions and writes a standalone SVG with matching
   `width`, `height`, `viewBox`, and `<image>` dimensions.

2. Read the reusable gist ID from the primary checkout `.liferay-cli.local.yml`.

   Key: `ai.evidence.gistId`

   If you are currently inside `.worktrees/<name>`, resolve the primary checkout
   before reading or writing the file. PowerShell:

   ```powershell
   $repoRoot = (git rev-parse --show-toplevel).Trim()
   $mainRoot = if ($repoRoot -match '\\.worktrees\\[^\\]+$') { Split-Path (Split-Path $repoRoot -Parent) -Parent } else { $repoRoot }
   $localConfig = Join-Path $mainRoot '.liferay-cli.local.yml'
   ```

   Use `$localConfig` for `ai.evidence.gistId`. Do not create or update
   `.liferay-cli.local.yml` inside the worktree root.

3. Add files the first time they are published to the reusable gist.

   ```bash
   gh gist edit <gist-id> --add /absolute/path/issue-NUM-before.svg
   gh gist edit <gist-id> --add /absolute/path/issue-NUM-after.svg
   ```

4. Replace existing files on later runs.

   ```bash
   gh gist edit <gist-id> --filename issue-NUM-before.svg /absolute/path/issue-NUM-before.svg
   gh gist edit <gist-id> --filename issue-NUM-after.svg /absolute/path/issue-NUM-after.svg
   ```

5. Read versioned raw URLs.

   ```bash
   gh api gists/<gist-id> --jq '.files["issue-NUM-before.svg"].raw_url'
   gh api gists/<gist-id> --jq '.files["issue-NUM-after.svg"].raw_url'
   ```

6. Post the comment.

   ```bash
   gh pr comment <pr-number> --body "![before](<before-raw-url>)\n\n![after](<after-raw-url>)"
   ```

For issue comments, use the equivalent command:

```bash
gh issue comment <issue-number> --body "![before](<before-raw-url>)\n\n![after](<after-raw-url>)"
```

Keep the same evidence rules.

## Hard Stop

If the screenshot contains private portal data, personal data, admin UI, tokens,
or anything that should not be visible to every reader of the GitHub comment, do
not publish it to a gist. Use a sanitized screenshot or keep the evidence local
for human review.
