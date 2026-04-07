import {defineConfig} from 'vitepress';

export default defineConfig({
  title: 'LDEV',
  description: 'Advanced Liferay local development CLI',
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
      {text: 'Install', link: '/install'},
      {text: 'Quickstart', link: '/quickstart'},
      {text: 'Commands', link: '/commands'},
      {text: 'Troubleshooting', link: '/troubleshooting'},
    ],
    sidebar: [
      {
        text: '🚀 Getting Started',
        items: [
          {text: 'Introduction', link: '/'},
          {text: 'Installation', link: '/install'},
          {text: 'Quickstart', link: '/quickstart'},
          {text: 'First Run Walkthrough', link: '/first-run-walkthrough'},
          {text: 'Key Capabilities', link: '/capabilities'},
          {text: 'Support Matrix', link: '/support-matrix'},
          {text: 'Upgrading', link: '/upgrading'},
          {text: 'FAQ', link: '/faq'},
        ],
      },
      {
        text: '📖 Reference',
        items: [
          {text: 'Command Reference', link: '/commands'},
          {text: 'Configuration', link: '/configuration'},
          {text: 'OAuth2 Scopes', link: '/oauth-scopes'},
          {text: 'API Surfaces', link: '/api-surfaces'},
          {text: 'Capability Matrix', link: '/mcp-liferay-capability-matrix'},
          {text: 'Troubleshooting', link: '/troubleshooting'},
        ],
      },
      {
        text: '⚡ Advanced Workflows',
        items: [
          {text: 'PaaS to Local Migration', link: '/paas-to-local-migration'},
          {text: 'Worktree Environments', link: '/worktree-environments'},
          {text: 'AI Integration', link: '/ai-integration'},
          {text: 'Portal Inventory', link: '/portal-inventory'},
          {text: 'Resource Migration Pipeline', link: '/resource-migration-pipeline'},
          {text: 'Automation Contract', link: '/automation'},
        ],
      },
      {
        text: '🏗️ Technical Design',
        items: [
          {text: 'Architecture', link: '/architecture'},
          {text: 'Liferay Domain', link: '/liferay-domain'},
          {text: 'Contributing', link: '/contributing'},
          {text: 'Releasing', link: '/releasing'},
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    socialLinks: [{icon: 'github', link: 'https://github.com/mordonez/ldev'}],
    footer: {
      message:
        '@mordonezdev/ldev - Agentic CLI for Liferay development and automation. Desarrollado por <a href="https://github.com/mordonez">Miguel Ordóñez</a>',
      copyright: 'Released under the Apache-2.0 License',
    },
  },
});
