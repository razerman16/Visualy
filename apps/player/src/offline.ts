import {t,translateMessage} from '@visualy/shared';
import { sha256 } from '@noble/hashes/sha2.js';
import type { Manifest, Media } from '@visualy/shared';

export const CACHE_PREFIX = 'scenzly-media-';
const MANIFEST_KEY = 'scenzly-manifest';
export type Prepared = { manifest: Manifest; urls: Record<string, string>; durable: boolean; release: () => void };
export function mediaUrl(media: Pick<Media, 'id' | 'url'>, token: string): string {
  // A manifest cannot instruct the player to transmit its token to another host.
  const expected = `/api/v1/media/${encodeURIComponent(media.id)}/file`;
  if (media.url !== expected) throw new Error(t("Adresse média non autorisée."));
  return `${expected}?token=${encodeURIComponent(token)}`;
}
export function hashBytes(data: ArrayBuffer): string {
  return Array.from(sha256(new Uint8Array(data)), n => n.toString(16).padStart(2, '0')).join('');
}
export function verifyAsset(data: ArrayBuffer, checksum: string): void {
  if (!/^[a-f\d]{64}$/i.test(checksum) || hashBytes(data) !== checksum.toLowerCase()) throw new Error(t("Intégrité du média invalide. La dernière version est conservée."));
}
export function storedManifest(): Manifest | null {
  try { const raw = localStorage.getItem(MANIFEST_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function clearOffline(): Promise<void> {
  localStorage.removeItem(MANIFEST_KEY);
  if ('caches' in globalThis) {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX)).map(n => caches.delete(n)));
  }
}
export async function prepareManifest(manifest: Manifest, token: string, signal?: AbortSignal): Promise<Prepared> {
  const urls: Record<string, string> = {};
  const objectUrls: string[] = [];
  const release = () => objectUrls.forEach(url => URL.revokeObjectURL(url));
  let cache: Cache | null = null;
  const cacheName = CACHE_PREFIX + hashBytes(new TextEncoder().encode(`${token}:${manifest.revision}`).buffer).slice(0, 24);
  const durable = globalThis.isSecureContext && 'caches' in globalThis;
  try {
    if (durable) cache = await caches.open(cacheName);
    const allMedia = new Map<string, Media>();
    for (const media of [...manifest.media, ...manifest.programs.flatMap(p => p.media)]) allMedia.set(media.id, media);
    // Sequential download keeps peak memory and pressure on the local server bounded.
    for (const media of allMedia.values()) {
      if (signal?.aborted) throw new DOMException('Interrupted', 'AbortError');
      const url = mediaUrl(media, token);
      let response = cache ? await caches.match(url) : undefined;
      let bytes: ArrayBuffer;
      if (response?.headers.get('X-Screnzly-Checksum') === media.checksum.toLowerCase()) {
        bytes = await response.arrayBuffer();
        verifyAsset(bytes, media.checksum);
      } else {
        response = await fetch(url, { signal, cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error(t("Téléchargement impossible : {0} ({1}).", media.name, response.status));
        bytes = await response.arrayBuffer();
        verifyAsset(bytes, media.checksum);
      }
      if (cache) await cache.put(url, new Response(bytes, { headers: { 'Content-Type': media.mime, 'Content-Length': String(bytes.byteLength), 'X-Screnzly-Checksum': media.checksum.toLowerCase() } }));
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: media.mime }));
      objectUrls.push(blobUrl); urls[media.id] = blobUrl;
    }
    // Persist only after every essential file is verified and stored. A failed/quota-full
    // revision must never replace the last working revision.
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    if (cache) {
      const oldNames = (await caches.keys()).filter(n => n.startsWith(CACHE_PREFIX) && n !== cacheName);
      await Promise.all(oldNames.map(n => caches.delete(n)));
    }
    return { manifest, urls, durable: !!cache, release };
  } catch (error) {
    release();
    // Retain the previously activated revision and any valid existing cache.
    if (cache && storedManifest()?.revision !== manifest.revision) await caches.delete(cacheName).catch(() => {});
    throw error;
  }
}
