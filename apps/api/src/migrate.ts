import {legacyIdentity} from '@visualy/shared';
import {pool,migrate} from './db.js';
const password=process.env.APP_DB_PASSWORD;
if(!password||!/^[a-f0-9]{64}$/.test(password))throw new Error('APP_DB_PASSWORD must contain 64 hexadecimal characters');
try {
 await migrate();
 // A role rename preserves existing grants and ownership without copying data.
 const oldRole = legacyIdentity.applicationRole;
 await pool.query(`DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='${oldRole}') AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname='visualy_app') THEN ALTER ROLE ${oldRole} RENAME TO visualy_app; END IF; END $$`);
 const database = (await pool.query('SELECT current_database() AS name')).rows[0].name as string;
 const databaseIdentifier = '"' + database.replaceAll('"', '""') + '"';
 // Only this one-shot service receives owner credentials. Role identifiers are fixed; the database identifier is quoted.
 await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='visualy_app') THEN CREATE ROLE visualy_app LOGIN; END IF; END $$`);
 await pool.query(`ALTER ROLE visualy_app WITH PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
 await pool.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE ALL ON DATABASE ${databaseIdentifier} FROM PUBLIC; GRANT CONNECT ON DATABASE ${databaseIdentifier} TO visualy_app;
 GRANT USAGE ON SCHEMA public TO visualy_app;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO visualy_app;
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO visualy_app;
 REVOKE UPDATE,DELETE,TRUNCATE ON security_events FROM visualy_app;
 CREATE OR REPLACE FUNCTION public.prune_security_events() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS 'DELETE FROM public.security_events WHERE created_at < now() - interval ''90 days''';
 REVOKE ALL ON FUNCTION public.prune_security_events() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.prune_security_events() TO visualy_app;`);
 console.log('Schema migrated and application role restricted.');
}finally{await pool.end()}
