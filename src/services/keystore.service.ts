import path from 'path';
import crypto from 'crypto';
import fs from 'fs-extra';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';

const KEY_ALIAS = 'aliasKey';
const KEY_VALIDITY = 10000;

export interface KeystoreResult {
  keystorePath: string;
  propertiesPath: string;
}

export async function hasKeystore(mobileDir: string): Promise<boolean> {
  const propsPath = path.join(mobileDir, 'distribution', 'android', 'keystore', 'keystore.properties');
  return fs.pathExists(propsPath);
}

export async function generateKeystore(
  mobileDir: string,
  firstName: string,
  organization: string,
  outputDir?: string,
): Promise<KeystoreResult> {
  const keystoreDir = outputDir
    ? path.resolve(outputDir)
    : path.join(mobileDir, 'distribution', 'android', 'keystore');

  const keystorePath = path.join(keystoreDir, 'keystore.jks');
  const propertiesPath = path.join(keystoreDir, 'keystore.properties');

  await fs.ensureDir(keystoreDir);

  const password = crypto.randomBytes(18).toString('base64url').slice(0, 24);

  await run(
    'keytool',
    [
      '-genkeypair',
      '-v',
      '-keystore', keystorePath,
      '-storepass', password,
      '-alias', KEY_ALIAS,
      '-keypass', password,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', String(KEY_VALIDITY),
      '-dname', `CN=${firstName}, O=${organization}`,
    ],
    { label: 'Generating Android keystore' },
  );

  const propsContent = [
    `keystorePassword=${password}`,
    `keyPassword=${password}`,
    `keyAlias=${KEY_ALIAS}`,
    `storeFile=../distribution/android/keystore/keystore.jks`,
    '',
  ].join('\n');

  await fs.writeFile(propertiesPath, propsContent, 'utf8');
  logger.success(`Keystore: ${keystorePath}`);
  logger.success(`Properties: ${propertiesPath}`);

  return { keystorePath, propertiesPath };
}
