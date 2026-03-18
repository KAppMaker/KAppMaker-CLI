export interface CreateOptions {
  templateRepo?: string;
  organization?: string;
}

export interface DerivedConfig {
  appName: string;
  appIdLower: string;
  packageName: string;
  firebaseProject: string;
  targetDir: string;
  templateRepo: string;
}

export interface FirebaseAppResult {
  appId: string;
  platform: 'ANDROID' | 'IOS';
}

export interface StepContext {
  config: DerivedConfig;
  mobileDir: string;
}

export interface KAppMakerConfig {
  templateRepo: string;
  bundleIdPrefix: string;
  androidSdkPath: string;
  organization: string;
  falApiKey: string;
  openaiApiKey: string;
}
