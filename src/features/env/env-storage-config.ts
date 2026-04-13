export function detectStoragePlatform(envValues: Record<string, string>): 'windows' | 'other' {
  const override = envValues.LDEV_STORAGE_PLATFORM?.trim().toLowerCase();
  if (override === 'windows') {
    return 'windows';
  }
  if (override === 'linux' || override === 'macos' || override === 'other') {
    return 'other';
  }

  return process.platform === 'win32' ? 'windows' : 'other';
}
