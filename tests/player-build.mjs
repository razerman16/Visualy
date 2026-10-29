// Verify the installed worker changes when a public asset changes, even if JS bundles don't.
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {build} from 'vite';
const temporary=await mkdtemp(join(tmpdir(),'visualy-shell-build-'));
try{
 const publicDir=join(temporary,'public'),outDir=join(temporary,'dist');await cp('apps/player/public',publicDir,{recursive:true});
 const compile=()=>build({root:resolve('apps/player'),configFile:resolve('apps/player/vite.config.ts'),publicDir,build:{outDir,emptyOutDir:true},logLevel:'silent'});
 await compile();const first=await readFile(join(outDir,'sw.js'),'utf8');assert.match(first,/visualy-shell-[a-f0-9]{16}/);assert.ok(!first.includes('__VISUALY_SHELL_REVISION__'));
 await appendFile(join(publicDir,'preferences-init.js'),'\n// Simulated next release.\n');
 await compile();const next=await readFile(join(outDir,'sw.js'),'utf8');assert.notEqual(next,first,'A public asset update triggers a new installed worker and shell cache');
 console.log('PASS: production worker revision changes automatically when public player assets change.');
}finally{await rm(temporary,{recursive:true,force:true})}
