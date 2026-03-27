---
name: skill-creator
description: "The meta-agent for creating and refining high-quality AI skills. Use when you need to build a new capability or improve an existing one following the Research -> Strategy -> Execution -> Validation engineering lifecycle."
---

# Skill Creator (Meta-Agent)

This skill implements the official engineering lifecycle for building robust, portable, and efficient AI agent skills.

## 🔄 The Skill Lifecycle

### 1. Research & Analysis
- **Analyze the Domain**: Identify the specific project/business problem the skill aims to solve.
- **Consult Industry Standards**: Check if a generic industry skill already exists (e.g., from Anthropic, Google, or GitHub).
- **Draft User Stories**: "As an agent, I want to [action] so that I can [result]."

### 2. Strategy & Architecture
- **Define the Trigger**: Draft a "pushy" frontmatter description that clearly states *when* and *why* the model should activate this skill.
- **Progressive Disclosure Plan**: Decide what goes into `SKILL.md` (high-level playbook) and what goes into `references/` (deep-dive how-to).
- **Validation Strategy**: Define empirical pass/fail assertions.

### 3. Execution (Building)
- **Frontmatter**: Standard YAML with `name` and `description`.
- **Workflows**: Use the **Research -> Strategy -> Execution -> Validation** loop within the skill instructions.
- **Tools/Scripts**: Bundle necessary scripts in a `scripts/` folder if they automate complex logic.

### 4. Validation (The Eval Loop)
- **Baseline Comparison**: Test the agent's performance on the task *without* the skill vs. *with* the skill.
- **Trigger Evals**: Generate 10-20 sample queries to ensure the description triggers the skill correctly.
- **Efficiency Check**: Ensure the skill doesn't bloat the context window unnecessarily.

## 🎨 Design Principles

1.  **Modular & Portable**: The skill should live in a self-contained folder.
2.  **Rationale-Focused**: Explain the *why* behind instructions, not just the *what*.
3.  **Error-Resilient**: Include a "Troubleshooting" or "Common Pitfalls" section.
4.  **Verifiable**: A skill is incomplete without a way for the agent to prove it worked.

## 🏗️ Folder Structure Template

```
skill-name/
├── SKILL.md              # Main playbook (keep it short)
├── references/           # Deep-dive references
│   └── topic.md
└── scripts/              # Deterministic automation scripts
    └── helper.sh
```

## ✅ Skill Completion Checklist

- [ ] Frontmatter `name` matches the folder name (kebab-case).
- [ ] `description` clearly states *when* the skill triggers.
- [ ] A clear **trigger condition** is defined.
- [ ] A **contract of output** is defined (what the agent produces).
- [ ] At least one **validation step** is included.
- [ ] The skill does not duplicate content from `CLAUDE.md` or `AGENTS.md`.
