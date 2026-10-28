import '@fontsource-variable/manrope/index.css';
import React, {useSyncExternalStore} from 'react';
import {initializePreferences,subscribePreferences,preferenceSnapshot} from '@visualy/shared';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
initializePreferences('admin');
function Root(){useSyncExternalStore(subscribePreferences,preferenceSnapshot);return <App/>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>);
