export interface User {id:string;email:string;name:string;role:'superadmin'|'admin'|'editor'|'viewer'}
export interface Media {id:string;name:string;mime:string;size:number;url:string;checksum:string;createdAt:string}
export interface SceneElement {id:string;type:'text'|'image'|'video'|'shape'|'clock'|'qr';x:number;y:number;width:number;height:number;text?:string;mediaId?:string;color?:string;background?:string;fontSize?:number;fontWeight?:number;opacity?:number;rotation?:number;zIndex?:number}
export interface Scene {id:string;name:string;width:number;height:number;background:string;elements:SceneElement[]}
export interface PlaylistItem {id:string;type:'scene'|'media';refId:string;duration:number}
export interface Program {id:string;name:string;items:PlaylistItem[];publishedVersion?:number}
export interface Group {id:string;name:string}
export interface Screen {id:string;name:string;groupId:string|null;orientation:'landscape'|'portrait';fallbackProgramId:string|null;lastSeen:string|null;currentProgramId?:string;online?:boolean}
export interface Schedule {id:string;name:string;programId:string;screenId:string|null;groupId:string|null;priority:number;kind:'weekly'|'dated'|'exception'|'urgent';startDate:string;endDate:string;startTime:string;endTime:string;days:number[];exclusions:string[];timezone:string}
export interface DeviceEvent {id:string;type:string;screenId?:string;screenName?:string;message?:string;createdAt?:string;at?:string;programId?:string}
export interface Dashboard {screens:number;online:number;media:number;programs:number}
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const multipart=body instanceof FormData;
  const res=await fetch('/api/v1'+path,{method,credentials:'same-origin',headers:body&&!multipart?{'Content-Type':'application/json'}:undefined,body:body?(multipart?body:JSON.stringify(body)):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || data.message || `La requête a échoué (${res.status}).`);
  return data as T;
}
export const uid=()=>crypto.randomUUID?.() || '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
export const size=(bytes:number)=>bytes<1024*1024?`${Math.round(bytes/1024)} Ko`:`${(bytes/1024/1024).toFixed(1)} Mo`;
export const date=(v?:string|null)=>v?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'Jamais';
export const online=(s:Screen)=>s.online??!!(s.lastSeen&&Date.now()-new Date(s.lastSeen).getTime()<90000);
