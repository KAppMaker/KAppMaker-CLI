import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'KAppMaker CLI',
  tagline: 'Automate mobile app bootstrapping — from project scaffolding to store-ready builds',
  favicon: 'img/favicon.ico',

  url: 'https://cli.kappmaker.com',
  baseUrl: '/',

  organizationName: 'KAppMaker',
  projectName: 'KAppMaker-CLI',

  onBrokenLinks: 'throw',

  future: {
    v4: true,
    faster: true,
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/KAppMaker/KAppMaker-CLI/tree/main/docs-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'KAppMaker CLI',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://kappmaker.com',
          label: 'KAppMaker',
          position: 'right',
        },
        {
          href: 'https://github.com/KAppMaker/KAppMaker-CLI',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Getting Started', to: '/'},
            {label: 'Project Setup', to: '/project-setup/create'},
            {label: 'Configuration', to: '/configuration'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'KAppMaker', href: 'https://kappmaker.com'},
            {label: 'GitHub', href: 'https://github.com/KAppMaker/KAppMaker-CLI'},
            {label: 'npm', href: 'https://www.npmjs.com/package/kappmaker'},
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} KAppMaker.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
