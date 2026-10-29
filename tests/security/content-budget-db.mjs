// Disposable integration database ONLY. All fixture mutations are rolled back.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool} from '/app/apps/api/dist/db.js';
import {boundedRows,reserveContent,contentBytes,CONTENT_LIMITS,ContentLimitError} from '/app/apps/api/dist/content-budget.js';
const client=await pool.connect(),other=await pool.connect();
try {
 await client.query('BEGIN');await other.query('BEGIN');
 await client.query('DELETE FROM scenes');
 const dense={items:Array.from({length:1000},()=>({a:1,b:2,c:3})),text:''};dense.text='x'.repeat(CONTENT_LIMITS.document-contentBytes(dense)-100);
 assert.ok(contentBytes(dense)<CONTENT_LIMITS.document);
 await assert.rejects(reserveContent(client,'scenes','data',dense),ContentLimitError,'PostgreSQL JSON spacing is included in admission');
 const id=randomUUID();
 await reserveContent(client,'scenes','data',{id,name:'small'},id);
 const lock=(await other.query('SELECT pg_try_advisory_xact_lock(7382263) AS acquired')).rows[0];
 assert.equal(lock.acquired,false,'another writer cannot bypass the transaction reservation');
 await client.query("INSERT INTO scenes(id,data) SELECT gen_random_uuid(), '{\"name\":\"small\"}'::jsonb FROM generate_series(1,$1)",[CONTENT_LIMITS.count]);
 await assert.rejects(reserveContent(client,'scenes','data',{id,name:'new'},id),ContentLimitError);
 const existing=(await client.query('SELECT id FROM scenes LIMIT 1')).rows[0].id;
 await reserveContent(client,'scenes','data',{id:existing,name:'updated'},existing);
 await client.query('DELETE FROM scenes');
 // Simulate a legacy dataset larger than today's allowed response/storage budget.
 await client.query("INSERT INTO scenes(id,data) VALUES($1,jsonb_build_object('text',repeat('x',$2)))",[id,CONTENT_LIMITS.collection+1]);
 await assert.rejects(boundedRows(client,'SELECT data AS payload FROM scenes'),ContentLimitError);
 await assert.rejects(reserveContent(client,'scenes','data',{id:randomUUID(),name:'more'}),ContentLimitError);
 await reserveContent(client,'scenes','data',{id,name:'shrunk'},id);
 await client.query('UPDATE scenes SET data=$2 WHERE id=$1',[id,JSON.stringify({id,name:'shrunk'})]);
 assert.equal((await boundedRows(client,'SELECT data AS payload FROM scenes'))[0].name,'shrunk');
 await assert.rejects(reserveContent(client,'program_versions','payload',{text:'x'.repeat(CONTENT_LIMITS.publication+1)}),ContentLimitError);
 assert.deepEqual(await boundedRows(client,'SELECT data AS payload FROM scenes WHERE false'),[]);
 console.log('PASS: transactional content reservation, row limits, oversized legacy read rejection, shrink recovery and snapshot size limits.');
} finally {await client.query('ROLLBACK');await other.query('ROLLBACK');client.release();other.release();await pool.end();}
