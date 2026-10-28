import {pool,migrate} from './db.js';
const password=process.env.APP_DB_PASSWORD;
if(!password||!/^[a-f0-9]{64}$/.test(password))throw new Error('APP_DB_PASSWORD must contain 64 hexadecimal characters');
try {
 await migrate();
 // Only this one-shot service receives owner credentials. Identifiers are fixed.
 await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='screnzly_app') THEN CREATE ROLE screnzly_app LOGIN; END IF; END $$`);
 await pool.query(`ALTER ROLE screnzly_app WITH PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
 await pool.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE ALL ON DATABASE scenzly FROM PUBLIC; GRANT CONNECT ON DATABASE scenzly TO screnzly_app;
 GRANT USAGE ON SCHEMA public TO screnzly_app;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO screnzly_app;
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO screnzly_app;
 REVOKE UPDATE,DELETE,TRUNCATE ON security_events FROM screnzly_app;
 CREATE OR REPLACE FUNCTION public.prune_security_events() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS 'DELETE FROM public.security_events WHERE created_at < now() - interval ''90 days''';
 REVOKE ALL ON FUNCTION public.prune_security_events() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.prune_security_events() TO screnzly_app;`);
 console.log('Schema migrated and application role restricted.');
}finally{await pool.end()}
