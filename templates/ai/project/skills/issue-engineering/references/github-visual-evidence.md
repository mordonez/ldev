# GitHub Visual Evidence

Use this reference when reviewers need visual evidence directly in GitHub issue
or PR comments without committing screenshot artifacts to the branch.

Do not commit PNG, JPG, or SVG evidence files to the repository or issue branch.

## Guardrails

- A secret gist is unlisted, not private. Only publish sanitized evidence that is
  safe to share with everyone who can read the GitHub comment.
- `gh gist create` and `gh gist edit` should receive text SVG files, not raw
  PNG/JPG uploads.
- Generate SVG text files that embed PNG screenshots as base64.
- Use versioned gist `raw_url` values from `gh api gists/<id>` to avoid stale
  cache links.
- Store the reusable gist ID in `.liferay-cli.local.yml`, not in tracked repo
  files.

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

2. Read the reusable gist ID from `.liferay-cli.local.yml`.

   Key: `ai.evidence.gistId`

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
