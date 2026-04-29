---
name: clarifying-liferay-tasks
description: 'Use when a Liferay task is ambiguous about which Site, Page, resource, module, theme, fragment or extension point it actually targets. Interview the user one question at a time, with a recommended answer per question, until every branch of the decision tree is resolved before any code or resource change.'
---

# Clarifying Liferay Tasks

Use this skill before any work begins when the request is fuzzy about the
affected Liferay surface. Walk down each branch of the decision tree, resolving
one question at a time, with a recommended answer attached to every question.

If a question can be answered by `ldev` discovery instead of asking the user,
run the discovery command and use the answer directly. Do not ask what
`ldev portal inventory ...` already knows.

This skill does **not** mutate runtime state, deploy, import, or edit files.
Its only output is a confirmed surface plus a short clarification note that
the next vendor skill (`developing-liferay`, `troubleshooting-liferay`,
`migrating-journal-structures`, `automating-browser-tests`) consumes.

## Before exploring

Read `../liferay-expert/references/domain-awareness.md` and apply the project
glossary in `docs/ai/project-context.md` to every question and answer. Use the
project's canonical names, not synonyms.

## Required bootstrap

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
ldev portal inventory sites --json
```

If the request mentions a URL, resolve it before any question:

```bash
ldev portal inventory page --url <fullUrl> --json
```

## Bootstrap fields

- Required fields: `context.commands.*` (used to confirm `portal inventory`
  is supported) and `context.liferay.portalUrl` (used to normalise URLs in
  questions).
- If either is missing, stop and report that the installed `ldev` AI assets
  are out of sync with the CLI.

## Process

1. **Restate the request in glossary terms.** One sentence, using the project's
   canonical names. If you cannot, the glossary is missing a term — surface it.
2. **Pick the smallest decision tree** from `references/grilling-tree.md` that
   covers the request.
3. **Ask one question at a time.** For each, include your recommended answer
   and the consequence of that answer. Wait for confirmation before continuing.
4. **Resolve from `ldev` first.** If the answer is in inventory output, do not
   ask — quote the answer and confirm.
5. **Stop when scope is locked.** Output the confirmation note and route.

## Output contract

When the surface is locked, write a short note (5–10 lines) and route:

```md
## Clarified surface

- Site: /<site>
- Page or resource: <page friendly URL | structure key | template id | fragment key | module>
- Owning surface: <ADT | Journal Template | Display Page Template | Fragment | Module | Theme | Object | Web Content Article>
- Smallest expected change: <single sentence>
- Out of scope (explicit): <one or two items>

## Route

Next skill: <developing-liferay | troubleshooting-liferay | migrating-journal-structures | automating-browser-tests | deploying-liferay>
Reason: <one sentence using glossary terms>
```

If the request mutates code, resources, or runtime state on `ldev-native`,
remind the user that `isolating-worktrees` is the recommended default before
the next skill picks the work up.

## When to escalate

Escalate to a `troubleshooting-liferay` diagnose loop instead of continuing
this grilling session if any of these is true:

- the user cannot describe the symptom in glossary terms because the failure is
  not yet understood
- two different URLs from the request resolve to two different sites, pages, or
  owning resources
- inventory disagrees with what the user said is true (`ldev portal inventory
  page --url ...` returns a different owning template than the user named)

In those cases the grilling session is premature. Stop, route to
`troubleshooting-liferay`, and resume here once the symptom is reproduced.

## Guardrails

- Ask one question at a time. No bullet lists of 8 questions in one turn.
- Always include a recommended answer with each question.
- Do not edit files. Do not deploy. Do not import resources. Do not run
  destructive commands.
- Do not invent IDs, keys, or site names. Resolve them with `ldev portal
  inventory ...` or ask.
- Use the project glossary verbatim. Flag drift instead of paraphrasing.
- Keep the output note short. Long restatements belong in the next skill's
  brief, not here.

## Reference

- `references/grilling-tree.md` — decision trees for the most common Liferay
  request shapes (resource change, code change, browser-visible change,
  migration risk, runtime failure).
