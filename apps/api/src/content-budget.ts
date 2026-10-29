import type {Pool, PoolClient} from 'pg';

const MiB = 1024 * 1024;
export const CONTENT_LIMITS = {
  document: 256 * 1024,
  collection: 8 * MiB,
  publication: 2 * MiB,
  manifest: 8 * MiB,
  versions: 64 * MiB,
  count: 1000,
} as const;
export class ContentLimitError extends Error {
  statusCode = 413;
  constructor() { super('Limite de contenu atteinte. Réduisez le contenu ou supprimez des éléments inutilisés.'); }
}
export function contentBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value)); }
export function checkContent(value: unknown, limit: number): number {
  const bytes = contentBytes(value);
  if (bytes > limit) throw new ContentLimitError();
  return bytes;
}
type Database = Pool | PoolClient;
// All callers pass static SQL, never request-supplied SQL/identifiers. The budget and
// result use one statement/snapshot; oversized legacy rows never reach Node.
// Materialize only the byte count, not an unbounded collection of JSON documents.
export async function boundedRows(db: Database, sql: string, values: unknown[] = [], limit: number = CONTENT_LIMITS.collection): Promise<any[]> {
  const result = await db.query(`WITH entries AS NOT MATERIALIZED (${sql}),
    budget AS MATERIALIZED (SELECT COALESCE(sum(octet_length(payload::text)),0) AS bytes FROM entries)
    SELECT payload FROM entries, budget WHERE budget.bytes <= $${values.length + 1}
    UNION ALL SELECT NULL AS payload FROM budget WHERE budget.bytes > $${values.length + 1}`,
  [...values, limit]);
  if (result.rows.some(row => row.payload === null)) throw new ContentLimitError();
  return result.rows.map(row => row.payload);
}
// Serialize all JSON writes with publication/deletion. No destructive migration:
// existing over-budget installations may shrink content or delete it to recover.
export async function reserveContent(db: PoolClient, table: 'scenes'|'programs'|'schedules'|'program_versions', column: 'data'|'items'|'payload', value: unknown, id?: string) {
  await db.query('SELECT pg_advisory_xact_lock(7382263)');
  const overhead = table === 'programs' ? 2048 : 0; // name, UUIDs and timestamps in list responses
  const max = table === 'program_versions' ? CONTENT_LIMITS.versions : CONTENT_LIMITS.collection;
  checkContent(value, table === 'program_versions' ? CONTENT_LIMITS.publication : CONTENT_LIMITS.document);
  const {rows:[size]} = await db.query(`SELECT count(*)::int AS count,
    COALESCE(sum(octet_length(${column}::text)+${overhead}),0)::bigint AS bytes,
    COALESCE(sum(octet_length(${column}::text)+${overhead}) FILTER (WHERE ${table === 'program_versions' ? 'false' : 'id=$1::uuid'}),0)::bigint AS previous
    FROM ${table}`, table === 'program_versions' ? [] : [id || null]);
  const {rows:[candidate]} = await db.query('SELECT octet_length($1::jsonb::text) AS bytes', [JSON.stringify(value)]);
  if (candidate.bytes > (table === 'program_versions' ? CONTENT_LIMITS.publication : CONTENT_LIMITS.document)) throw new ContentLimitError();
  const previous = Number(size.previous), next = Number(size.bytes) - previous + candidate.bytes + overhead;
  if ((next > max && next >= Number(size.bytes)) || (!previous && size.count >= CONTENT_LIMITS.count)) throw new ContentLimitError();
}
