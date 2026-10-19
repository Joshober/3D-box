import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(process.env.DEMO_URL??'http://127.0.0.1:4203');
  await page.waitForFunction(()=>{const button=document.querySelector('.inspection button');return button&&!button.disabled;});
  await page.getByRole('checkbox',{name:'Estimate shape from photos'}).check();
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.locator('.face-card input[type=file]').first().setInputFiles('projects/demo/public/samples/fragile.jpg');
  await page.waitForFunction(()=>!document.querySelector('.inspection button').disabled);
  await page.locator('box-photo-viewer nav').getByRole('button',{name:'top',exact:true}).click();
  await page.getByRole('button',{name:'Reset view',exact:false}).click();
  assert.deepEqual(errors,[]);console.log('Development runtime passed: startup, auto mode, clear, upload, face navigation, reset; no Angular runtime errors.');
}finally{await browser.close();}
