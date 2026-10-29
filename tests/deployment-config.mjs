// No containers or real .env values are used: check the effective network/cookie boundary.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const legacyProject=readFileSync('scripts/legacy-identifiers.sh','utf8').match(/^LEGACY_PROJECT=(.+)$/m)[1];
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=mkdtempSync(join(tmpdir(),'visualy-config-'));
const fixture=join(dir,'env');
const values={POSTGRES_PASSWORD:'a'.repeat(64),APP_DB_PASSWORD:'b'.repeat(64),SETUP_TOKEN:'c'.repeat(64),CONVERTER_TOKEN:'d'.repeat(64),BIND_ADDRESS:'0.0.0.0',ADMIN_PORT:'18082',PLAYER_PORT:'18083',CADDY_HTTP_PORT:'18080',CADDY_HTTPS_PORT:'18443',CADDY_PLAYER_HTTPS_PORT:'18444',LOCAL_PLAYER_HTTPS_PORT:'18445',DEV_ADMIN_PORT:'18084',DEV_PLAYER_PORT:'18085',SERVER_IP:'192.168.1.50',CADDY_IP:'172.30.240.2'};
writeFileSync(fixture,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});
function config(mode){return JSON.parse(execFileSync('docker',['compose','--env-file',fixture,'-f','compose.yaml',...(mode?['-f',`compose.${mode}.yaml`]:[]),'config','--format','json'],{cwd:root,env:{...process.env,...values},encoding:'utf8'}));}
function ports(service){return(service.ports||[]).map(p=>`${p.host_ip}:${p.published}:${p.target}`).sort();}
try{
 const http=config();assert.equal(http.services.caddy,undefined);assert.equal(http.services.api.environment.COOKIE_SECURE,'false');
 assert.equal(http.services.postgres.build.dockerfile,'docker/Dockerfile.postgres');
 assert.deepEqual(ports(http.services['admin-web']),['0.0.0.0:18082:80']);assert.deepEqual(ports(http.services['player-web']),['0.0.0.0:18083:80']);
 assert.equal(http.services['admin-web'].environment.TRUSTED_PROXY_IP,'127.0.0.1');
 for(const mode of ['https','ip','localhost']){
  const c=config(mode);assert.equal(c.services.api.environment.COOKIE_SECURE,'true');
  assert.equal(c.services.caddy.build.dockerfile,'docker/Dockerfile.caddy');assert.equal(c.services.caddy.build.target,'caddy');
  for(const web of ['admin-web','player-web']){assert.deepEqual(ports(c.services[web]),[]);assert.equal(c.services[web].environment.TRUSTED_PROXY_IP,values.CADDY_IP);}
  const binding=mode==='localhost'?'127.0.0.1':'0.0.0.0';
  const expected=[`${binding}:18080:80`,`${binding}:18443:443`,...(mode==='https'?[]:[`${binding}:${mode==='ip'?'18444':'18445'}:8443`])].sort();
  assert.deepEqual(ports(c.services.caddy),expected);
  assert.equal(c.name,http.name);for(const volume of ['media-data','postgres18-data'])assert.deepEqual(c.volumes[volume],http.volumes[volume]);
  assert.equal(c.volumes['caddy-data'].name,`${c.name}_caddy-data`);assert.equal(c.volumes['caddy-config'].name,`${c.name}_caddy-config`);
  for(const internal of ['api','postgres','migrate','converter'])assert.deepEqual(ports(c.services[internal]),[]);
  const mount=c.services.caddy.volumes.find(v=>v.target==='/etc/caddy/Caddyfile');
  assert.ok(mount.source.endsWith(mode==='https'?'/docker/Caddyfile':`/docker/Caddyfile.${mode}`));
 }
 const dev=config('dev');assert.equal(dev.services.caddy,undefined);assert.deepEqual(ports(dev.services['admin-web']),['127.0.0.1:18084:80']);assert.deepEqual(ports(dev.services['player-web']),['127.0.0.1:18085:80']);
 const migrated=JSON.parse(execFileSync('docker',['compose','--env-file',fixture,'-f','compose.yaml','config','--format','json'],{cwd:root,env:{...process.env,...values,VOLUME_PREFIX:legacyProject},encoding:'utf8'}));
 assert.equal(migrated.name,'visualy');assert.equal(migrated.volumes['postgres18-data'].name,`${legacyProject}_postgres18-data`);assert.equal(migrated.volumes['media-data'].name,`${legacyProject}_media-data`);
 console.log('PASS: HTTP default without Caddy; custom ports; HTTPS cookies and no HTTP bypass in all three modes; internal services and volumes preserved; localhost development binding.');
}finally{rmSync(dir,{recursive:true,force:true});}
