import {english} from './translations.js';
export type Language='fr'|'en';
export type Theme='light'|'dark'|'system';
const read=(key:string)=>{try{return globalThis.localStorage?.getItem(key)}catch{return null}};
let language:Language=read('screnzly-language')==='en'?'en':'fr';
let theme:Theme=['light','dark','system'].includes(read('screnzly-theme')||'')?read('screnzly-theme') as Theme:'system';
const listeners=new Set<()=>void>();
let app:'admin'|'player'='admin';
export const getLanguage=()=>language;
export const getTheme=()=>theme;
export const getLocale=()=>language==='en'?'en-GB':'fr-FR';
export const resolvedTheme=()=>theme==='system'?(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;
export const preferenceSnapshot=()=>`${language}:${theme}:${resolvedTheme()}`;
export function subscribePreferences(callback:()=>void){listeners.add(callback);return()=>{listeners.delete(callback)}}
export function t(key:string,...values:unknown[]):string{return (language==='en'?english[key]||key:key).replace(/\{(\d+)\}/g,(_match,index)=>String(values[Number(index)]??''));}
export function translateMessage(value:string):string{
 if(english[value])return language==='en'?english[value]:value;
 for(const [fr,en] of Object.entries(english)){
  if(value===en)return language==='fr'?fr:en;
  // Translate stored notifications/errors in either direction without touching user content.
  for(const [source,target] of (language==='en'?[[fr,en]]:[[en,fr]])){
   if(!/\{\d+\}/.test(source))continue;
   const indices:number[]=[];
   const pattern=source.split(/(\{\d+\})/).map(part=>{const m=/^\{(\d+)\}$/.exec(part);if(m){indices.push(Number(m[1]));return '(.*?)'}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('');
   const match=new RegExp(`^${pattern}$`,'s').exec(value);if(match){const args:Record<number,string>={};indices.forEach((index,i)=>{args[index]=match[i+1]});return target.replace(/\{(\d+)\}/g,(_m,i)=>args[Number(i)]||'');}
  }
 }
 if(value.includes('; '))return value.split('; ').map(translateMessage).join('; ');
 const separator=value.indexOf(': ');if(separator>0){const tail=value.slice(separator+2);const translated=translateMessage(tail);if(translated!==tail)return value.slice(0,separator+2)+translated;}
 return value;
}
function apply(){if(typeof document!=='undefined'){document.documentElement.lang=language;document.documentElement.dataset.theme=resolvedTheme();document.documentElement.style.colorScheme=resolvedTheme();document.title=t(app==='admin'?'Screnzly — Administration':'Screnzly · Écran');}for(const callback of listeners)callback();}
function save(key:string,value:string){try{localStorage.setItem(key,value)}catch{/* Private browsing may deny storage; keep session preferences. */}}
export function setLanguage(value:Language){if(value!=='fr'&&value!=='en')return;language=value;save('screnzly-language',value);apply();}
export function setTheme(value:Theme){if(!['light','dark','system'].includes(value))return;theme=value;save('screnzly-theme',value);apply();}
export function initializePreferences(target:'admin'|'player'){
 app=target;apply();
 const media=globalThis.matchMedia?.('(prefers-color-scheme: dark)');media?.addEventListener('change',apply);
 globalThis.addEventListener?.('storage',event=>{if(event.key==='screnzly-language'||event.key==='screnzly-theme'||event.key===null){language=read('screnzly-language')==='en'?'en':'fr';const saved=read('screnzly-theme');theme=saved==='dark'||saved==='light'?saved:'system';apply();}});
}
