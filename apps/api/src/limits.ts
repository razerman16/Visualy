import {digest} from './security.js';
export class LimitError extends Error {statusCode=429;}
// Fixed-window, bounded-cardinality limiter. Never evict active entries to admit new identities.
export class Budget {
 private entries=new Map<string,{until:number;count:number}>();
 constructor(private max:number,private window=60000,private capacity=10000){}
 take(key:string,count=1,now=Date.now()){
  for(const [k,v] of this.entries)if(v.until<=now)this.entries.delete(k);
  let entry=this.entries.get(key);
  if(!entry){if(this.entries.size>=this.capacity)throw new LimitError('Trop de requêtes. Réessayez plus tard.');entry={until:now+this.window,count:0};this.entries.set(key,entry);}
  if(entry.count+count>this.max)throw new LimitError('Trop de requêtes. Réessayez plus tard.');entry.count+=count;
 }
}
export const accountLogins=new Budget(10,15*60000);
export const userRequests=new Budget(600);
export const deviceRequests=new Budget(300);
export const deviceEvents=new Budget(100);
export const deviceEventBytes=new Budget(32768);
export const uploadRequests=new Budget(10,60000);
export const identityKey=(value:string)=>digest(value.toLowerCase());
