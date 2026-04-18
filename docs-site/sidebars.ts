import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'configuration',
    {
      type: 'category',
      label: 'Project Setup',
      link: {type: 'generated-index', description: 'Create, configure, and manage your mobile app project.'},
      items: [
        'project-setup/create',
        'project-setup/refactor',
        'project-setup/update-version',
      ],
    },
    {
      type: 'category',
      label: 'Store Publishing',
      link: {type: 'generated-index', description: 'Set up and publish to the App Store and Google Play.'},
      items: [
        'store-publishing/create-appstore-app',
        'store-publishing/google-play-console',
        'store-publishing/adapty-setup',
        'store-publishing/publish',
      ],
    },
    {
      type: 'category',
      label: 'Build & Signing',
      link: {type: 'generated-index', description: 'Build signed release binaries and configure Fastlane.'},
      items: [
        'build-signing/fastlane-configure',
        'build-signing/generate-keystore',
        'build-signing/android-release-build',
      ],
    },
    {
      type: 'category',
      label: 'AI & Image Tools',
      link: {type: 'generated-index', description: 'Generate logos, screenshots, and process images with AI.'},
      items: [
        'ai-image-tools/create-logo',
        'ai-image-tools/generate-image',
        'ai-image-tools/screenshots',
        'ai-image-tools/image-tools',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      link: {type: 'generated-index', description: 'Setup guides and integrations.'},
      items: [
        'guides/external-services',
        'guides/custom-templates',
        'guides/claude-code-skill',
      ],
    },
  ],
};

export default sidebars;
