import {useSyncExternalStore} from 'react';
import {getLanguage,getTheme,setLanguage,setTheme,subscribePreferences,preferenceSnapshot,t,type Language,type Theme} from '@scenzly/shared';
export default function Preferences(){
 useSyncExternalStore(subscribePreferences,preferenceSnapshot);
 return <div className="preferences" role="group" aria-label={t('Préférences d’affichage')}><label className="preference-control"><span aria-hidden="true">◐</span><select aria-label={t('Thème')} value={getTheme()} onChange={e=>setTheme(e.target.value as Theme)}><option value="light">{t('Clair')}</option><option value="dark">{t('Sombre')}</option><option value="system">{t('Système')}</option></select></label><label className="preference-control"><span aria-hidden="true">◎</span><select aria-label={t('Langue')} value={getLanguage()} onChange={e=>setLanguage(e.target.value as Language)}><option value="fr" lang="fr">FR</option><option value="en" lang="en">EN</option></select></label></div>;
}
