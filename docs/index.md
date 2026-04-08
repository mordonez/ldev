---
layout: home

title: Fix Liferay issues faster
description: Operational CLI for diagnosing, reproducing, and resolving Liferay maintenance incidents.

hero:
  name: Fix Liferay issues faster
  text: Diagnose the incident, reproduce production locally, apply the fix safely, and verify before touching production.
  image:
    src: /logo.svg
    alt: ldev logo
  actions:
    - theme: theme
      text: Start Here
      link: /quickstart
    - theme: alt
      text: Command Reference
      link: /commands

features:
  - title: Understand the portal
    details: Inspect sites, pages, URLs, and page context directly from the CLI.
  - title: Bring production local
    details: Reproduce real incidents in controlled Docker and worktree environments.
  - title: Fix safely
    details: Diagnose, deploy, inspect OSGi, and verify the result before production is affected.
---

<div class="home-shell">

<div class="hero-terminal">

```bash
ldev doctor
ldev start
ldev logs diagnose --json
ldev deploy --module my-module
```

</div>

<p class="subhero">
From first symptom to verified fix, without living in the UI.
</p>

<div class="signal-grid compact">
  <div class="signal-card">
    <span class="signal-label">Problem</span>
    <p>Incidents start with vague symptoms, environment drift, and too much UI-driven investigation.</p>
  </div>
  <div class="signal-card">
    <span class="signal-label">Solution</span>
    <p><code>ldev</code> gives you one CLI to inspect the portal, reproduce the issue locally, fix it safely, and verify the result.</p>
  </div>
</div>

## Solve Incidents, Not Screens

Liferay maintenance work often starts with a vague symptom and too much clicking. You open the UI to find which site owns a page, inspect logs that are too broad to trust, and compare against a local setup that does not really match production.

`ldev` changes that operating model. It gives you one CLI for incident work: inspect portal structure, diagnose failures, reproduce the issue locally, and verify the fix with real context.

## Bring Real Issues Into a Controlled Environment

<div class="signal-grid compact">
  <div class="signal-card">
    <span class="signal-label">Production → Local</span>
    <p>Reproduce production issues locally with Docker and worktrees so you can debug the real problem instead of a rough approximation.</p>
  </div>
  <div class="signal-card">
    <span class="signal-label">Safe Changes</span>
    <p>Test the fix in a controlled environment first, confirm the outcome, and only then carry the change back to production.</p>
  </div>
</div>

## Discovery Without the UI

<div class="discovery-panel">

```bash
ldev portal inventory sites
ldev portal inventory pages
ldev portal inventory page --url /home --json
```

<p>
Inspect Liferay without opening the UI. See sites and pages immediately, resolve what a URL maps to, and get structured output that works for humans, automation, and agents.
</p>

</div>

## Who Is This For

<div class="signal-grid compact">
  <div class="signal-card">
    <span class="signal-label">Users</span>
    <p>Developers fixing bugs, consultants handling incidents, and teams tired of debugging Liferay through the UI.</p>
  </div>
  <div class="signal-card">
    <span class="signal-label">Why Teams Use It</span>
    <p>Less UI dependency, less environment drift, and clearer handoff during maintenance work.</p>
  </div>
</div>

## Incident Workflow

<div class="workflow-grid">
  <div class="workflow-step">
    <span>01</span>
    <h3>Understand</h3>
    <p>Use <code>ldev portal inventory</code> to find sites, pages, and exact context.</p>
  </div>
  <div class="workflow-step">
    <span>02</span>
    <h3>Diagnose</h3>
    <p>Use <code>ldev logs</code> and <code>ldev doctor</code> to isolate failures quickly.</p>
  </div>
  <div class="workflow-step">
    <span>03</span>
    <h3>Fix</h3>
    <p>Use <code>ldev deploy</code> and <code>ldev osgi</code> to change code and runtime state safely.</p>
  </div>
  <div class="workflow-step">
    <span>04</span>
    <h3>Verify</h3>
    <p>Use <code>ldev portal check</code> and <code>ldev context</code> to confirm the expected state before production is affected.</p>
  </div>
</div>

<p class="workflow-close">Less UI exploration, less environment drift, and less time between symptom and verified fix.</p>

## Example

<div class="quickstart-band">

