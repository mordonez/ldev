import {defineConfig} from 'vitepress';

export default defineConfig({
  title: 'ldev',
  description: 'Liferay local development CLI',
  base: '/ldev/',
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    links: {
      externalLinkIcon: true,
    },
  },
  ignoreDeadLinks: [
    // Example localhost links in documentation, not real dead links
    /http:\/\/localhost:\d+/,
  ],
  themeConfig: {
    nav: [
      {text: 'Install', link: '/install'},
      {text: 'Quickstart', link: '/quickstart'},
      {text: 'First Run', link: '/first-run-walkthrough'},
      {text: 'AI Skills', link: '/skills'},
      {text: 'Commands', link: '/commands'},
      {text: 'Troubleshooting', link: '/troubleshooting'},
      {text: 'GitHub', link: 'https://github.com/mordonez/ldev'},
    ],
    sidebar: [
      {
        text: 'Get Started',
        items: [
          {text: 'Home', link: '/'},
          {text: 'Install', link: '/install'},
          {text: 'Quickstart', link: '/quickstart'},
          {text: 'First Run Walkthrough', link: '/first-run-walkthrough'},
          {text: 'Key Capabilities', link: '/capabilities'},
          {text: 'Support Matrix', link: '/support-matrix'},
          {text: 'Upgrading', link: '/upgrading'},
          {text: 'FAQ', link: '/faq'},
        ],
      },
      {
        text: 'Reference',
        items: [
          {text: 'Commands', link: '/commands'},
          {text: 'Configuration', link: '/configuration'},
          {text: 'OAuth2 Scopes', link: '/oauth-scopes'},
          {text: 'API Surfaces', link: '/api-surfaces'},
          {text: 'MCP Liferay Capability Matrix', link: '/mcp-liferay-capability-matrix'},
          {text: 'Troubleshooting', link: '/troubleshooting'},
        ],
      },
      {
        text: 'Advanced',
        items: [
          {text: 'PaaS to Local Migration', link: '/paas-to-local-migration'},
          {text: 'Worktree Environments', link: '/worktree-environments'},
          {text: 'AI Integration', link: '/ai-integration'},
          {text: 'Portal Inventory', link: '/portal-inventory'},
          {text: 'Resource Migration Pipeline', link: '/resource-migration-pipeline'},
          {text: 'Automation', link: '/automation'},
        ],
      },
      {
        text: 'Technical & Project',
        items: [
          {text: 'Architecture', link: '/architecture'},
          {text: 'API Surfaces', link: '/api-surfaces'},
          {text: 'MCP Strategy', link: '/mcp-strategy'},
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
      message: 'Focused local tooling for Liferay environments.',
      copyright: 'Released under the Apache-2.0 License',
    },
  },
});
