import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root=resolve('tests/consumer/dist/browser');
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+'\\')&&!file.startsWith(root+'/')){res.writeHead(403).end();return;}
    const bytes=await readFile(file);
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]??'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(4201,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__releasedContexts=0;
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      const ctx=original.apply(this,[type,...args]);
      if(ctx&&(type==='webgl'||type==='webgl2')&&!ctx.__instrumented){
        ctx.__instrumented=true;const getExtension=ctx.getExtension.bind(ctx);
        ctx.getExtension=function(name){const ext=getExtension(name);if(name==='WEBGL_lose_context'&&ext&&!ext.__instrumented){ext.__instrumented=true;const lose=ext.loseContext.bind(ext);ext.loseContext=()=>{window.__releasedContexts++;lose();};}return ext;};
      }
      return ctx;
    };
  });
  await page.goto('http://127.0.0.1:4201');
  await page.locator('box-photo-viewer canvas').waitFor();
  const canvas=page.locator('box-photo-viewer canvas');
  const original=await canvas.screenshot();const rect=await canvas.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+100,rect.y+rect.height/2+40,{steps:8});await page.mouse.up();
  const rotated=await canvas.screenshot();assert.notDeepEqual(rotated,original,'Dragging must rotate the box');
  await page.mouse.wheel(0,-180);const zoomed=await canvas.screenshot();assert.notDeepEqual(zoomed,rotated,'Scrolling must zoom the box');
  // Exercise the public inputs directly, without the demo's preflight validation.
  const input=page.getByLabel('Host photo');
  await input.setInputFiles('projects/demo/public/samples/fragile.jpg');
  await page.waitForFunction(()=>!document.querySelector('.inspection button').disabled);
  assert.equal(await page.locator('.messages').count(),0);
  await input.setInputFiles({name:'forged.jpg',mimeType:'image/jpeg',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')});
  await page.waitForFunction(()=>document.querySelector('.messages')?.textContent.includes('Cannot load photo'));
  assert.equal(await page.getByRole('button',{name:'Inspect photo',exact:false}).isDisabled(),true);
  let externalRequests=0;
  const photo=await readFile('projects/demo/public/samples/fragile.jpg');
  await page.route('https://photos.example/**',async route=>{externalRequests++;assert.equal(route.request().headers()['cookie'],undefined);assert.equal(route.request().headers()['authorization'],undefined);assert.equal(route.request().headers()['referer'],undefined);await route.fulfill({status:200,contentType:'image/jpeg',headers:{'access-control-allow-origin':'*'},body:photo});});
  await page.getByLabel('Photo URL').fill('https://photos.example/front.jpg');await page.getByRole('button',{name:'Load URL',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.messages')?.textContent.includes('origin is not allowed'));assert.equal(externalRequests,0);
  await page.getByRole('button',{name:'Allow test origin',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.inspection button').disabled);assert.ok(externalRequests>0);
  for(let i=0;i<5;i++){
    await page.getByRole('button',{name:'Toggle viewer',exact:true}).click();await page.locator('box-photo-viewer canvas').waitFor({state:'detached'});
    await page.waitForFunction(expected=>window.__releasedContexts===expected,i+1);
    await page.getByRole('button',{name:'Toggle viewer',exact:true}).click();await page.locator('box-photo-viewer canvas').waitFor();
  }
  assert.deepEqual(errors,[]);console.log('Consumer runtime passed: direct File input, forged image rejection, blocked/allowed remote origins without credentials, mouse rotation, zoom, five mount/unmount cycles and WebGL releases.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
