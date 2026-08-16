export interface IosCiConfig {
  provider: 'github';
  /** "owner/repo" holding the app. */
  repo: string;
  /** Directory containing the Xcode project + fastlane, relative to the repo root. */
  mobile_dir: string;
  bundle_id: string;
  /** Set once init has pushed every required secret. */
  secrets_configured?: boolean;
}

export interface IosCiInitOptions {
  repo?: string;
  matchPassword?: string;
  mobileDir?: string;
  /** Write files but don't touch GitHub (no repo creation, no secrets). */
  dryRun?: boolean;
}

export interface IosCiBuildOptions {
  track?: string;
  submitForReview?: boolean;
  uploadMetadata?: boolean;
  uploadScreenshots?: boolean;
  /** Fire the build and return instead of polling to completion. */
  noWait?: boolean;
  ref?: string;
}
