export default function Brand({compact=false}:{compact?:boolean}) {
 return <span className={compact?'brand-art compact':'brand-art'}><img src={compact?"/brand/screnzly-mark.png":"/brand/screnzly-logo.png"} alt="Screnzly" width="2172" height="724"/></span>;
}
