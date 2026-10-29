// Production player upgrade on the same origin, with no installation data involved.
import {chromium} from '@playwright/test';
import {legacyIdentity} from '@visualy/shared';
import assert from 'node:assert/strict';
const player=process.env.VISUALY_PLAYER_URL||'http://127.0.0.1:8381';
const browser=await chromium.launch({executablePath:process.env.VISUALY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext(),page=await context.newPage();
 await page.route('**/__legacy-upgrade',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Upgrade fixture</title>'}));await page.goto(player+'/__legacy-upgrade');
 await page.evaluate(async legacy=>{
  localStorage.setItem(legacy.storage['visualy-language'],'en');localStorage.setItem(legacy.storage['visualy-theme'],'dark');localStorage.setItem(legacy.storage['visualy-device-id'],'existing-screen');
  const shell=await caches.open(legacy.shellCachePrefix+'v5');await shell.put('/old-shell',new Response('previous interface'));
 },legacyIdentity);
 await page.goto(player);await page.getByRole('heading',{name:/Your next message/}).waitFor();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.deepEqual(await page.evaluate(legacy=>({current:localStorage.getItem('visualy-device-id'),previous:localStorage.getItem(legacy.storage['visualy-device-id'])}),legacyIdentity),{current:'existing-screen',previous:null});
 await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
 assert.equal(await page.evaluate(async prefix=>(await caches.keys()).some(name=>name.startsWith(prefix)),legacyIdentity.shellCachePrefix),false,'Legacy shell retired before going offline');
 assert.ok((await page.evaluate(()=>caches.keys())).some(name=>/^visualy-shell-[a-f0-9]{16}$/.test(name)));
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:/Your next message/}).waitFor();assert.equal(await page.title(),'Visualy · Player');
 console.log('PASS: browser upgrade retains language/theme/device identity, retires the legacy shell, and reloads Visualy offline.');
}finally{await browser.close()}
