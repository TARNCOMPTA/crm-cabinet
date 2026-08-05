const SAFE_PROTOCOLS = ['http:', 'https:'];

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function getSafeHref(url: string): string | null {
  return isSafeUrl(url) ? url : null;
}
