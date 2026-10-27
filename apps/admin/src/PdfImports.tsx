import {useEffect,useRef,useState} from 'react';
import {AlertCircle,CheckCircle2,Clock3,FileText,Upload,Video} from 'lucide-react';
import {api} from './api';
type Job={id:string;name:string;status:string;error?:string;mediaIds?:string[];mediaId?:string;duration?:number};
export default function PdfImports({editable,onComplete,kind='pdf'}:{editable:boolean;onComplete:()=>Promise<void>;kind?:'pdf'|'video'}){
 const [jobs,setJobs]=useState<Job[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const input=useRef<HTMLInputElement>(null),completed=useRef(onComplete);completed.current=onComplete;
 useEffect(()=>{
  let live=true,previous:string|undefined;
  async function poll(){try{const rows=await api<Job[]>(`/imports/${kind}`);if(!live)return;setJobs(rows);const next=rows.filter(j=>j.status==='done').map(j=>j.id).join();if(previous!==undefined&&next!==previous)await completed.current();previous=next;}catch(e){if(live)setError((e as Error).message)}}
  void poll();const timer=setInterval(()=>void poll(),3000);return()=>{live=false;clearInterval(timer)};
 },[kind]);
 const pdf=kind==='pdf',Icon=pdf?FileText:Video;
 return <section className="panel conversion-panel">
  <div className="conversion-heading"><div className={`conversion-icon ${pdf?'violet':'blue'}`}><Icon size={23}/></div><div className="grow"><h2>{pdf?'Documents PDF':'Conversion vidéo'}</h2><p>{pdf?'Transformez chaque page en une image prête à diffuser.':'Adaptez vos vidéos pour une lecture fluide sur vos écrans.'}</p><small>{pdf?'PDF · 25 Mo maximum · jusqu’à 50 pages':'MP4, MOV, MKV, WebM, AVI · 500 Mo maximum'}</small></div>
  {editable&&<><input ref={input} type="file" hidden aria-label={pdf?'Fichier PDF à importer':'Vidéo à convertir'} accept={pdf?'application/pdf,.pdf':'.mp4,.mov,.mkv,.webm,.avi'} disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{const form=new FormData();form.append('file',file);await api(`/imports/${kind}`,'POST',form);setJobs(await api<Job[]>(`/imports/${kind}`));}catch(err){setError((err as Error).message)}finally{setBusy(false)}}}/><button className="button secondary" disabled={busy} onClick={()=>input.current?.click()}><Upload size={15}/>{busy?'Import en cours…':pdf?'Importer un PDF':'Convertir une vidéo'}</button></>}
  </div>
  {error&&<p className="conversion-error" role="alert"><AlertCircle size={15}/>{error}</p>}
  <div aria-live="polite">{jobs.slice(0,10).map(j=><div className={`conversion-job ${j.status}`} key={j.id}>{j.status==='done'?<CheckCircle2 size={16}/>:j.status==='error'?<AlertCircle size={16}/>:<Clock3 size={16}/>}<strong>{j.name}</strong><span>{j.status==='done'?(pdf?`${j.mediaIds?.length} page(s) disponible(s)`:`MP4 disponible · ${Math.round(j.duration||0)} s`):j.status==='error'?j.error:'En attente / conversion en cours…'}</span></div>)}</div>
 </section>;
}
