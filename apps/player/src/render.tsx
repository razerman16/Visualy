import {t,translateMessage} from '@scenzly/shared';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Media, Scene, SceneElement, PublishedProgram } from '@scenzly/shared';
import { playlistPosition } from './playback';

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let live = true; QRCode.toDataURL(text || 'Screnzly', { margin: 1, width: 512, errorCorrectionLevel: 'M' }).then(value => { if (live) setSrc(value); }).catch(() => { if (live) setSrc(''); }); return () => { live = false; }; }, [text]);
  return src ? <img src={src} className="element-asset" alt={t("QR code")} /> : null;
}
function Element({ element: e, urls, now, onError }: { element: SceneElement; urls: Record<string, string>; now: Date; onError: (error: string) => void }) {
  const style: React.CSSProperties = { position: 'absolute', left: e.x, top: e.y, width: e.width, height: e.height, color: e.color || '#ffffff', background: e.background || 'transparent', fontSize: e.fontSize || 40, fontWeight: e.fontWeight || 'normal', opacity: e.opacity ?? 1, transform: `rotate(${e.rotation || 0}deg)`, zIndex: e.zIndex || 0, overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
  const source = e.mediaId ? urls[e.mediaId] : null;
  return <div style={style}>
    {e.type === 'text' && e.text}
    {e.type === 'clock' && <span>{now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}</span>}
    {e.type === 'qr' && <Qr text={e.text || ''} />}
    {e.type === 'image' && source && <img className="element-asset" src={source} alt="" onError={() => onError(t("Une image de la scène ne peut pas être décodée."))} />}
    {e.type === 'video' && source && <video className="element-asset" src={source} autoPlay muted loop playsInline onError={() => onError(t("Une vidéo de la scène ne peut pas être décodée."))} />}
  </div>;
}
export function SceneView({ scene, urls, now, onError }: { scene: Scene; urls: Record<string, string>; now: Date; onError: (error: string) => void }) {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => { const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const scale = Math.min(viewport.width / scene.width, viewport.height / scene.height);
  return <div className="scene-viewport"><div className="scene" style={{ width: scene.width, height: scene.height, background: scene.background, transform: `translate(-50%, -50%) scale(${scale})` }}>
    {scene.elements.map(element => <Element key={element.id} element={element} urls={urls} now={now} onError={onError} />)}
  </div></div>;
}
function MediaView({ media, url, onError }: { media: Media; url: string; onError: (error: string) => void }) {
  if (media.mime.startsWith('video/')) return <video className="full-media" src={url} autoPlay muted playsInline loop onError={() => onError(t("Format vidéo non lisible : {0}.", media.name))} />;
  return <img className="full-media" src={url} alt="" onError={() => onError(t("Image non lisible : {0}.", media.name))} />;
}
export function Playback({ program, urls, now, onItem, onError }: { program: PublishedProgram; urls: Record<string, string>; now: Date; onItem: (itemId: string) => void; onError: (error: string) => void }) {
  const [started] = useState(() => Date.now());
  const position = playlistPosition(program.items, now.getTime() - started);
  const item = position?.item;
  useEffect(() => { if (item) onItem(item.id); }, [item?.id, onItem]);
  if (!item) return <Fallback title={t("Programme vide")} message={t("Ajoutez des éléments au programme, puis publiez-le.")} />;
  const scene = item.type === 'scene' ? program.scenes.find(s => s.id === item.refId) : undefined;
  const media = item.type === 'media' ? program.media.find(m => m.id === item.refId) : undefined;
  if (scene) return <SceneView key={item.id} scene={scene} urls={urls} now={now} onError={onError} />;
  if (media && urls[media.id]) return <MediaView key={item.id} media={media} url={urls[media.id]} onError={onError} />;
  return <Fallback title={t("Contenu indisponible")} message={t("Le dernier programme disponible sera repris après synchronisation.")} />;
}
export function Mark() { return <div className="brand-mark" aria-hidden="true"><img src="/brand/screnzly-mark.png" alt=""/></div>; }
export function Fallback({ title = t("Votre écran est prêt"), message = t("Affectez un programme de secours ou une programmation depuis l’administration.") }: { title?: string; message?: string }) {
  return <div className="fallback"><Mark /><h1>{title}</h1><p>{message}</p><span className="fallback-signature">{t("Screnzly · Affichage dynamique")}</span></div>;
}
