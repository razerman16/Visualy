// Disposable database only. Verifies denied operations really fail at the SQL boundary.
import pg from 'pg';
import assert from 'node:assert/strict';
const pool=new pg.Pool({connectionString:process.env.TEST_APP_DATABASE_URL});
try{
 const {rows:[role]}=await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user');for(const value of Object.values(role))assert.equal(value,false);
 for(const sql of ['CREATE TABLE public.forbidden(id int)','DELETE FROM security_events','UPDATE security_events SET type=type','TRUNCATE security_events','ALTER ROLE screnzly_app SUPERUSER'])await assert.rejects(pool.query(sql),e=>e.code==='42501');
 await pool.query('SELECT public.prune_security_events()');console.log('PASS: runtime role has no DDL/superuser privileges; security journal cannot be altered or erased.');
}finally{await pool.end()}
