/** Converts a site friendly URL to a safe filesystem directory token. */
export function resolveSiteToken(siteFriendlyUrl: string): string {
  const token = siteFriendlyUrl.replace(/^\//, '').trim();
  return token === '' ? 'global' : token;
}

/** Inverse of resolveSiteToken: converts a directory token back to a site friendly URL. */
export function siteTokenToFriendlyUrl(token: string): string {
  return token === 'global' ? '/global' : `/${token}`;
}
