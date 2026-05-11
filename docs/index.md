---
layout: home

title: ldev — Liferay, scriptable
description: A CLI for the Liferay operations that today only live in the admin UI — resource ops, structure migration, environment bootstrap, agent integration.

hero:
  name: ldev
  text: Liferay, scriptable.
  tagline: A CLI for the Liferay operations that today only live in the admin UI — import/export, structure migration, environment bootstrap, isolated worktrees, and an MCP server for AI agents.
  image:
    src: /logo.svg
    alt: ldev logo
  actions:
    - theme: brand
      text: What is ldev
      link: /getting-started/what-is-ldev
    - theme: alt
      text: Quickstart
      link: /getting-started/quickstart

features:
  - icon: "📁"
    title: Resource ops as files
    details: Export and import structures, templates, ADTs and fragments. Liferay only lets you do this through the UI — ldev makes it scriptable.
  - icon: "🔀"
    title: Structure migration
    details: Migrate journal articles when a structure changes. A workflow Liferay does not provide.
  - icon: "🤖"
    title: Made for agents
    details: An MCP server with 15 tools, structured JSON everywhere, project bootstrap. So an AI agent can actually operate Liferay.
---

<div class="home-shell">

<div class="install-band">

```bash
npm i -g @mordonezdev/ldev
```

</div>

<div class="features-band">
  <div class="feature-block">
    <div class="feature-header">
      <span class="feature-step">01</span>
      <h3 class="feature-title">Inspect in one pass</h3>
    </div>
    <div class="feature-content">

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

  </div>
  <p class="feature-desc">Consolidated portal context — sites, pages, structures and templates — in single structured calls. For humans, scripts and agents.</p>
  </div>

  <div class="feature-block">
    <div class="feature-header">
      <span class="feature-step">02</span>
      <h3 class="feature-title">Resources as files</h3>
    </div>
    <div class="feature-content">

```bash
ldev resource export-structures --all-sites
ldev resource import-structures --check-only
ldev resource import-structures --apply
```

  </div>
  <p class="feature-desc">Structures, templates, ADTs and fragments out of the UI and into Git. Preview with <code>--check-only</code>, then apply.</p>
  </div>

  <div class="feature-block">
    <div class="feature-header">
      <span class="feature-step">03</span>
      <h3 class="feature-title">Migrate structures</h3>
    </div>
    <div class="feature-content">

```bash
ldev resource migration-init --site /global --structure STR_ARTICLE
ldev resource migration-pipeline --migration-file STR_ARTICLE.migration.json --check-only --migration-dry-run
ldev resource migration-pipeline --migration-file STR_ARTICLE.migration.json
```

  </div>
  <p class="feature-desc">Plan, validate and run a structure migration with article-level mapping. The workflow Liferay does not give you.</p>
  </div>
</div>

<div class="agent-strip">
  <span class="agent-label">Built for agents</span>
  <p>JSON outputs, project bootstrap and an MCP server with 15 tools — so an agent can run the same workflows you run, without a custom integration. Start with <code>ldev ai install --target .</code>.</p>
  <a href="/ldev/agentic/" class="agent-link">Learn more →</a>
</div>

<div class="final-cta">
  <strong>ldev fills the automation gaps that Liferay does not.</strong>
  <div class="cta-actions">
    <a href="/ldev/getting-started/what-is-ldev" class="cta-btn primary">What is ldev</a>
    <a href="/ldev/getting-started/quickstart" class="cta-btn alt">Quickstart →</a>
  </div>
</div>

</div>

<style>
:root {
  --ldev-ink: #0f172a;
  --ldev-ink-soft: #475569;
  --ldev-line: rgba(15, 23, 42, 0.1);
  --ldev-accent: #0f766e;
  --ldev-accent-amber: #b45309;
}

/* ── Background ─────────────────────────────────── */
.VPHome {
  background:
    radial-gradient(ellipse 80% 40% at 10% 0%, rgba(20, 184, 166, 0.12), transparent),
    radial-gradient(ellipse 60% 35% at 90% 0%, rgba(245, 158, 11, 0.1), transparent),
    #f8fafc;
}

/* ── Hero ────────────────────────────────────────── */
.VPHome .VPHero .container { max-width: 1180px; }

.VPHome .VPHero .name {
  font-size: clamp(3.6rem, 8vw, 6rem) !important;
  line-height: 0.9 !important;
  letter-spacing: -0.09em;
  background: linear-gradient(135deg, #0f172a 40%, #0f766e);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.VPHome .VPHero .text {
  font-size: clamp(1.4rem, 3vw, 1.9rem) !important;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--ldev-ink) !important;
}

.VPHome .VPHero .tagline {
  max-width: 620px;
  font-size: 1rem !important;
  line-height: 1.5;
  color: var(--ldev-ink-soft) !important;
}

.VPHome .VPHero .image {
  filter: drop-shadow(0 24px 60px rgba(15, 23, 42, 0.14));
}

