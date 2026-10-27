import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.SCENZLY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(process.env.SCENZLY_PLAYER_URL||'http://127.0.0.1:8281');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cached=await page.evaluate(async()=>{const cache=await caches.open('scenzly-shell-v2');return (await cache.keys()).map(r=>new URL(r.url).pathname)});
 assert.ok(cached.some(p=>p.endsWith('.woff2')),'self-hosted fonts cached');
 assert.ok(cached.includes('/brand/screnzly-logo.png'),'logo cached');
 assert.ok(cached.includes('/brand/screnzly-mark.png'),'mark cached');
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:/Votre prochain message/}).waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.brand-logo').evaluate(img=>img.complete&&img.naturalWidth>0),true);
 assert.equal(await page.evaluate(()=>document.fonts.check('16px "Manrope Variable"')),true);
 console.log('PASS: production player shell, logo and local font load after an offline reload.');
}finally{await browser.close();}
