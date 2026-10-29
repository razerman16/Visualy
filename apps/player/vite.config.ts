import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

// A changed bundle or public asset must also change sw.js so installed players upgrade.
function versionPlayerShell():Plugin {
 let publicDir='',outDir='';
 return {
  name:'visualy-player-shell-version',apply:'build',
  configResolved(config){publicDir=config.publicDir;outDir=resolve(config.root,config.build.outDir)},
  async writeBundle(_options,bundle){
   const hash=createHash('sha256');
   for(const name of Object.keys(bundle).sort()){
    const asset=bundle[name];hash.update(name);hash.update(asset.type==='chunk'?asset.code:asset.source);
   }
   async function includePublic(directory:string){
    for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
     const path=join(directory,entry.name);hash.update(entry.name);
     if(entry.isDirectory())await includePublic(path);else hash.update(await readFile(path));
    }
   }
   await includePublic(publicDir);
   const worker=await readFile(join(publicDir,'sw.js'),'utf8');
   await writeFile(join(outDir,'sw.js'),worker.replace('__VISUALY_SHELL_REVISION__',hash.digest('hex').slice(0,16)));
  }
 };
}
export default defineConfig({plugins:[react(),versionPlayerShell()],server:{host:'0.0.0.0',port:8081,proxy:{'/api':{target:process.env.API_URL||'http://127.0.0.1:3000',changeOrigin:false}}},build:{target:'es2022'}});
