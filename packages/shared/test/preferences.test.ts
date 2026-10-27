import {test} from 'node:test';
import assert from 'node:assert/strict';
import {t,translateMessage,setLanguage,getLanguage,setTheme,getTheme,subscribePreferences,resolvedTheme} from '../src/preferences.js';
import {english} from '../src/translations.js';
test('translations interpolate values literally without translating user content',()=>{
 setLanguage('en');assert.equal(t('Bonjour{0}',', Écran français'),'Hello, Écran français');assert.equal(t('Supprimer {0}','${name} <x>'), 'Delete ${name} <x>');assert.equal(t('custom content'),'custom content');setLanguage('fr');assert.equal(t('Bonjour{0}',', Alexis'),'Bonjour, Alexis');
});
test('stored notifications and validation errors translate in both directions',()=>{
 setLanguage('en');assert.equal(translateMessage('Adresse ou mot de passe incorrect'),'Incorrect email or password');assert.equal(translateMessage('name: Date invalide'),'name: Invalid date');assert.equal(translateMessage('Serveur indisponible (503).'),'Server unavailable (503).');setLanguage('fr');assert.equal(translateMessage('Server unavailable (503).'),'Serveur indisponible (503).');assert.equal(translateMessage('Unknown device ABC'),'Unknown device ABC');
});
test('preferences notify subscribers and ignore invalid options',()=>{
 let notifications=0;const unsubscribe=subscribePreferences(()=>notifications++);setTheme('dark');assert.equal(getTheme(),'dark');assert.equal(resolvedTheme(),'dark');setLanguage('en');assert.equal(getLanguage(),'en');assert.equal(notifications,2);setTheme('invalid' as any);setLanguage('invalid' as any);assert.equal(notifications,2);unsubscribe();setTheme('light');setLanguage('fr');assert.equal(notifications,2);
});
test('English translations contain no unknown interpolation slots',()=>{
 for(const [source,target] of Object.entries(english)){const slots=new Set(source.match(/\{\d+\}/g)||[]);for(const slot of target.match(/\{\d+\}/g)||[])assert.ok(slots.has(slot),`${source}: invalid ${slot}`)}
});
