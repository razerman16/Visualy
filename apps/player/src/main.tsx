import Preferences from './Preferences';
import {initializePreferences,subscribePreferences,preferenceSnapshot} from '@scenzly/shared';
import {t,translateMessage} from '@scenzly/shared';
import '@fontsource-variable/manrope/index.css';
import React, { useCallback, useSyncExternalStore, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { selectProgram, type Manifest } from '@scenzly/shared';
import { clearOffline, prepareManifest, storedManifest, type Prepared } from './offline';
import { deviceId } from './playback';
import { Fallback, Mark, Playback } from './render';
import './style.css';

const API = '/api/v1';
class Revoked extends Error {}
async function api<T>(path: string, token?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(API + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal });
  if (token && response.status === 401) throw new Revoked(t("Cet écran a été dissocié."));
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || t("Serveur indisponible ({0}).", response.status));
  return value;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : t("Erreur de synchronisation."); }
function Pairing({ paired, notice }: { paired: (token: string) => void; notice: string }) {
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [id] = useState(deviceId);
  useEffect(() => {
    const controller = new AbortController(); let requestId = ''; let busy = false;
    async function poll() {
      if (busy || controller.signal.aborted) return; busy = true;
      try {
        if (!requestId) {
          const created = await api<{ requestId: string; code: string; expiresAt: string }>('/players/pair/request', undefined, { deviceId: id }, controller.signal);
          requestId = created.requestId; setPair(created); setError('');
        } else {
          const result = await api<{ status: string; token?: string }>(`/players/pair/status/${encodeURIComponent(requestId)}?deviceId=${encodeURIComponent(id)}`, undefined, undefined, controller.signal);
          if (result.status === 'paired' && result.token) { paired(result.token); return; }
          if (result.status === 'expired' || result.status === 'paired') { requestId = ''; setPair(null); }
          setError('');
        }
      } catch (err) { if (!controller.signal.aborted) setError(errorMessage(err)); }
      finally { busy = false; }
    }
    void poll(); const interval = setInterval(() => void poll(), 3000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [id, paired]);
  return <div className="pairing"><div className="pairing-top"><div className="brand"><img className="brand-logo" src="/brand/screnzly-logo.png" alt="Screnzly"/></div><div className="pairing-actions"><Preferences/><span className="pill"><span className="status-dot" />{" "}{t("Lecteur local")}</span></div></div>
    <main className="pair-card"><div className="screen-icon"><svg viewBox="0 0 72 72" fill="none"><rect x="8" y="12" width="56" height="38" rx="5" stroke="currentColor" strokeWidth="3"/><path d="M25 61h22M36 51v10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="m31 25 12 6-12 7V25Z" fill="currentColor"/></svg></div>
      <span className="eyebrow">{t("CONNECTONS VOTRE ÉCRAN")}</span><h1>{t("Votre prochain message")}<br/><span>{t("commence ici.")}</span></h1><p>{t("Dans l’administration Screnzly, ouvrez")}{" "}<strong>{t("Écrans")}</strong>,<br/>{t("puis associez cet écran avec le code ci-dessous.")}</p>
      <div className="pair-code" aria-live="polite" aria-label={t("Code de jumelage")}>{pair?.code || '••• •••'}</div>
      <div className="waiting"><span className="pulse-dot" />{pair ? t("En attente de votre confirmation") : t("Connexion au serveur local…")}</div>
      {notice && <p className="notice" role="status">{translateMessage(notice)}</p>}{error && <p className="notice error" role="alert">{translateMessage(error)}</p>}
      {!isSecureContext && <p className="context-note">{t("Lecture disponible sur le réseau local.")}<br/>{t("Activez HTTPS pour conserver les contenus après un redémarrage hors connexion.")}</p>}
    </main><footer className="pair-footer"><span>{t("Votre contenu. Vos écrans. Votre réseau.")}</span><span title={id}>{t("Appareil")}{" "}{id.slice(0, 8)}</span></footer></div>;
}
function App() {
  const [token, setToken] = useState(() => localStorage.getItem('scenzly-player-token') || '');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const active = useRef<Prepared | null>(null);
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState(t("Synchronisation en cours…"));
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const [maintenance, setMaintenance] = useState(localStorage.getItem('scenzly-maintenance') === 'true');
  const [showControls, setShowControls] = useState(false);
  const currentProgram = useRef<string | null>(null);
  const events = useRef<Array<{ type: string; programId?: string; itemId?: string; message?: string; at: string }>>([]);
  const lastError = useRef('');
  const queueEvent = useCallback((event: { type: string; itemId?: string; message?: string }) => { events.current.push({ ...event, ...(currentProgram.current ? { programId: currentProgram.current } : {}), at: new Date().toISOString() }); if (events.current.length > 100) events.current.shift(); }, []);
  const onItem = useCallback((itemId: string) => queueEvent({ type: 'play', itemId }), [queueEvent]);
  const onError = useCallback((message: string) => { if (lastError.current === message) return; lastError.current = message; setStatus(message); queueEvent({ type: 'error', message }); }, [queueEvent]);
  const paired = useCallback((value: string) => { localStorage.setItem('scenzly-player-token', value); setNotice(''); setToken(value); }, []);
  useEffect(() => { const interval = setInterval(() => setNow(new Date()), 250); return () => clearInterval(interval); }, []);
  useEffect(() => { if (!showControls) return; const timer = setTimeout(() => setShowControls(false), 6000); return () => clearTimeout(timer); }, [showControls]);
  useEffect(() => {
    if ('serviceWorker' in navigator && isSecureContext && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => setStatus(t("Cache de la page indisponible : vérifiez le stockage du navigateur.")));
  }, []);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController(); let busy = false; let didRestore = false;
    const activate = (next: Prepared) => {
      if (controller.signal.aborted) { next.release(); return; }
      const previous = active.current; active.current = next; setPrepared(next);
      if (previous) setTimeout(previous.release, 2000);
      setStatus(next.durable ? '' : t("HTTPS requis pour le cache après redémarrage."));
    };
    async function sync() {
      if (busy || controller.signal.aborted) return; busy = true;
      try {
        if (!didRestore) {
          didRestore = true; const stored = storedManifest();
          if (stored) { try { activate(await prepareManifest(stored, token, controller.signal)); } catch { /* Fetch latest below; no unverified partial revision is activated. */ } }
        }
        const manifest = await api<Manifest>('/players/me/manifest', token, undefined, controller.signal);
        if (manifest.revision !== active.current?.manifest.revision) activate(await prepareManifest(manifest, token, controller.signal));
        const heartbeat = await api<{ commands: Array<{ id: string; type: string }> }>('/players/me/heartbeat', token, { programId: currentProgram.current || undefined, revision: active.current?.manifest.revision, error: lastError.current || undefined }, controller.signal);
        for (const command of heartbeat.commands || []) {
          if (command.type === 'maintenance' || command.type === 'resume') { const value = command.type === 'maintenance'; localStorage.setItem('scenzly-maintenance', String(value)); setMaintenance(value); }
          if (command.type === 'clear-cache') { await clearOffline(); activate(await prepareManifest(manifest, token, controller.signal)); }
          if (command.type === 'refresh') { const refreshed = await api<Manifest>('/players/me/manifest', token, undefined, controller.signal); if (refreshed.revision !== active.current?.manifest.revision) activate(await prepareManifest(refreshed, token, controller.signal)); }
        }
        if (events.current.length) { const batch = events.current.splice(0, 25); try { await api('/players/me/events', token, { events: batch }, controller.signal); } catch (err) { events.current.unshift(...batch); if (err instanceof Revoked) throw err; } }
        setOffline(false);
        setStatus(lastError.current || (active.current?.durable ? '' : t("HTTPS requis pour le cache après redémarrage.")));
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof Revoked) {
          localStorage.removeItem('scenzly-player-token'); localStorage.removeItem('scenzly-maintenance');
          await clearOffline().catch(() => {}); active.current?.release(); active.current = null; setPrepared(null); setMaintenance(false); setNotice(t("Écran dissocié : utilisez ce nouveau code pour le reconnecter.")); events.current = []; setToken('');
        } else { setOffline(true); setStatus(errorMessage(err)); }
      } finally { busy = false; }
    }
    void sync(); const interval = setInterval(() => void sync(), 10000);
    const wake = () => { setNow(new Date()); void sync(); }; window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake); };
  }, [token]);
  const selected = prepared ? selectProgram(prepared.manifest.schedules, now, prepared.manifest.fallbackProgramId) : null;
  const program = prepared?.manifest.programs.find(p => p.id === selected);
  currentProgram.current = maintenance ? null : program?.id || null;
  if (!token) return <Pairing paired={paired} notice={translateMessage(notice)} />;
  return <div className={`player ${showControls ? 'controls-visible' : ''}`} onPointerMove={() => setShowControls(true)} onClick={() => setShowControls(true)} onKeyDown={() => setShowControls(true)} tabIndex={-1}>
    {maintenance ? <Fallback title={t("Maintenance en cours")} message={t("La diffusion reprendra dès la fin de l’intervention.")} /> : program && prepared ? <Playback key={`${program.id}:${program.version}`} program={program} urls={prepared.urls} now={now} onItem={onItem} onError={onError} /> : <Fallback title={prepared ? undefined : t("Préparation de votre écran")} message={prepared ? undefined : t("Téléchargement et vérification de vos contenus…")} />}
    {(offline || status) && <div className="diagnostic" role="status"><span className={`status-dot ${offline ? 'amber' : ''}`} />{offline ? t("Hors connexion · {0}", prepared ? t("dernière programmation conservée") : status) : translateMessage(status)}</div>}
    {showControls && <div className="player-toolbar"><Preferences/><span>{prepared?.manifest.screen.name || 'Screnzly'}</span><button onClick={() => { if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => setStatus(t("Activez le mode plein écran du navigateur (F11)."))); else void document.exitFullscreen(); }}>{t("Plein écran")}</button></div>}
  </div>;
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <Fallback title={t("Le lecteur ne peut pas démarrer")} message={t("Vérifiez que le stockage local du navigateur est autorisé. {0}", this.state.error)} /> : this.props.children; }
}
initializePreferences('player');
function Root(){useSyncExternalStore(subscribePreferences,preferenceSnapshot);return <ErrorBoundary><App/></ErrorBoundary>}
createRoot(document.getElementById('root')!).render(<Root/>);
