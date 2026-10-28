/** Read-only compatibility identifiers. All newly written state uses Visualy. */
export const legacyIdentity = {
  sessionCookie: 'scenzly_session',
  applicationRole: 'screnzly_app',
  mediaCachePrefix: 'scenzly-media-',
  shellCachePrefix: 'scenzly-shell-',
  checksumHeader: 'X-Screnzly-Checksum',
  storage: {
    'visualy-language': 'screnzly-language',
    'visualy-theme': 'screnzly-theme',
    'visualy-player-token': 'scenzly-player-token',
    'visualy-device-id': 'scenzly-device-id',
    'visualy-maintenance': 'scenzly-maintenance',
    'visualy-manifest': 'scenzly-manifest',
  },
} as const;

/** Move once on the same origin; never overwrite a newer Visualy choice. */
export function migrateBrowserStorage() {
  for (const [current, previous] of Object.entries(legacyIdentity.storage)) {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return;
      const value = storage.getItem(previous);
      if (value === null) continue;
      if (storage.getItem(current) === null) storage.setItem(current, value);
      storage.removeItem(previous);
    } catch { /* Preserve the old value when storage is unavailable or full. */ }
  }
}
export function removeBrowserItem(key: keyof typeof legacyIdentity.storage) {
  localStorage.removeItem(key);
  localStorage.removeItem(legacyIdentity.storage[key]);
}
export function sessionToken(cookies: Record<string, string | undefined>) {
  return cookies.visualy_session || cookies[legacyIdentity.sessionCookie];
}
