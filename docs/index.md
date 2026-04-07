---
layout: home

title: Advanced Liferay Local Development
description: Agentic CLI for Liferay local runtimes, portal discovery, and OAuth2 bootstrap. Built for humans and coding agents.

hero:
  name: ldev
  text: Liferay environment as code.
  tagline: "STATUS: OPERATIONAL // THE AGENTIC BACKBONE FOR LIFERAY"
  image:
    src: /logo.svg
    alt: ldev logo
  actions:
    - theme: theme
      text: Installation
      link: /install
    - theme: alt
      text: GitHub
      link: https://github.com/mordonez/ldev

features:
  - title: 01. DIAGNOSTIC
    details: "`ldev doctor` understands the full Liferay/Docker chain, identifying misconfigurations instantly."
  - title: 02. DISCOVERY
    details: "Explore sites, pages, and fragments without a browser using `ldev portal inventory`."
  - title: 03. AUTOMATION
    details: "Stable JSON output and context snapshots for CI/CD pipelines and coding agents."
---

<div class="home-content-extra">

## The Daily Loop

```bash
# Validate, start, and inspect
ldev doctor
ldev start
ldev portal inventory page --url /home --json
```

## Engineering Pipeline

<div class="pipeline-text">

[**doctor**](/commands#project-setup) (validate) &nbsp;→&nbsp; [**env**](/commands#runtime-control) (boot) &nbsp;→&nbsp; [**portal**](/commands#portal-inspection) (inspect) &nbsp;→&nbsp; [**resource**](/commands#content-resources) (sync)

</div>

---

<div class="footer-links">

### [Commands](/commands) &nbsp; | &nbsp; [Capabilities](/capabilities) &nbsp; | &nbsp; [Quickstart](/quickstart)

</div>

</div>

<style scoped>
/* Scoped styles for Home Layout components */
:deep(.VPHero) {
  text-align: center !important;
}
:deep(.VPHero .container) {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}
:deep(.VPHero .name) {
  font-size: 5rem !important;
  letter-spacing: -4px !important;
  text-transform: uppercase;
}
:deep(.VPHero .tagline) {
  font-family: var(--vp-font-family-mono);
  font-size: 13px !important;
  letter-spacing: 3px;
  opacity: 0.7;
}
:deep(.VPFeature) {
  background: transparent !important;
  border: none !important;
  border-left: 1px solid var(--vp-c-divider) !important;
  border-radius: 0 !important;
}

/* Scoped styles for custom markdown content */
.home-content-extra h2 {
  text-align: center;
  font-family: var(--vp-font-family-mono);
  font-size: 1.2rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-top: 60px !important;
  border: none;
  color: var(--vp-c-text-2);
}

.home-content-extra .pipeline-text {
  text-align: center;
  font-family: var(--vp-font-family-mono);
  font-size: 0.9rem;
  opacity: 0.8;
  margin: 20px 0;
}

.home-content-extra .pipeline-text a {
  text-decoration: none;
  color: inherit;
  transition: color 0.2s;
}

.home-content-extra .pipeline-text a:hover {
  color: var(--vp-c-brand);
}

.home-content-extra .pipeline-text strong {
  color: var(--vp-c-brand);
}

.home-content-extra .footer-links {
  text-align: center;
  margin-top: 40px;
}

.home-content-extra .footer-links h3 {
  margin: 0;
  border: none;
}
</style>
