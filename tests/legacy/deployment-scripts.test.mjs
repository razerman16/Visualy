import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function fixture(fn){const root=mkdtempSync(join(tmpdir(),'visualy-scripts-'));mkdirSync(join(root,'scripts'));mkdirSync(join(root,'bin'));copyFileSync('scripts/legacy-identifiers.sh',join(root,'scripts/legacy-identifiers.sh'));try{return fn(root)}finally{rmSync(root,{recursive:true,force:true})}}
function vars(root){return Object.fromEntries(readFileSync(join(root,'.env'),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]))}
test('mode switches preserve secrets/custom ports and are idempotent',()=>fixture(root=>{
 copyFileSync('scripts/init-env.sh',join(root,'scripts/init-env.sh'));
 writeFileSync(join(root,'.env'),'POSTGRES_PASSWORD=existing-secret\nADMIN_PORT=9000\nPLAYER_PORT=9001\nSERVER_IP=192.168.1.50\n');
 for(const [flag,files] of [['--https','compose.yaml|compose.https.yaml'],['--ip','compose.yaml|compose.ip.yaml'],['--localhost','compose.yaml|compose.localhost.yaml'],['--http','compose.yaml']]){
  const run=()=>spawnSync('sh',['scripts/init-env.sh',flag],{cwd:root,encoding:'utf8'});
  assert.equal(run().status,0);const before=readFileSync(join(root,'.env'),'utf8');assert.equal(run().status,0);assert.equal(readFileSync(join(root,'.env'),'utf8'),before);
  const v=vars(root);assert.equal(v.COMPOSE_FILE,files);assert.equal(v.POSTGRES_PASSWORD,'existing-secret');assert.equal(v.ADMIN_PORT,'9000');assert.equal(v.PLAYER_PORT,'9001');assert.equal(v.SERVER_IP,'192.168.1.50');assert.equal(statSync(join(root,'.env')).mode&0o777,0o600);
 }
}));
function migration(root,scenario){
 copyFileSync('scripts/migrate-visualy.sh',join(root,'scripts/migrate-visualy.sh'));
 writeFileSync(join(root,'.env'),'POSTGRES_PASSWORD=existing-secret\nADMIN_PORT=9000\n'+(scenario==='already-migrated'?'COMPOSE_PROJECT_NAME=visualy\nVOLUME_PREFIX=scenzly\n':''));
 writeFileSync(join(root,'scripts/backup.sh'),'#!/bin/sh\necho backup >> "$EVENT_LOG"\n[ "$COMPOSE_PROJECT_NAME" = scenzly ] || exit 2\n[ "$SCENARIO" != backup-fails ]\n');
 writeFileSync(join(root,'bin/docker'),`#!/bin/sh
case "$*" in
 'ps -a -q --filter label=com.docker.compose.project=scenzly') case "$SCENARIO" in no-old|orphaned-volumes|already-migrated) ;; *) echo old-container ;; esac ;;
 'ps -a -q --filter label=com.docker.compose.project=visualy') [ "$SCENARIO" != target-exists ] || echo target ;;
 'volume inspect scenzly_postgres18-data') [ "$SCENARIO" = orphaned-volumes ] && exit 0 || exit 1 ;;
 *'com.docker.compose.service=postgres'*) echo old-postgres ;;
 *'com.docker.compose.service=api'*) echo old-api ;;
 inspect*old-postgres) if [ "$SCENARIO" = custom-volume ]; then echo other-volume; else echo scenzly_postgres18-data; fi ;;
 inspect*old-api) echo scenzly_media-data ;;
 compose*down*) echo stop >> "$EVENT_LOG"; case "$*" in *--volumes*|*' -v'*) exit 3;; esac ;;
 *) exit 4 ;;
esac
exit 0
`,{mode:0o700});
 return spawnSync('sh',['scripts/migrate-visualy.sh'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,EVENT_LOG:join(root,'events'),SCENARIO:scenario}});
}
test('migration backs up before stopping, retains volume namespace and protects secrets',()=>fixture(root=>{
 const result=migration(root,'success');assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(root,'events'),'utf8'),'backup\nstop\n');const v=vars(root);assert.equal(v.COMPOSE_PROJECT_NAME,'visualy');assert.equal(v.VOLUME_PREFIX,'scenzly');assert.equal(v.POSTGRES_PASSWORD,'existing-secret');assert.equal(v.ADMIN_PORT,'9000');assert.equal(statSync(join(root,'.env')).mode&0o777,0o600);
}));
for(const scenario of ['target-exists','custom-volume','backup-fails','orphaned-volumes'])test(`migration aborts without changing .env when ${scenario}`,()=>fixture(root=>{
 const result=migration(root,scenario);assert.notEqual(result.status,0);assert.deepEqual(vars(root),{POSTGRES_PASSWORD:'existing-secret',ADMIN_PORT:'9000'});if(scenario==='backup-fails')assert.equal(readFileSync(join(root,'events'),'utf8'),'backup\n');
}));
test('fresh installations need no project migration',()=>fixture(root=>{assert.equal(migration(root,'no-old').status,0);assert.equal(vars(root).COMPOSE_PROJECT_NAME,undefined)}));

test('an already configured migration is a no-op',()=>fixture(root=>{assert.equal(migration(root,'already-migrated').status,0);assert.equal(vars(root).VOLUME_PREFIX,'scenzly')}));

test('initialization preserves the live PostgreSQL cluster identifiers',()=>fixture(root=>{
 copyFileSync('scripts/init-env.sh',join(root,'scripts/init-env.sh'));
 writeFileSync(join(root,'.env'),'POSTGRES_PASSWORD=existing-secret\n');
 writeFileSync(join(root,'bin/docker'),`#!/bin/sh
case "$*" in
 compose*) echo existing-postgres ;;
 inspect*POSTGRES_USER*) echo scenzly ;;
 inspect*POSTGRES_DB*) echo scenzly ;;
 *) exit 1 ;;
esac
`,{mode:0o700});
 const result=spawnSync('sh',['scripts/init-env.sh'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH}});
 assert.equal(result.status,0,result.stderr);const v=vars(root);assert.equal(v.POSTGRES_USER,'scenzly');assert.equal(v.POSTGRES_DB,'scenzly');assert.equal(v.POSTGRES_PASSWORD,'existing-secret');
}));
