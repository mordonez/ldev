import path from 'node:path';

import fs from 'fs-extra';

export const ACTIVATION_KEY_PATTERN = /^activation-key-.*\.xml$/i;

export type ActivationKeyInfo = {
  productVersion: string | null;
  licenseType: string | null;
  startDate: string | null;
  expirationDate: string | null;
  /** null when the dates cannot be read. */
  expired: boolean | null;
};

export function isActivationKeyFileName(filePath: string): boolean {
  return ACTIVATION_KEY_PATTERN.test(path.basename(filePath));
}

/**
 * Read the non-secret metadata of a DXP activation key (dates, type, version).
 * Returns null when the file is not a readable license XML.
 */
export function readActivationKeyInfo(filePath: string, now: Date = new Date()): ActivationKeyInfo | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  if (!/<license>/.test(content)) {
    return null;
  }

  const expirationDate = readTag(content, 'expiration-date');
  const expiresAt = expirationDate ? Date.parse(expirationDate) : Number.NaN;

  return {
    productVersion: readTag(content, 'product-version'),
    licenseType: readTag(content, 'license-type'),
    startDate: readTag(content, 'start-date'),
    expirationDate: Number.isNaN(expiresAt) ? expirationDate : new Date(expiresAt).toISOString(),
    expired: Number.isNaN(expiresAt) ? null : expiresAt < now.getTime(),
  };
}

function readTag(content: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(content);
  return match?.[1]?.trim() || null;
}
