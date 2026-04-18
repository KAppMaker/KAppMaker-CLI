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
  imgbbApiKey: string;
  openaiApiKey: string;
  ascAuthName: string;
  ascKeyId: string;
  ascIssuerId: string;
  ascPrivateKeyPath: string;
  appleId: string;
  googleServiceAccountPath: string;
}

export interface CreateLogoOptions {
  output?: string;
  prompt?: string;
}

export interface SplitOptions {
  rows?: number;
  cols?: number;
  zoom?: number;
  gap?: number;
  outputDir?: string;
  width?: number;
  height?: number;
  keep?: number[];
}

export interface ExtractOptions {
  zoom?: number;
  gap?: number;
}

export interface RemoveBgOptions {
  output?: string;
}

export interface EnhanceOptions {
  output?: string;
}

export interface TranslateScreenshotsOptions {
  output?: string;
  locales?: string[];
  rows?: number;
  cols?: number;
  resolution?: string;
  pollInterval?: number;
}

export interface GenerateScreenshotsOptions {
  prompt: string;
  input?: string;
  style?: number;
  output?: string;
  resolution?: string;
  rows?: number;
  cols?: number;
  pollInterval?: number;
}

export interface FalQueueResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

export interface GenerateImageOptions {
  prompt: string;
  output?: string;
  numImages?: number;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  reference?: string[];
}

export interface ImageGenerationParams {
  prompt: string;
  imageUrls?: string[];
  numImages?: number;
  resolution?: string;
  aspectRatio?: string;
  outputFormat?: string;
}
