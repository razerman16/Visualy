import test from 'node:test';
import assert from 'node:assert/strict';
import { getScheduleErrors, isScheduleActive, schedulesConflict, selectProgram } from '../src/schedule.js';
import type { Schedule } from '../src/types.js';

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return { id: 'a', name: 'Matin', programId: 'morning', screenId: 'screen', groupId: null,
    priority: 0, kind: 'weekly', startDate: '2026-01-01', endDate: '2026-12-31',
    startTime: '08:00', endTime: '12:00', days: [1, 2, 3, 4, 5], exclusions: [],
    timezone: 'Europe/Paris', ...overrides };
}
const at = (value: string) => new Date(value);

test('weekdays and half-open interval boundaries use Paris local time', () => {
  const s = schedule();
  assert.equal(isScheduleActive(s, at('2026-10-26T07:00:00Z')), true);
  assert.equal(isScheduleActive(s, at('2026-10-26T06:59:59Z')), false);
  assert.equal(isScheduleActive(s, at('2026-10-26T11:00:00Z')), false);
  assert.equal(isScheduleActive(s, at('2026-10-25T08:00:00Z')), false);
});

test('overnight occurrence belongs to its start date and weekday', () => {
  const s = schedule({ startDate: '2026-10-26', endDate: '2026-10-26', startTime: '22:00', endTime: '02:00', days: [1] });
  assert.equal(isScheduleActive(s, at('2026-10-26T21:00:00Z')), true);
  assert.equal(isScheduleActive(s, at('2026-10-27T00:59:59Z')), true);
  assert.equal(isScheduleActive(s, at('2026-10-27T01:00:00Z')), false);
  assert.equal(isScheduleActive({ ...s, exclusions: ['2026-10-26'] }, at('2026-10-27T00:00:00Z')), false);
  assert.equal(isScheduleActive({ ...s, exclusions: ['2026-10-27'] }, at('2026-10-27T00:00:00Z')), true);
});

test('equal times cover 24 hours; dates remain inclusive', () => {
  const s = schedule({ startDate: '2026-10-26', endDate: '2026-10-26', startTime: '00:00', endTime: '00:00' });
  assert.equal(isScheduleActive(s, at('2026-10-25T23:00:00Z')), true);
  assert.equal(isScheduleActive(s, at('2026-10-26T22:59:59Z')), true);
  assert.equal(isScheduleActive(s, at('2026-10-26T23:00:00Z')), false);
});

test('spring daylight saving gap never produces a nonexistent 02:00 slot', () => {
  const s = schedule({ days: [7], startTime: '02:00', endTime: '03:00' });
  assert.equal(isScheduleActive(s, at('2026-03-29T00:59:59Z')), false);
  assert.equal(isScheduleActive(s, at('2026-03-29T01:00:00Z')), false);
  const after = { ...s, startTime: '03:00', endTime: '04:00' };
  assert.equal(isScheduleActive(after, at('2026-03-29T01:00:00Z')), true);
});

test('autumn repeated hour follows the same wall-clock rule twice', () => {
  const s = schedule({ days: [7], startTime: '02:15', endTime: '02:45' });
  assert.equal(isScheduleActive(s, at('2026-10-25T00:30:00Z')), true);
  assert.equal(isScheduleActive(s, at('2026-10-25T01:30:00Z')), true);
  assert.equal(isScheduleActive(s, at('2026-10-25T00:50:00Z')), false);
  assert.equal(isScheduleActive(s, at('2026-10-25T01:00:00Z')), false);
});

test('priority kinds override numeric priority, then fall back after expiry', () => {
  const now = at('2026-10-26T08:00:00Z');
  const weekly = schedule({ priority: 999 });
  const urgent = schedule({ id: 'u', programId: 'alert', kind: 'urgent', priority: 0 });
  const exception = schedule({ id: 'e', programId: 'exception', kind: 'exception' });
  assert.equal(selectProgram([weekly, urgent, exception], now, 'fallback'), 'alert');
  assert.equal(selectProgram([weekly, exception], now, 'fallback'), 'exception');
  assert.equal(selectProgram([weekly, urgent], at('2026-10-26T20:00:00Z'), 'fallback'), 'fallback');
  assert.equal(selectProgram([], now, null), null);
});

