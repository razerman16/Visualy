import {getLocale,t,translateMessage} from '@visualy/shared';
export interface User {disabled?:boolean;id:string;email:string;name:string;role:'superadmin'|'admin'|'editor'|'viewer'}
export interface Media {id:string;name:string;mime:string;size:number;url:string;checksum:string;createdAt:string}
export interface SceneElement {id:string;type:'text'|'image'|'video'|'shape'|'clock'|'qr';x:number;y:number;width:number;height:number;text?:string;mediaId?:string;color?:string;background?:string;fontSize?:number;fontWeight?:number;opacity?:number;rotation?:number;zIndex?:number}
export interface Scene {summaryOnly?:boolean;id:string;name:string;width:number;height:number;background:string;elements:SceneElement[]}
export interface PlaylistItem {id:string;type:'scene'|'media';refId:string;duration:number}
export interface Program {id:string;name:string;items:PlaylistItem[];publishedVersion?:number}
export interface Group {id:string;name:string}
export interface Screen {id:string;name:string;groupId:string|null;orientation:'landscape'|'portrait';fallbackProgramId:string|null;lastSeen:string|null;currentProgramId?:string;online?:boolean}
export interface Schedule {id:string;name:string;programId:string;screenId:string|null;groupId:string|null;priority:number;kind:'weekly'|'dated'|'exception'|'urgent';startDate:string;endDate:string;startTime:string;endTime:string;days:number[];exclusions:string[];timezone:string}
export interface DeviceEvent {id:string;type:string;screenId?:string;screenName?:string;message?:string;createdAt?:string;at?:string;programId?:string}
export interface Dashboard {screens:number;online:number;media:number;programs:number}
export class AuthenticationError extends Error {readonly status=401;}
class SessionChangedError extends Error {}
let sessionVersion=0;
const pending=new Set<AbortController>();
const sessionListeners=new Set<()=>void>();
const sessionStorageKey='visualy-session-reset';
const sessionChannel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(sessionStorageKey);
const seenSessionMessages=new Set<string>();
function rememberSessionMessage(message:string){
  seenSessionMessages.add(message);
  if(seenSessionMessages.size>128)seenSessionMessages.delete(seenSessionMessages.values().next().value!);
}
function resetSession(){
  sessionVersion++;
  for(const controller of pending)controller.abort();
  for(const listener of sessionListeners)listener();
}
function receiveSessionReset(message:unknown){
  if(typeof message!=='string'||!message||seenSessionMessages.has(message))return;
  rememberSessionMessage(message);resetSession();
}
sessionChannel?.addEventListener('message',event=>receiveSessionReset(event.data));
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
  if(event.key===sessionStorageKey)receiveSessionReset(event.newValue);
});
export function subscribeSessionInvalidation(listener:()=>void){sessionListeners.add(listener);return()=>{sessionListeners.delete(listener)};}
/** The event contains no user/session information. Reset pending requests before notifying views. */
export function invalidateSession(){
  const message=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
  rememberSessionMessage(message);resetSession();
  sessionChannel?.postMessage(message);
  try{localStorage.setItem(sessionStorageKey,message)}catch{/* BroadcastChannel still works when storage is unavailable. */}
}
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const multipart=body instanceof FormData;
  const controller=new AbortController(),version=sessionVersion;
  pending.add(controller);
  const timeout=setTimeout(()=>controller.abort(),multipart?300000:30000);
  try {
    const res=await fetch('/api/v1'+path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body&&!multipart?{'Content-Type':'application/json'}:undefined,body:body?(multipart?body:JSON.stringify(body)):undefined});
    if(version!==sessionVersion)throw new SessionChangedError(t('Connexion requise'));
    // A proxy may return HTML on 401: invalidate before trying to decode the response.
    if(res.status===401&&path!=='/auth/login'&&path!=='/auth/setup'){
      invalidateSession();throw new AuthenticationError(t('Connexion requise'));
    }
    if(res.status===204)return undefined as T;
    const text=await res.text();let data;
    if(version!==sessionVersion)throw new SessionChangedError(t('Connexion requise'));
    try{data=JSON.parse(text)}catch{
      throw new Error(res.ok?t('Réponse du serveur invalide. Réessayez.'):t('La requête a échoué ({0}).',res.status));
    }
    if(!res.ok)throw Object.assign(new Error(translateMessage(data?.error||data?.message||t('La requête a échoué ({0}).',res.status))),{status:res.status});
    return data as T;
  }catch(error){
    if(error instanceof AuthenticationError)throw error;
    if(version!==sessionVersion)throw new SessionChangedError(t('Connexion requise'));
    if(controller.signal.aborted)throw new Error(t('Le serveur ne répond pas. Vérifiez la connexion puis réessayez.'));
    if(error instanceof TypeError)throw new Error(t('Connexion au serveur impossible. Vérifiez votre réseau.'));
    throw error;
  }finally{clearTimeout(timeout);pending.delete(controller)}
}
export const uid=()=>crypto.randomUUID?.() || '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
export const size=(bytes:number)=>bytes<1024*1024?t('{0} Ko',Math.round(bytes/1024)):t('{0} Mo',(bytes/1024/1024).toFixed(1));
export const date=(v?:string|null)=>v?new Intl.DateTimeFormat(getLocale(),{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):t('Jamais');
export const online=(s:Screen)=>s.online??!!(s.lastSeen&&Date.now()-new Date(s.lastSeen).getTime()<90000);
