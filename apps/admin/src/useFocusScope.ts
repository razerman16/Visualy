import {useEffect,useRef,type RefObject} from 'react';

/** Keep keyboard navigation and scrolling inside an open overlay. */
export function useFocusScope<T extends HTMLElement>(ref:RefObject<T|null>,onClose:()=>void,active=true){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const root=ref.current;if(!active||!root)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const controls=()=>Array.from(root.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')).filter(el=>el.tabIndex>=0&&!el.matches(':disabled')&&!el.closest('[inert]')&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
  const focus=()=>root.focus({preventScroll:true});focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();close.current();return;}
   if(event.key!=='Tab')return;
   const items=controls(),first=items[0],last=items[items.length-1];
   if(!first){event.preventDefault();focus();return;}
   if(event.shiftKey&&(document.activeElement===first||!items.includes(document.activeElement as HTMLElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!items.includes(document.activeElement as HTMLElement))){event.preventDefault();first.focus();}
  };
  const focusin=(event:FocusEvent)=>{if(!root.contains(event.target as Node))focus();};
  document.addEventListener('keydown',keydown);document.addEventListener('focusin',focusin);
  return()=>{document.removeEventListener('keydown',keydown);document.removeEventListener('focusin',focusin);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[active,ref]);
}