test('equal priority chooses stable id regardless of input order', () => {
  const a = schedule({ id: 'a', programId: 'first' });
  const b = schedule({ id: 'b', programId: 'second' });
  assert.equal(selectProgram([b, a], at('2026-10-26T08:00:00Z'), null), 'first');
});

test('dated campaigns can cover every weekday without an explicit selection', () => {
  assert.equal(isScheduleActive(schedule({ kind: 'dated', days: [] }), at('2026-10-25T08:00:00Z')), true);
  assert.equal(isScheduleActive(schedule({ days: [] }), at('2026-10-26T08:00:00Z')), false);
});

test('conflict excludes adjacent times, distinct weekdays and date windows', () => {
  const a = schedule();
  assert.equal(schedulesConflict(a, schedule({ id: 'b', startTime: '11:00' })), true);
  assert.equal(schedulesConflict(a, schedule({ id: 'b', startTime: '12:00', endTime: '18:00' })), false);
  assert.equal(schedulesConflict(a, schedule({ id: 'b', days: [6, 7] })), false);
  assert.equal(schedulesConflict(a, schedule({ id: 'b', startDate: '2027-01-01', endDate: '2027-12-31' })), false);
});

test('conflict requires same target, kind and priority', () => {
  const a = schedule();
  assert.equal(schedulesConflict(a, schedule({ id: 'b', screenId: 'other' })), false);
  assert.equal(schedulesConflict(a, schedule({ id: 'b', priority: 1 })), false);
  assert.equal(schedulesConflict(a, schedule({ id: 'b', kind: 'urgent' })), false);
  assert.equal(schedulesConflict(a, a), false);
  assert.equal(schedulesConflict(schedule({ screenId: null, groupId: 'group' }), schedule({ id: 'b', screenId: null, groupId: 'group' })), true);
});

test('overnight overlap matches the following local day and respects exclusions', () => {
  const a = schedule({ startDate: '2026-10-26', endDate: '2026-10-26', days: [1], startTime: '23:00', endTime: '02:00' });
  const b = schedule({ id: 'b', startDate: '2026-10-27', endDate: '2026-10-27', days: [2], startTime: '01:00', endTime: '03:00' });
  assert.equal(schedulesConflict(a, b), true);
  assert.equal(schedulesConflict(a, { ...b, exclusions: ['2026-10-27'] }), false);
});

test('two nonexistent spring slots are not a real conflict', () => {
  const a = schedule({ startDate: '2026-03-29', endDate: '2026-03-29', days: [7], startTime: '02:00', endTime: '02:45' });
  assert.equal(schedulesConflict(a, { ...a, id: 'b', startTime: '02:15', endTime: '03:00' }), false);
  assert.equal(schedulesConflict({ ...a, endTime: '03:30' }, { ...a, id: 'b', startTime: '02:15', endTime: '03:15' }), true);
});

test('different IANA zones compare real instants', () => {
  const a = schedule({ startDate: '2026-10-26', endDate: '2026-10-26', startTime: '08:00', endTime: '09:00' });
  const b = { ...a, id: 'b', timezone: 'UTC', startTime: '07:00', endTime: '08:00' };
  assert.equal(schedulesConflict(a, b), true);
  assert.equal(schedulesConflict(a, { ...b, startTime: '08:00', endTime: '09:00' }), false);
});

test('invalid dates, unsupported zones and unbounded spans are rejected', () => {
  assert.equal(getScheduleErrors(schedule()).length, 0);
  for (const change of [
    { startDate: '2026-02-30' }, { startTime: '24:00' }, { timezone: 'Mars/Olympus' },
    { endDate: '2040-01-01' }, { priority: -1 }, { days: [] }, { groupId: 'group' },
  ]) assert.ok(getScheduleErrors(schedule(change)).length > 0);
  assert.equal(isScheduleActive(schedule({ timezone: 'invalid' }), new Date()), false);
});
