import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playlistPosition } from './playback';
import type { PlaylistItem } from '@scenzly/shared';
const items: PlaylistItem[] = [5, 10, 7].map((duration, i) => ({ id: String(i), type: 'scene', refId: String(i), duration }));
test('three slides keep exact 5/10/7 second boundaries and loop', () => {
  for (const [ms, index] of [[0, 0], [4999, 0], [5000, 1], [14999, 1], [15000, 2], [21999, 2], [22000, 0], [27000, 1]]) assert.equal(playlistPosition(items, ms)?.index, index);
});
test('waking after multiple loops selects the current slide immediately', () => {
  assert.equal(playlistPosition(items, 22_000 * 50 + 16_000)?.index, 2);
});
test('empty and invalid durations cannot produce an infinite loop', () => {
  assert.equal(playlistPosition([], 0), null);
  assert.equal(playlistPosition([{ ...items[0], duration: Number.NaN }], 100_000)?.index, 0);
});
