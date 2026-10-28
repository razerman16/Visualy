import type { PlaylistItem } from '@visualy/shared';
export function playlistPosition(items: PlaylistItem[], elapsedMs: number): { item: PlaylistItem; index: number } | null {
  if (!items.length) return null;
  const durations = items.map(item => Math.max(1, Number.isFinite(item.duration) ? item.duration : 10) * 1000);
  const length = durations.reduce((sum, duration) => sum + duration, 0);
  let at = ((elapsedMs % length) + length) % length;
  for (let index = 0; index < items.length; index++) {
    if (at < durations[index]) return { item: items[index], index };
    at -= durations[index];
  }
  return { item: items[0], index: 0 };
}
export function deviceId(): string {
  const existing = localStorage.getItem('visualy-device-id');
  if (existing) return existing;
  // getRandomValues also works over HTTP on a private LAN; randomUUID does not.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  localStorage.setItem('visualy-device-id', id); return id;
}
