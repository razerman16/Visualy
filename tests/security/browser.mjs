import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {fixtures} from '../ui/fixtures.mjs';
const admin=process.env.SCENZLY_TEST_URL||'http://127.0.0.1:18380';
for(const path of ['/','/preferences-init.js','/assets/missing.js']){
 const r=await fetch(admin+path);assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
}
const browser=await chromium.launch({executablePath:process.env.SCENZLY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();let outbound=false;
 await page.route('https://security-probe.invalid/**',r=>{outbound=true;return r.abort()});
 await page.route('**/api/v1/**',r=>{const path=new URL(r.request().url()).pathname.replace('/api/v1','');let data=fixtures[path]||{};if(path==='/scenes')data=[{...fixtures['/scenes'][0],background:'url(https://security-probe.invalid/scene)'}];return r.fulfill({contentType:'application/json',body:JSON.stringify(data)})});
 await page.goto(admin);await page.getByRole('heading',{name:'Bonjour, Alexis'}).waitFor();await page.getByRole('navigation').getByRole('button',{name:'Scènes',exact:true}).click();await page.locator('.scene-content').first().waitFor();assert.equal(outbound,false);
 await page.evaluate(()=>{window.violations=[];document.addEventListener('securitypolicyviolation',e=>window.violations.push(e.effectiveDirective));const image=new Image();image.src='https://security-probe.invalid/csp';document.body.appendChild(image)});
 await page.waitForFunction(()=>window.violations.includes('img-src'));assert.equal(outbound,false);
 console.log('PASS: headers on HTML/scripts/404, app loads with CSP, legacy scene URL ignored and external image blocked.');
}finally{await browser.close()}
