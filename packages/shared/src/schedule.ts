import type { Schedule, ScheduleKind } from './types.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
export const MAX_SCHEDULE_SPAN_DAYS = 1830;
const ranks: Record<ScheduleKind, number> = { weekly: 1, dated: 2, exception: 3, urgent: 4 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let result = formatters.get(timezone);
  if (!result) {
    result = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(timezone, result);
  }
  return result;
}

function dateNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const n = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : NaN;
}

function minuteNumber(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function wallTime(instant: number, timezone: string): number {
  const parts = Object.fromEntries(formatter(timezone).formatToParts(new Date(instant))
    .filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second));
}

/** Validate before persisting. Finite bounds make conflict checking exhaustive. */
export function getScheduleErrors(schedule: Schedule): string[] {
  const errors: string[] = [];
  const start = dateNumber(schedule.startDate ?? '');
  const end = dateNumber(schedule.endDate ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end)) errors.push('Dates invalides (AAAA-MM-JJ).');
  else if (start > end) errors.push('La date de fin précède la date de début.');
  else if ((end - start) / DAY > MAX_SCHEDULE_SPAN_DAYS) errors.push('La programmation ne peut pas dépasser cinq ans.');
  if (!Number.isFinite(minuteNumber(schedule.startTime ?? '')) ||
      !Number.isFinite(minuteNumber(schedule.endTime ?? ''))) errors.push('Heures invalides (HH:mm).');
  try { formatter(schedule.timezone); } catch { errors.push('Fuseau horaire IANA invalide.'); }
  if (!schedule.timezone) errors.push('Un fuseau horaire est requis.');
  if (!Object.hasOwn(ranks, schedule.kind)) errors.push('Type de programmation invalide.');
  if (!Number.isInteger(schedule.priority) || schedule.priority < 0 || schedule.priority > 1000)
    errors.push('La priorité doit être un entier entre 0 et 1000.');
  if (Boolean(schedule.screenId) === Boolean(schedule.groupId)) errors.push('Choisissez un écran ou un groupe.');
  if (!Array.isArray(schedule.days) || schedule.days.some(day => !Number.isInteger(day) || day < 1 || day > 7))
    errors.push('Jours de semaine invalides.');
  else if (schedule.kind === 'weekly' && !schedule.days.length) errors.push('Choisissez au moins un jour de semaine.');
  if (!Array.isArray(schedule.exclusions) || schedule.exclusions.some(date => !Number.isFinite(dateNumber(date))))
    errors.push('Dates d’exclusion invalides.');
  return errors;
}

function eligibleAnchor(schedule: Schedule, day: number): boolean {
  const date = new Date(day).toISOString().slice(0, 10);
  if (date < schedule.startDate || date > schedule.endDate || schedule.exclusions.includes(date)) return false;
  const weekday = new Date(day).getUTCDay() || 7;
  return schedule.days.length ? schedule.days.includes(weekday) : schedule.kind !== 'weekly';
}

/** Wall-clock rules apply twice during a repeated hour and never in a skipped hour.
 * An overnight occurrence, including its exclusions/weekday, belongs to its start date.
 * Equal times represent a 24-hour occurrence, beginning at the specified time.
 */
export function isScheduleActive(schedule: Schedule, now: Date): boolean {
  if (!Number.isFinite(now.getTime()) || getScheduleErrors(schedule).length) return false;
  const local = wallTime(now.getTime(), schedule.timezone);
  let anchor = Math.floor(local / DAY) * DAY;
  const minute = Math.floor((local - anchor) / MINUTE);
  const start = minuteNumber(schedule.startTime);
  const end = minuteNumber(schedule.endTime);
  if (end > start) {
    if (minute < start || minute >= end) return false;
  } else {
    if (minute >= start) { /* Starts on today's local date. */ }
    else if (minute < end || start === end) anchor -= DAY;
    else return false;
  }
  return eligibleAnchor(schedule, anchor);
}

/** Schedules must already be filtered to the player and its groups. Higher priority wins. */
export function selectProgram(schedules: Schedule[], now: Date, fallbackProgramId: string | null): string | null {
  const active = schedules.filter(schedule => isScheduleActive(schedule, now));
  active.sort((a, b) => ranks[b.kind] - ranks[a.kind] || b.priority - a.priority || a.id.localeCompare(b.id, 'en'));
  return active[0]?.programId ?? fallbackProgramId;
}

