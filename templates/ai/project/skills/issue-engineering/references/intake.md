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

2. Resolve each exact URL:

```bash
ldev context --json
ldev portal inventory page --url <URL> --json
```

3. If there is no exact URL, traverse the site:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
```

4. If `displayStyle: ddmTemplate_<ID>` appears:

```bash
ldev resource adt --display-style ddmTemplate_<ID> --site /<site> --json
```

5. If the project has created a structured issue enrichment script, use it:

```bash
# Only run if the project has created this script
python .agents/skills/project-issue-engineering/scripts/prepare_issue.py NUM
```

On Windows, use `py` if `python` is not registered on `PATH`.

## What to Add to the Issue

- Verified URLs
- Site, layout, structure, template, or ADT actually resolved by tooling
- Hypotheses clearly labeled as `NOT_VERIFIED`

## What Not to Add

- Conclusions based only on file names
- IDs guessed
- Unreproduced diagnoses

## Reproduce the Symptom

After confirming the URL and surface, capture the failing state **before any code change**.
This screenshot is the definition of the problem — not the issue description, not a
hypothesis. If the symptom is not visible here, the issue may not affect this environment.

```bash
playwright-cli -s=issue-NUM open "<fullUrl>"
playwright-cli -s=issue-NUM screenshot --filename=.tmp/issue-NUM/before.png
```

If the symptom does not appear:

- Record that the bug was not reproduced in this environment
- Stop and report to the user before proceeding
- Do not infer the bug is present or already fixed without evidence

Save `before.png` before creating a worktree or editing any file.
