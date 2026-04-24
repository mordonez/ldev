# Intake

Use this reference when the issue arrives with weak technical context or mixes URLs, screenshots, and ambiguous descriptions.

## Objective

- Confirm the affected surface before reading code
- Turn issue URLs and clues into context verified with `ldev`
- Make remaining unknowns explicit

## Recommended Flow

1. Read the issue and comments:

```bash
gh issue view NUM --json title,body,labels,comments
```

2. Resolve each reported URL through `ldev` first:

```bash
ldev context --json
ldev portal inventory page --url <issueUrl> --json
```

If the issue URL is production, use it only as an identifier for discovery. Do
not use the production host for browser reproduction. Reuse the resolved
local/runtime URL from `ldev`.

3. If there is no exact URL, traverse the site:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
```

4. If `displayStyle: ddmTemplate_<ID>` appears, resolve the owning ADT before
searching code:

```bash
ldev resource adt --display-style ddmTemplate_<ID> --site /<site> --json
```

5. If the page inspection identifies another owned resource first, resolve that
resource before grep:

- ADT -> inspect the ADT file path and owning resource
- template -> inspect the template id/file
- fragment -> inspect the fragment key/site
- theme/module -> inspect the owning artifact

Do not start with broad `rg` over the whole repo when `ldev portal inventory`
can tell you which page/resource is actually involved.

6. If the project has created a structured issue enrichment script, use it:

```bash
# Only run if the project has created this script
# On Windows, replace `python` with `py` if `python` is not in PATH
python .agents/skills/project-issue-engineering/scripts/prepare_issue.py NUM
```

## What to Add to the Issue

- Verified local URL used for reproduction
- Site, layout, structure, template, or ADT actually resolved by tooling
- Hypotheses clearly labeled as `NOT_VERIFIED`

## What Not to Add

- Conclusions based only on file names
- IDs guessed
- Unreproduced diagnoses
- Claims based only on the production URL without local page inspection

## Reproduce the Symptom

After confirming the local URL and surface, capture the failing state **before
any code change**. This screenshot is the definition of the problem, not the
issue description, not a hypothesis.

```bash
playwright-cli -s=issue-NUM open "<localUrl>"
playwright-cli -s=issue-NUM snapshot
playwright-cli -s=issue-NUM run-code "async function (page) { await page.screenshot({ path: '.tmp/issue-NUM/before.png', fullPage: true }); }"
```

Use the page snapshot/inspection as part of intake:

- confirm the expected page actually loaded
- locate the relevant page blocks/components before code search
- record the concrete resource or component you are about to change

If the symptom does not appear:

- record that the bug was not reproduced in this environment
- stop and report to the user before proceeding
- do not infer the bug is present or already fixed without evidence

Save `before.png` before creating a worktree or editing any file.
