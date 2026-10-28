import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyIdentity,migrateBrowserStorage,removeBrowserItem,sessionToken} from '../src/legacy.js';
function withStorage(fn:(values:Map<string,string>,storage:Storage)=>void){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}} as Storage;
 Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});
 try{fn(values,storage)}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage}
}
test('legacy preferences, identity and pairing move once without replacing newer Visualy values',()=>withStorage((values)=>{
 for(const [key,old] of Object.entries(legacyIdentity.storage))values.set(old,`original:${key}`);
 values.set('visualy-theme','dark');migrateBrowserStorage();
 for(const [key,old] of Object.entries(legacyIdentity.storage)){assert.equal(values.get(key),key==='visualy-theme'?'dark':`original:${key}`);assert.equal(values.has(old),false)}
 const snapshot=[...values];migrateBrowserStorage();assert.deepEqual([...values],snapshot);
 removeBrowserItem('visualy-player-token');migrateBrowserStorage();assert.equal(values.has('visualy-player-token'),false);
}));
test('failed storage migration leaves the legacy value intact',()=>withStorage((values,storage)=>{
 const old=legacyIdentity.storage['visualy-player-token'];values.set(old,'existing-pairing');storage.setItem=()=>{throw new Error('quota')};
 migrateBrowserStorage();assert.equal(values.get(old),'existing-pairing');assert.equal(values.has('visualy-player-token'),false);
}));
test('new session cookies take precedence over compatible legacy sessions',()=>{
 assert.equal(sessionToken({[legacyIdentity.sessionCookie]:'old'}),'old');assert.equal(sessionToken({visualy_session:'new',[legacyIdentity.sessionCookie]:'old'}),'new');assert.equal(sessionToken({}),undefined);
});
