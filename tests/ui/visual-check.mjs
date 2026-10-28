// Visual smoke checks use isolated API fixtures; they never modify installation data.
// Start admin Vite on 8180 and player on 8181 before running this script.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const output=process.env.VISUALY_SCREENSHOTS||'/tmp/visualy-design';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.VISUALY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
import {fixtures,user,scenes} from './fixtures.mjs';
async function pageWithFixtures(viewport={width:1440,height:1000},auth=true){const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/v1/**',route=>{const key=new URL(route.request().url()).pathname.replace('/api/v1','');return route.fulfill({status:key==='/auth/me'&&!auth?401:200,contentType:'application/json',body:JSON.stringify(key==='/auth/me'&&!auth?{error:'Connexion requise'}:fixtures[key]||{})})});await page.goto(process.env.VISUALY_ADMIN_URL||'http://127.0.0.1:8180');await page.evaluate(()=>document.fonts.ready);return page;}
async function screenshot(page,name){await page.screenshot({path:`${output}/${name}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}: horizontal page overflow`);}
try{
 const page=await pageWithFixtures();await page.getByRole('heading',{name:'Bonjour, Alexis'}).waitFor();await screenshot(page,'dashboard');
 for(const [label,name] of [['Médiathèque','media'],['Programmes','programs'],['Planification','schedules'],['Écrans & groupes','screens'],['Supervision','events'],['Paramètres','settings']]){await page.getByRole('navigation').getByRole('button',{name:new RegExp(`^${label}`)}).click();await screenshot(page,name);}
 await page.getByRole('navigation').getByRole('button',{name:/^Écrans & groupes/}).click();await page.getByRole('button',{name:'Associer un écran',exact:true}).click();await page.getByRole('dialog').waitFor();await screenshot(page,'pair-modal');await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Scènes',exact:true}).click();await page.getByRole('button',{name:'Nouvelle scène',exact:true}).click();await page.getByLabel('Nom de la scène').waitFor();await screenshot(page,'editor');await page.getByRole('button',{name:'Fermer l’éditeur'}).click();
 const mobile=await pageWithFixtures({width:390,height:844});await mobile.getByRole('heading',{name:'Bonjour, Alexis'}).waitFor();await screenshot(mobile,'mobile-dashboard');await mobile.getByRole('button',{name:'Ouvrir le menu'}).click();assert.equal(await mobile.getByRole('button',{name:'Fermer le menu'}).getAttribute('aria-expanded'),'true');await screenshot(mobile,'mobile-menu');await mobile.getByRole('navigation').getByRole('button',{name:'Médiathèque',exact:true}).click();await screenshot(mobile,'mobile-media');
 const login=await pageWithFixtures({width:1440,height:1000},false);await login.getByRole('button',{name:'Se connecter'}).waitFor();await screenshot(login,'login');await login.setViewportSize({width:390,height:844});await screenshot(login,'mobile-login');
 const player=await browser.newPage({viewport:{width:1440,height:1000}});player.on('pageerror',e=>errors.push(e.message));await player.goto(process.env.VISUALY_PLAYER_URL||'http://127.0.0.1:8181');await player.getByLabel('Code de jumelage').waitFor();await player.evaluate(()=>document.fonts.ready);await screenshot(player,'player');
 assert.deepEqual(errors,[]);console.log('PASS: 15 visual captures, desktop/mobile navigation, editor and pairing dialog; no JavaScript error or horizontal overflow.');
}finally{await browser.close();}
