import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashBytes, verifyAsset, mediaUrl, prepareManifest, storedManifest, clearOffline } from './offline';
import type { Manifest, Media } from '@visualy/shared';

const data = new TextEncoder().encode('verified media content').buffer;
const checksum = createHash('sha256').update(new Uint8Array(data)).digest('hex');
const media: Media = { id: 'media-1', name: 'Image', mime: 'image/png', size: data.byteLength, url: '/api/v1/media/media-1/file', checksum, createdAt: '2026-01-01T00:00:00Z' };
function manifest(revision = 'one'): Manifest { return { revision, serverTime: '2026-01-01T00:00:00Z', screen: { id: 'screen-1', name: 'Hall', orientation: 'landscape' }, fallbackProgramId: null, programs: [], schedules: [], media: [media] }; }
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const cacheEntries = new Map<string, Map<string, Response>>();
  const cacheStorage = {
    async open(name: string) {
      if (!cacheEntries.has(name)) cacheEntries.set(name, new Map());
      const entries = cacheEntries.get(name)!;
      return { put: async (key: string, response: Response) => { entries.set(key, response.clone()); }, match: async (key: string) => entries.get(key)?.clone() };
    },
    async match(key: string) { for (const entries of cacheEntries.values()) { const found = entries.get(key); if (found) return found.clone(); } },
    async keys() { return [...cacheEntries.keys()]; },
    async delete(name: string) { return cacheEntries.delete(name); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'caches', { value: cacheStorage, configurable: true });
  Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true });
  return { storage, cacheStorage, cacheEntries };
}
test('SHA-256 verification rejects corrupted data and missing checksums', () => {
  assert.equal(hashBytes(data), checksum);
  assert.doesNotThrow(() => verifyAsset(data, checksum));
  assert.throws(() => verifyAsset(data, '0'.repeat(64)), /Intégrité/);
  assert.throws(() => verifyAsset(data, ''), /Intégrité/);
});
test('media URL cannot send a player token to external hosts or another API path', () => {
  assert.equal(mediaUrl(media, 'secret token'), '/api/v1/media/media-1/file?token=secret%20token');
  assert.throws(() => mediaUrl({ ...media, url: 'https://other.example/file' }, 'token'), /non autorisée/);
  assert.throws(() => mediaUrl({ ...media, url: '/api/v1/users' }, 'token'), /non autorisée/);
});
test('only a fully verified manifest is activated and survives offline reload', async () => {
  setup(); const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(data);
    const first = await prepareManifest(manifest(), 'token');
    assert.equal(first.durable, true); assert.ok(first.urls[media.id].startsWith('blob:')); assert.equal(storedManifest()?.revision, 'one'); first.release();
    globalThis.fetch = async () => { throw new Error('Network offline'); };
    const offline = await prepareManifest(storedManifest()!, 'token');
    assert.equal(offline.manifest.revision, 'one'); offline.release();
  } finally { globalThis.fetch = originalFetch; }
});
test('a corrupt next revision never replaces the current cached manifest', async () => {
  const { cacheStorage } = setup(); const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(data);
    const first = await prepareManifest(manifest(), 'token'); first.release();
    const next = manifest('two'); next.media = [{ ...media, id: 'media-2', url: '/api/v1/media/media-2/file' }];
    globalThis.fetch = async () => new Response('tampered bytes');
    await assert.rejects(prepareManifest(next, 'token'), /Intégrité/);
    assert.equal(storedManifest()?.revision, 'one'); assert.equal((await cacheStorage.keys()).length, 1);
    globalThis.fetch = async () => { throw new Error('offline'); };
    const restored = await prepareManifest(storedManifest()!, 'token'); restored.release();
  } finally { globalThis.fetch = originalFetch; }
});
test('storage quota failure preserves previous working metadata', async () => {
  const { storage } = setup(); const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(data);
    const first = await prepareManifest(manifest(), 'token'); first.release();
    storage.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    await assert.rejects(prepareManifest(manifest('two'), 'token'), /Quota/);
    assert.equal(storedManifest()?.revision, 'one');
  } finally { globalThis.fetch = originalFetch; }
});
test('revocation cleanup clears media and manifest but preserves app shell', async () => {
  const { cacheStorage } = setup(); const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(data);
    const first = await prepareManifest(manifest(), 'token'); first.release();
    await cacheStorage.open('visualy-shell-v1'); await clearOffline();
    assert.equal(storedManifest(), null); assert.deepEqual(await cacheStorage.keys(), ['visualy-shell-v1']);
  } finally { globalThis.fetch = originalFetch; }
});

test('legacy media cache is verified and migrated without downloading again', async () => {
  const {legacyIdentity}=await import('@visualy/shared');
  const {cacheStorage,storage}=setup();const originalFetch=globalThis.fetch;
  try {
    const old=await cacheStorage.open(legacyIdentity.mediaCachePrefix+'old-revision');
    await old.put(mediaUrl(media,'token'),new Response(data,{headers:{[legacyIdentity.checksumHeader]:checksum}}));
    storage.setItem('visualy-manifest',JSON.stringify(manifest()));
    globalThis.fetch=async()=>{throw new Error('offline')};
    const migrated=await prepareManifest(manifest(),'token');migrated.release();
    const names=await cacheStorage.keys();assert.equal(names.length,1);assert.ok(names[0].startsWith('visualy-media-'));
    const response=await (await cacheStorage.open(names[0])).match(mediaUrl(media,'token'));assert.equal(response?.headers.get('X-Visualy-Checksum'),checksum);
  } finally {globalThis.fetch=originalFetch}
});
