// Retired identifiers belong only in explicit compatibility code and immutable audit evidence.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {legacyIdentity} from '@visualy/shared';
import assert from 'node:assert/strict';
const retired=[legacyIdentity.sessionCookie.split('_')[0],legacyIdentity.storage['visualy-language'].split('-')[0]];
const pattern=new RegExp(retired.join('|'),'i');
const compatibility=new Set(['packages/shared/src/legacy.ts','scripts/legacy-identifiers.sh','apps/player/public/legacy-sw.js']);
const files=new Set(execFileSync('git',['ls-files','-co','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean));
const unexpected=[];
for(const file of files){
 if(compatibility.has(file)||file.startsWith('tests/legacy/')||file.startsWith('docs/security/archive/')||!existsSync(file))continue;
 if(!/\.(?:[cm]?js|tsx?|json|ya?ml|md|sh|html|css)$/.test(file)&&file!=='.env.example')continue;
 if(pattern.test(readFileSync(file,'utf8')))unexpected.push(file);
}
assert.deepEqual(unexpected,[],'Retired names outside compatibility modules or archived evidence');
console.log('PASS: Visualy throughout current sources, configuration and documentation; legacy names confined to explicit compatibility and archived evidence.');