```bash
ldev logs diagnose --json
ldev osgi list
ldev deploy --module my-module
ldev context
```

<p>A bundle is not working. Diagnose the symptom, inspect runtime state, deploy the module, and confirm the environment you actually fixed. From symptom to verified fix — without guesswork.</p>

</div>

## Quickstart

<div class="quickstart-band">

```bash
npm i -g @mordonezdev/ldev

ldev project init --name my-project --dir .
ldev start
ldev doctor
```

<p>Start the environment, run the checks, and begin from the CLI.</p>

</div>

## Agents

`ldev` exposes JSON outputs, context snapshots, and machine-readable portal data so scripts and agents can work from the same operational state as the developer.

Agents are secondary. They are useful because the system is already inspectable and scriptable.

<div class="final-statement">
  <strong>ldev turns Liferay into a scriptable, inspectable, and operable system.</strong>
</div>

</div>

<style>
:root {
  --ldev-ink: #0f172a;
  --ldev-ink-soft: #334155;
  --ldev-line: rgba(15, 23, 42, 0.12);
  --ldev-panel: rgba(255, 255, 255, 0.78);
  --ldev-panel-strong: rgba(255, 255, 255, 0.94);
  --ldev-accent: #0f766e;
  --ldev-accent-2: #b45309;
  --ldev-warm: #fff7ed;
  --ldev-cool: #ecfeff;
}

.VPHome {
  background:
    radial-gradient(circle at top left, rgba(20, 184, 166, 0.14), transparent 32%),
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 28%),
    linear-gradient(180deg, #f8fafc 0%, #fffdf8 48%, #f8fafc 100%);
}

.VPHome .VPHero .container {
  max-width: 1180px;
}

.VPHome .VPHero .name {
  font-size: clamp(3rem, 7vw, 5.4rem) !important;
  line-height: 0.95 !important;
  letter-spacing: -0.08em;
  color: var(--ldev-ink);
}

.VPHome .VPHero .text {
  max-width: 620px;
  font-size: 1.05rem !important;
  line-height: 1.45;
  color: var(--ldev-ink-soft);
}

.VPHome .VPHero .image {
  filter: drop-shadow(0 20px 50px rgba(15, 23, 42, 0.12));
}

.VPHome .VPHero .image-container img,
.VPHome .VPHero .image img {
  width: min(200px, 22vw);
  height: auto;
}

.VPHome .VPFeature {
  border: 1px solid var(--ldev-line) !important;
  border-radius: 20px !important;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.72)) !important;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.06);
}

.VPHome .VPFeature .title {
  color: var(--ldev-ink);
}

.VPHome .VPFeatures {
  padding-top: 2px !important;
  padding-bottom: 2px !important;
}

.VPHome .VPFeatures .container {
  max-width: 1100px;
}

.home-shell {
  max-width: 1100px;
  margin: 6px auto 64px;
  padding: 0 24px;
}

.hero-terminal {
  margin: 30px auto 18px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.96));
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}

.hero-terminal div[class*='language-'],
.discovery-panel div[class*='language-'],
.quickstart-band div[class*='language-'] {
  margin: 0;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  overflow: hidden;
}

.hero-terminal pre {
  margin: 0;
  padding: 16px 20px;
  background: transparent;
}

.hero-terminal div[class*='language-'] pre,
.discovery-panel div[class*='language-'] pre,
.quickstart-band div[class*='language-'] pre {
  margin: 0;
  padding: 16px 18px;
}

.hero-terminal div[class*='language-'] code,
.discovery-panel div[class*='language-'] code,
.quickstart-band div[class*='language-'] code {
  display: block;
  min-width: 0;
}

.hero-terminal div[class*='language-'] .copy,
.discovery-panel div[class*='language-'] .copy,
.quickstart-band div[class*='language-'] .copy {
  top: 8px;
  right: 8px;
}

.subhero {
  max-width: 760px;
  margin: 0 auto 14px;
  text-align: center;
  font-size: 1.05rem;
  line-height: 1.45;
  color: var(--ldev-ink);
  font-weight: 600;
}

.signal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 10px 0 28px;
}

.signal-grid.compact .signal-card {
  padding: 18px 20px;
}

.signal-card,
.discovery-panel,
.workflow-step,
.quickstart-band,
.final-statement {
  border: 1px solid var(--ldev-line);
  border-radius: 26px;
  background: var(--ldev-panel);
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.06);
}

