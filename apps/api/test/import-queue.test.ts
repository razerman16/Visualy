import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as flush} from 'node:timers/promises';
import Fastify from 'fastify';
import {registerImportWorker} from '../src/import-queue.js';

test('an empty PDF queue cannot starve video; slow cycles never overlap',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const app=Fastify();let release!:()=>void,locked=false,pdfCalls=0,completedVideos=0;
 const gate=new Promise<void>(resolve=>{release=resolve});
 registerImportWorker(app,async()=>{pdfCalls++;locked=true;if(pdfCalls===1)await gate;locked=false;});
 registerImportWorker(app,async()=>{assert.equal(locked,false);completedVideos++;});
 await app.ready();
 try{
  t.mock.timers.tick(2000);await flush();assert.equal(pdfCalls,1);assert.equal(completedVideos,0);
  t.mock.timers.tick(10000);await flush();assert.equal(pdfCalls,1,'do not start a second cycle while work is pending');
  release();await flush();assert.equal(completedVideos,1,'video runs after the empty PDF transaction releases its lock');
  for(let i=0;i<5;i++){t.mock.timers.tick(2000);await flush();}
  assert.equal(completedVideos,6);assert.equal(pdfCalls,6);
 }finally{release();await app.close();}
});

test('failure of one import queue does not stop the other queue',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const app=Fastify();let videos=0;
 registerImportWorker(app,async()=>{throw new Error('database unavailable')});
 registerImportWorker(app,async()=>{videos++});await app.ready();
 try{for(let i=0;i<2;i++){t.mock.timers.tick(2000);await flush();}assert.equal(videos,2);}
 finally{await app.close();}
});

test('shutdown waits for the active import and does not start another job',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const app=Fastify();let release!:()=>void,closed=false,videos=0;
 const gate=new Promise<void>(resolve=>{release=resolve});
 registerImportWorker(app,()=>gate);registerImportWorker(app,async()=>{videos++});await app.ready();
 t.mock.timers.tick(2000);await flush();const closing=app.close().then(()=>{closed=true});await flush();
 try{assert.equal(closed,false);t.mock.timers.tick(10000);release();await closing;t.mock.timers.tick(10000);await flush();assert.equal(videos,0);}
 finally{release();await closing;}
});