type Interval = readonly [number, number];
function wallInterval(schedule: Schedule, anchor: number): Interval {
  const start = minuteNumber(schedule.startTime);
  const end = minuteNumber(schedule.endTime);
  return [anchor + start * MINUTE, anchor + end * MINUTE + (end <= start ? DAY : 0)];
}

function overlaps(a: Interval, b: Interval): boolean { return a[0] < b[1] && b[0] < a[1]; }

/** Convert a local interval into actual UTC intervals. Splitting at timezone changes
 * preserves both repetitions of an autumn hour without inventing the spring gap.
 * Scheduling is minute based; modern IANA transition boundaries are minute aligned.
 */
function realIntervals(wall: Interval, timezone: string): Interval[] {
  const first = wall[0] - 26 * 60 * MINUTE;
  const last = wall[1] + 26 * 60 * MINUTE;
  const intervals: Interval[] = [];
  let segmentStart = first;
  let offset = wallTime(first, timezone) - first;
  const add = (end: number) => {
    const lo = Math.max(segmentStart, wall[0] - offset);
    const hi = Math.min(end, wall[1] - offset);
    if (lo < hi) intervals.push([lo, hi]);
  };
  for (let cursor = first + 60 * MINUTE; cursor <= last + 60 * MINUTE; cursor += 60 * MINUTE) {
    const sample = Math.min(cursor, last);
    const nextOffset = wallTime(sample, timezone) - sample;
    if (nextOffset !== offset) {
      let lo = Math.max(first, sample - 60 * MINUTE);
      let hi = sample;
      while (hi - lo > MINUTE) {
        const mid = Math.floor((lo + hi) / (2 * MINUTE)) * MINUTE;
        if (wallTime(mid, timezone) - mid === offset) lo = mid;
        else hi = mid;
      }
      add(hi);
      segmentStart = hi;
      offset = nextOffset;
    }
    if (sample === last) break;
  }
  add(last);
  return intervals;
}

/** Exact conflict detection over the validated, bounded date range. Adjacent ranges
 * are allowed. Different campaign kinds or priorities are intentional overrides.
 * The caller also checks group membership to detect intersections across targets.
 */
export function schedulesConflict(a: Schedule, b: Schedule): boolean {
  if (getScheduleErrors(a).length || getScheduleErrors(b).length) return false;
  if (a.id && a.id === b.id) return false;
  if (a.kind !== b.kind || a.priority !== b.priority) return false;
  const sameTarget = a.screenId ? a.screenId === b.screenId : a.groupId === b.groupId;
  if (!sameTarget) return false;
  const sameZone = a.timezone === b.timezone;
  const proximity = sameZone ? 1 : 2;
  const first = Math.max(dateNumber(a.startDate), dateNumber(b.startDate) - proximity * DAY);
  const last = Math.min(dateNumber(a.endDate), dateNumber(b.endDate) + proximity * DAY);
  const aCache = new Map<number, Interval[]>();
  const bCache = new Map<number, Interval[]>();
  for (let anchor = first; anchor <= last; anchor += DAY) {
    if (!eligibleAnchor(a, anchor)) continue;
    const aWall = wallInterval(a, anchor);
    for (let shift = -proximity; shift <= proximity; shift++) {
      const bAnchor = anchor + shift * DAY;
      if (!eligibleAnchor(b, bAnchor)) continue;
      const bWall = wallInterval(b, bAnchor);
      if (sameZone) {
        if (!overlaps(aWall, bWall)) continue;
        const common: Interval = [Math.max(aWall[0], bWall[0]), Math.min(aWall[1], bWall[1])];
        if (realIntervals(common, a.timezone).length) return true;
      } else {
        if (!aCache.has(anchor)) aCache.set(anchor, realIntervals(aWall, a.timezone));
        if (!bCache.has(bAnchor)) bCache.set(bAnchor, realIntervals(bWall, b.timezone));
        if (aCache.get(anchor)!.some(ai => bCache.get(bAnchor)!.some(bi => overlaps(ai, bi)))) return true;
      }
    }
  }
  return false;
}
