import { logger } from '../utils/logger.js';
import { resolveMobileDir } from '../services/version.service.js';
import { generateKeystore } from '../services/keystore.service.js';

interface GenerateKeystoreOptions {
  firstName?: string;
  organization?: string;
  output?: string;
}

export async function generateKeystoreCommand(options: GenerateKeystoreOptions): Promise<void> {
  const firstName = options.firstName ?? '';
  const organization = options.organization ?? '';

  if (!firstName && !organization) {
    logger.error('You must provide at least --first-name or --organization.');
    process.exit(1);
  }

  const mobileDir = resolveMobileDir();
  await generateKeystore(mobileDir, firstName, organization, options.output);
}
