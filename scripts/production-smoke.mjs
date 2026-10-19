import { createProductionServer } from './serve-production.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const server=createProductionServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
  const first=await fetch(base),second=await fetch(base),html=await first.text();
  const csp=first.headers.get('content-security-policy');
  assert.ok(csp.includes("object-src 'none'")&&csp.includes("frame-ancestors 'none'"));assert.ok(!csp.includes('unsafe-inline')&&!csp.includes('unsafe-eval'));
  assert.notEqual(csp,second.headers.get('content-security-policy'));const nonce=csp.match(/'nonce-([^']+)'/)[1];assert.ok(html.includes(`ngcspnonce="${nonce}"`));
  assert.equal(first.headers.get('x-content-type-options'),'nosniff');assert.equal(first.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base,{method:'POST'})).status,405);assert.equal((await fetch(base+'/package.json')).status,404);
  assert.equal((await fetch(base+'/%2e%2e%5cpackage.json')).status,404);
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.__cspViolations.push(e.violatedDirective));});
  await page.goto(base);await page.getByRole('button',{name:'Inspect photo',exact:false}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.inspection button').disabled);
  await page.getByRole('button',{name:'Inspect photo',exact:false}).click();assert.equal(await page.locator('dialog').evaluate(d=>d.matches(':modal')),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.locator('.face-card input[type=file]').first().setInputFiles('projects/demo/public/samples/fragile.jpg');
  await page.waitForFunction(()=>!document.querySelector('.inspection button').disabled);
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__cspViolations),[]);
  console.log('Production checks passed: CSP nonces, headers, path confinement, File input, modal keyboard handling, no CSP violations.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