.signal-card {
  padding: 26px;
}

.signal-card p,
.discovery-panel p,
.workflow-step p,
.quickstart-band p {
  margin: 0;
  color: var(--ldev-ink-soft);
  line-height: 1.7;
}

.signal-label {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--ldev-accent);
  background: rgba(20, 184, 166, 0.1);
}

.discovery-panel {
  padding: 14px 16px 16px;
  margin: 8px 0 28px;
  background:
    linear-gradient(135deg, rgba(236, 254, 255, 0.82), rgba(255, 247, 237, 0.76));
}

.discovery-panel div[class*='language-'] {
  margin-bottom: 12px;
}

.discovery-panel pre {
  border-radius: 18px;
  margin-top: 0;
  margin-bottom: 10px;
}

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0 12px;
}

.workflow-step {
  padding: 18px;
  background: var(--ldev-panel-strong);
}

.workflow-step span {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--ldev-accent-2);
  letter-spacing: 0.08em;
}

.workflow-step h3 {
  margin: 10px 0 8px;
  font-size: 1.1rem;
  color: var(--ldev-ink);
}

.workflow-close {
  margin: 0 0 28px;
  font-size: 1rem;
  color: var(--ldev-ink);
  text-align: center;
  font-weight: 600;
}

.quickstart-band {
  padding: 14px 16px 16px;
  margin: 8px 0 20px;
  background:
    linear-gradient(135deg, rgba(255, 247, 237, 0.84), rgba(255, 255, 255, 0.92));
}

.quickstart-band div[class*='language-'] {
  margin-bottom: 12px;
}

.quickstart-band pre {
  border-radius: 18px;
  margin-top: 0;
  margin-bottom: 10px;
}

.final-statement {
  margin-top: 18px;
  padding: 22px;
  text-align: center;
  font-size: 1.12rem;
  line-height: 1.4;
  color: var(--ldev-ink);
  background:
    linear-gradient(135deg, rgba(20, 184, 166, 0.1), rgba(245, 158, 11, 0.1));
}

@media (max-width: 960px) {
  .signal-grid,
  .workflow-grid {
    grid-template-columns: 1fr;
  }

  .home-shell {
    margin-top: 0;
    padding-left: 14px;
    padding-right: 14px;
  }

  .subhero {
    font-size: 0.96rem;
    margin-bottom: 16px;
  }

  .VPHome .VPHero .container {
    padding-top: 24px;
  }

  .VPHome .VPHero .name {
    font-size: 2.2rem !important;
    letter-spacing: -0.05em;
  }

  .VPHome .VPHero .text {
    font-size: 0.96rem !important;
    line-height: 1.4;
  }

  .VPHome .VPFeature {
    border-radius: 18px !important;
  }

  .hero-terminal pre {
    padding: 16px;
  }

  .hero-terminal div[class*='language-'] pre,
  .discovery-panel div[class*='language-'] pre,
  .quickstart-band div[class*='language-'] pre {
    padding: 16px 16px 18px;
  }

  .workflow-close {
    font-size: 0.95rem;
  }
}

@media (max-width: 640px) {
  .VPHome .VPHero .image,
  .VPHome .VPHero .image-container,
  .VPHome .VPHero .image-src {
    display: none !important;
  }

  .VPHome .VPFeatures {
    display: none !important;
  }

  .VPHome .VPHero .container {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .VPHome .VPHero .main {
    max-width: 100%;
  }

  .home-shell {
    margin-top: 0;
    margin-bottom: 52px;
  }

  .hero-terminal {
    margin-top: 6px;
    margin-bottom: 14px;
    border-radius: 18px;
  }

  .hero-terminal div[class*='language-'],
  .discovery-panel div[class*='language-'],
  .quickstart-band div[class*='language-'] {
    border-radius: 14px;
  }

  .signal-grid {
    margin-bottom: 24px;
  }

  .discovery-panel,
  .quickstart-band,
  .workflow-step,
  .signal-grid.compact .signal-card,
  .final-statement {
    border-radius: 18px;
  }

  .discovery-panel {
    margin-bottom: 24px;
  }

  .workflow-close {
    margin-bottom: 26px;
  }
}
</style>
