export default function Brand({compact=false}:{compact?:boolean}) {
 return <span className={compact?'brand-art compact':'brand-art'}>
  <img className={compact?undefined:'brand-light'} src={compact?"/brand/visualy-mark.png":"/brand/visualy-logo.png"} alt="Visualy" width={compact?644:2018} height={compact?644:553}/>
  {!compact&&<img className="brand-dark" src="/brand/visualy-logo-dark.png" alt="Visualy" width="2018" height="553"/>}
 </span>;
}
