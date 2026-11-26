// External tools the CLI shells out to: how to detect them, the oldest
// version the CLI is known to work with, and the exact install line on macOS
// (Homebrew) and Linux (Ubuntu/Debian apt). Verified against each tool's
// official docs/releases — see docs/INTEGRATIONS_AUDIT.md.

export interface ToolSpec {
  id: string;
  name: string;
  command: string;
  versionArgs: string[];
  /** Capture group 1 = version. Default: first x.y[.z] in the output. */
  versionPattern?: RegExp;
  min?: string;
  /** What needs it, for `kappmaker doctor`. */
  usedBy: string;
  platforms?: Array<'macos' | 'linux'>;
  /** Only some commands need it; `kappmaker doctor --strict` does not fail on it. */
  optional?: boolean;
  install: { macos: string; linux: string };
  upgrade?: { macos: string; linux: string };
}

const npmGlobal = (pkg: string) => ({ macos: `npm install -g ${pkg}`, linux: `npm install -g ${pkg}` });

export const TOOLS: ToolSpec[] = [
  {
    id: 'git',
    name: 'Git',
    command: 'git',
    versionArgs: ['--version'],
    min: '2.30.0',
    usedBy: 'create, clone, git setup-upstream',
    install: { macos: 'xcode-select --install   (or: brew install git)', linux: 'sudo apt-get install -y git' },
  },
  {
    id: 'firebase',
    name: 'Firebase CLI',
    command: 'firebase',
    versionArgs: ['--version'],
    min: '14.0.0',
    usedBy: 'create, firebase *',
    install: npmGlobal('firebase-tools'),
    upgrade: npmGlobal('firebase-tools@latest'),
  },
  {
    id: 'ruby',
    name: 'Ruby',
    command: 'ruby',
    versionArgs: ['--version'],
    min: '3.0.0',
    usedBy: 'fastlane (publish, android-release-build, fastlane configure)',
    install: {
      macos: 'brew install ruby   (then put $(brew --prefix ruby)/bin first on PATH)',
      linux: 'sudo apt-get install -y ruby-full build-essential',
    },
  },
  {
    id: 'bundler',
    name: 'Bundler (runs fastlane from the project Gemfile)',
    command: 'bundle',
    versionArgs: ['--version'],
    min: '2.3.0',
    usedBy: 'publish, android-release-build, fastlane configure',
    install: { macos: 'gem install bundler', linux: 'sudo gem install bundler' },
  },
  {
    id: 'java',
    name: 'JDK 17+ (keytool, Gradle)',
    command: 'java',
    versionArgs: ['-version'],
    versionPattern: /version "(\d+(?:\.\d+)*)/,
    min: '17',
    usedBy: 'generate-keystore, android-release-build, publish --platform android',
    install: { macos: 'brew install --cask temurin@17', linux: 'sudo apt-get install -y openjdk-17-jdk' },
  },
  {
    id: 'android-sdk',
    name: 'Android SDK',
    command: '',
    versionArgs: [],
    usedBy: 'create (local.properties), android-release-build',
    install: {
      macos: 'brew install --cask android-commandlinetools && sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"',
      linux:
        'download "Command line tools only" from https://developer.android.com/studio#command-line-tools-only into ~/Android/Sdk/cmdline-tools/latest, then sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"',
    },
  },
  {
    id: 'asc',
    optional: true,
    name: 'App Store Connect CLI (asc)',
    command: 'asc',
    versionArgs: ['--version'],
    min: '1.4.0',
    usedBy: 'create-appstore-app, appstore-*, subscription add, iap add',
    install: {
      macos: 'brew install asc',
      linux: 'curl -fsSL https://asccli.sh/install | bash',
    },
    upgrade: { macos: 'brew upgrade asc', linux: 'curl -fsSL https://asccli.sh/install | bash' },
  },
  {
    id: 'adapty',
    optional: true,
    name: 'Adapty CLI',
    command: 'adapty',
    versionArgs: ['--version'],
    versionPattern: /adapty\/(\d+\.\d+\.\d+)/,
    min: '0.1.5',
    usedBy: 'adapty setup, iap add',
    install: npmGlobal('adapty'),
    upgrade: npmGlobal('adapty@latest'),
  },
  {
    id: 'gh',
    optional: true,
    name: 'GitHub CLI (gh)',
    command: 'gh',
    versionArgs: ['--version'],
    min: '2.40.0',
    usedBy: 'ios-ci',
    install: {
      macos: 'brew install gh',
      linux: 'sudo apt-get install -y gh   (or the official repo: https://github.com/cli/cli/blob/trunk/docs/install_linux.md)',
    },
    upgrade: { macos: 'brew upgrade gh', linux: 'sudo apt-get install --only-upgrade -y gh' },
  },
  {
    id: 'ffmpeg',
    optional: true,
    name: 'ffmpeg (optional: looping WebP/GIF)',
    command: 'ffmpeg',
    versionArgs: ['-version'],
    usedBy: 'mascot-animate',
    install: { macos: 'brew install ffmpeg', linux: 'sudo apt-get install -y ffmpeg' },
  },
  {
    id: 'xcode',
    optional: true,
    name: 'Xcode (local iOS builds)',
    command: 'xcodebuild',
    versionArgs: ['-version'],
    min: '16.0',
    usedBy: 'publish --platform ios (without --remote)',
    platforms: ['macos'],
    install: {
      macos: 'install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app',
      linux: 'not available on Linux — build iOS on a GitHub macOS runner: kappmaker ios-ci init, then kappmaker publish --platform ios --remote',
    },
  },
];
