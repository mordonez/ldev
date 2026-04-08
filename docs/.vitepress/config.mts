import {defineConfig} from 'vitepress';

export default defineConfig({
  title: 'LDEV',
  description: 'Operational CLI for diagnosing, reproducing, and fixing Liferay environments',
  base: '/ldev/',
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    links: {
      externalLinkIcon: true,
    },
  },
  head: [
    ['link', {rel: 'icon', href: '/ldev/logo.svg'}],
    ['meta', {name: 'theme-color', content: '#0072ff'}],
  ],
  ignoreDeadLinks: [/http:\/\/localhost(:\d+)?/, /http:\/\/localhost:8080/],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      {text: 'Quickstart', link: '/getting-started/quickstart'},
      {text: 'First Incident', link: '/getting-started/first-incident'},
      {text: 'Workflows', link: '/workflows/diagnose-issue'},
      {text: 'Resources', link: '/workflows/export-import-resources'},
      {text: 'Commands', link: '/commands/'},
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          {text: 'Introduction', link: '/getting-started/introduction'},
          {text: 'Quickstart', link: '/getting-started/quickstart'},
          {text: 'First Incident', link: '/getting-started/first-incident'},
        ],
      },
      {
        text: 'Workflows',
        items: [
          {text: 'Diagnose an Issue', link: '/workflows/diagnose-issue'},
          {text: 'Fix an OSGi Bundle', link: '/workflows/fix-osgi-bundle'},
          {text: 'Reproduce a Production Issue', link: '/workflows/reproduce-production-issue'},
          {text: 'PaaS to Local Migration', link: '/workflows/paas-to-local-migration'},
          {text: 'Explore a Portal', link: '/workflows/explore-portal'},
          {text: 'Export and Import Resources', link: '/workflows/export-import-resources'},
          {text: 'Resource Migration Pipeline', link: '/workflows/resource-migration-pipeline'},
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          {text: 'Environments', link: '/core-concepts/environments'},
          {text: 'Discovery', link: '/core-concepts/discovery'},
          {text: 'Operations Model', link: '/core-concepts/operations'},
          {text: 'Structured Output', link: '/core-concepts/structured-output'},
        ],
      },
      {
        text: 'Commands',
        items: [
          {text: 'Overview', link: '/commands/'},
          {text: 'Runtime', link: '/commands/runtime'},
          {text: 'Discovery', link: '/commands/discovery'},
          {text: 'Data and Deploy', link: '/commands/data-and-deploy'},
          {text: 'Resources', link: '/commands/resources'},
          {text: 'Project and AI', link: '/commands/project-and-ai'},
          {text: 'Advanced', link: '/commands/advanced'},
        ],
      },
      {
        text: 'Agentic',
        items: [{text: 'Agent Workflows', link: '/agentic/'}],
      },
      {
        text: 'Advanced',
        items: [
          {text: 'Liferay Workspace', link: '/advanced/liferay-workspace'},
          {text: 'Worktrees', link: '/advanced/worktrees'},
          {text: 'Data Transfer', link: '/advanced/data-transfer'},
        ],
      },
      {
        text: 'Reference',
        items: [
          {text: 'Configuration', link: '/reference/configuration'},
          {text: 'FAQ', link: '/reference/faq'},
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    socialLinks: [{icon: 'github', link: 'https://github.com/mordonez/ldev'}],
    footer: {
      message:
        '@mordonezdev/ldev for operational Liferay maintenance workflows. Built by <a href="https://github.com/mordonez">Miguel Ordóñez</a>',
      copyright: 'Released under the Apache-2.0 License',
    },
  },
});
