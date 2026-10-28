import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sceneSchema,programSchema} from '../../apps/api/src/validation.js';
import {Budget} from '../../apps/api/src/limits.js';
test('scene colors reject URL loads and CSS injection',()=>{
 const scene={name:'test',width:1920,height:1080,background:'#123456',elements:[]};
 for(const background of ['#fff','#12345678','transparent'])assert.equal(sceneSchema.safeParse({...scene,background}).success,true);
 for(const background of ['url(https://example.test/x)','red; background:url(x)','var(--evil)','linear-gradient(red,blue)'])assert.equal(sceneSchema.safeParse({...scene,background}).success,false);
 assert.equal(sceneSchema.safeParse({...scene,elements:[{id:'x',type:'shape',x:0,y:0,width:100,height:100,background:'url(x)'}]}).success,false);
});
test('oversized collections fail before validating elements',()=>{
 let reads=0;const malicious={get type(){reads++;return 'invalid'}};
 const result=programSchema.safeParse({name:'test',items:Array(10000).fill(malicious)});assert.equal(result.success,false);assert.equal(reads,0);
});
test('identity budgets isolate devices, expire and reject cardinality flooding',()=>{
 const budget=new Budget(3,1000,2);budget.take('a',3,0);assert.throws(()=>budget.take('a',1,1));budget.take('b',1,1);assert.throws(()=>budget.take('c',1,2));budget.take('a',1,1001);
});