.VPHome .VPHero .image-container img,
.VPHome .VPHero .image img {
  width: min(180px, 20vw);
  height: auto;
}

/* ── Feature cards ───────────────────────────────── */
.VPHome .VPFeatures { padding-bottom: 0 !important; }
.VPHome .VPFeatures .container { max-width: 1100px; }

.VPHome .VPFeature {
  border: 1px solid var(--ldev-line) !important;
  border-radius: 20px !important;
  background: linear-gradient(160deg, rgba(255,255,255,0.95), rgba(255,255,255,0.7)) !important;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.06) !important;
  transition: box-shadow 0.2s, transform 0.2s;
}

.VPHome .VPFeature:hover {
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.1) !important;
  transform: translateY(-2px);
}

.VPHome .VPFeature .title { color: var(--ldev-ink); font-weight: 700; }
.VPHome .VPFeature .details { color: var(--ldev-ink-soft); }

/* ── Shell ───────────────────────────────────────── */
.home-shell {
  max-width: 1100px;
  margin: 0 auto 72px;
  padding: 0 24px;
}

/* ── Install band ────────────────────────────────── */
.install-band {
  margin: 32px auto 48px;
  max-width: 440px;
  text-align: center;
}

.install-band div[class*='language-'] {
  border-radius: 14px !important;
  border: 1px solid var(--ldev-line);
  box-shadow: 0 4px 20px rgba(15,23,42,0.08);
}

/* ── Feature blocks ──────────────────────────────── */
.features-band {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 48px;
}

.feature-block {
  border: 1px solid var(--ldev-line);
  border-radius: 20px;
  background: rgba(255,255,255,0.88);
  box-shadow: 0 4px 20px rgba(15,23,42,0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s, transform 0.2s;
}

.feature-block:hover {
  box-shadow: 0 12px 40px rgba(15,23,42,0.09);
  transform: translateY(-2px);
}

.feature-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 16px 18px 0;
}

.feature-step {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ldev-accent-amber);
}

.feature-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ldev-ink);
  border: none;
  padding: 0;
}

.feature-content {
  padding: 10px 14px 0;
  flex: 1;
}

.feature-content div[class*='language-'] {
  border-radius: 12px !important;
  margin: 0 !important;
}

.feature-desc {
  margin: 0 !important;
  padding: 12px 18px 18px;
  font-size: 0.85rem;
  color: var(--ldev-ink-soft);
  line-height: 1.6;
}

/* ── Agent strip ─────────────────────────────────── */
.agent-strip {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 14px 20px;
  margin-bottom: 16px;
  border: 1px solid var(--ldev-line);
  border-radius: 14px;
  background: rgba(255,255,255,0.6);
  flex-wrap: wrap;
}

.agent-label {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ldev-accent);
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.08);
}

.agent-strip p {
  margin: 0;
  flex: 1;
  font-size: 0.85rem;
  color: var(--ldev-ink-soft);
  line-height: 1.5;
  min-width: 200px;
}

.agent-strip code {
  font-size: 0.8rem;
}

.agent-link {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ldev-accent);
  text-decoration: none;
  white-space: nowrap;
}

.agent-link:hover { text-decoration: underline; }

/* ── Final CTA ───────────────────────────────────── */
.final-cta {
  text-align: center;
  padding: 40px 32px;
  border: 1px solid var(--ldev-line);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(20,184,166,0.07), rgba(245,158,11,0.07));
  box-shadow: 0 8px 40px rgba(15,23,42,0.06);
}

.final-cta strong {
  display: block;
  font-size: 1.1rem;
  color: var(--ldev-ink);
  margin-bottom: 24px;
}

.cta-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.cta-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 22px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.15s, transform 0.15s;
}

.cta-btn:hover { opacity: 0.85; transform: translateY(-1px); }

.cta-btn.primary {
  background: var(--ldev-accent);
  color: #fff;
}

.cta-btn.alt {
  background: rgba(15,23,42,0.06);
  color: var(--ldev-ink);
  border: 1px solid var(--ldev-line);
}

/* ── Responsive ──────────────────────────────────── */
@media (max-width: 960px) {
  .features-band { grid-template-columns: 1fr; }

  .VPHome .VPHero .name { font-size: 3rem !important; }
  .VPHome .VPHero .text { font-size: 1.3rem !important; }

  .home-shell { padding: 0 16px; }
}

@media (max-width: 640px) {
  .home-shell { margin-bottom: 48px; }
  .install-band { margin-bottom: 32px; }
  .features-band { margin-bottom: 32px; }
  .final-cta { padding: 28px 20px; }

  .VPHome .VPHero .image,
  .VPHome .VPHero .image-container { display: none !important; }

  .VPHome .VPFeatures { display: none !important; }

  .VPHome .VPHero .name { font-size: 2.6rem !important; }
  .VPHome .VPHero .text { font-size: 1.15rem !important; }
}
</style>
