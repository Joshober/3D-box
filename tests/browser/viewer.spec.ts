import { test,expect } from '@playwright/test';

test('real sample photos, six face views, dimensions and enlarged inspection',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.count')).toHaveText('6 / 6');
  await expect(page.getByRole('button',{name:'Inspect photo',exact:false})).toBeEnabled();
  await expect(page.locator('canvas[aria-label="3D photo box"]')).toBeVisible();
  await expect(page.locator('.messages')).toHaveCount(0);
  for(const face of ['front','back','left','right','top','bottom']){
    const button=page.locator('box-photo-viewer nav').getByRole('button',{name:face,exact:true});
    await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('box-photo-editor .head strong')).toHaveText(`${face} photo`);
  }
  await page.getByRole('button',{name:'Inspect photo',exact:false}).click();
  await expect(page.locator('dialog img')).toBeVisible();
  await page.getByRole('button',{name:'Close ✕'}).click();
  const width=page.getByRole('spinbutton',{name:'width',exact:true});await width.fill('55');await width.press('Tab');await expect(width).toHaveValue('55');
  await page.getByRole('button',{name:'Reset view',exact:false}).click();
  await page.screenshot({path:'test-results/parcel-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('upload, corner alignment, rotation, missing face and invalid file',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await expect(page.locator('.count')).toHaveText('0 / 6');
  await page.locator('.face-card').first().locator('input[type=file]').setInputFiles('projects/demo/public/samples/fragile.jpg');
  await expect(page.locator('.count')).toHaveText('1 / 6');
  await page.getByRole('button',{name:'Select corners',exact:true}).click();
  const svg=page.locator('box-photo-editor svg');const rect=(await svg.boundingBox())!;
  for(const [x,y] of [[.318,.241],[.662,.245],[.66,.61],[.316,.611]])await svg.click({position:{x:x*rect.width,y:y*rect.height}});
  await page.getByRole('button',{name:'Apply alignment',exact:true}).click();
  await expect(page.locator('box-photo-editor [role=alert]')).toHaveCount(0);
  await page.getByRole('button',{name:'Rotate 90°',exact:true}).click();
  await page.locator('box-photo-editor summary').click();await expect(page.locator('box-photo-editor img.preview')).toBeVisible();
  await page.getByRole('button',{name:'Remove front photo',exact:true}).click();await expect(page.locator('.count')).toHaveText('0 / 6');
  await page.locator('.face-card').first().locator('input[type=file]').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG');
});

test('mobile layout supports touch input and face selection',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();
  await page.goto('/');await expect(page.getByRole('button',{name:'Inspect photo',exact:false})).toBeEnabled();
  await page.locator('box-photo-viewer nav').getByRole('button',{name:'bottom',exact:true}).tap();
  await expect(page.locator('box-photo-viewer nav button.active')).toHaveText('bottom');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/parcel-mobile.png',fullPage:true});await context.close();
});

test('six distinct photo fixtures render on the correct face with upright corners',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Clear all',exact:true}).click();
  const colors=['#c85050','#50a050','#5080c8','#c8a050','#a050c8','#50a0a0'];
  const faces=['front','back','left','right','top','bottom'];
  for(const [i,face] of faces.entries()){
    const data=await page.evaluate(({color,face})=>{const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,512,512);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,256,256);ctx.fillStyle='#000000';ctx.fillRect(256,0,256,256);ctx.font='30px sans-serif';ctx.fillText(face+' ↑',12,400);return c.toDataURL().split(',')[1];},{color:colors[i],face});
    await page.locator('.face-card').nth(i).locator('input[type=file]').setInputFiles({name:`${face}.png`,mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  }
  for(const [i,face] of faces.entries()){
    await page.locator('box-photo-viewer nav').getByRole('button',{name:face,exact:true}).click();
    await expect(page.getByRole('button',{name:'Inspect photo',exact:false})).toBeEnabled();
    // Two animation frames let OrbitControls settle before screenshot capture.
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const png=await page.locator('canvas[aria-label="3D photo box"]').screenshot();
    const samples=await page.evaluate(async base64=>{const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);return [[-50,-50],[50,-50],[50,50]].map(([x,y])=>Array.from(ctx.getImageData(c.width/2+x,c.height/2+y,1,1).data).slice(0,3));},png.toString('base64'));
    expect(samples[0],`${face} top-left`).toEqual([255,255,255]);
    expect(samples[1],`${face} top-right`).toEqual([0,0,0]);
    const expected=colors[i].slice(1).match(/../g)!.map(n=>parseInt(n,16));
    for(let k=0;k<3;k++)expect(Math.abs(samples[2][k]-expected[k]),`${face} color`).toBeLessThan(4);
  }
});

test('corrupt images fail individually and WebGL failure explains recovery',async({page,browser})=>{
  await page.goto('/');await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.locator('.face-card').first().locator('input[type=file]').setInputFiles({name:'corrupt.png',mimeType:'image/png',buffer:Buffer.from('broken image')});
  await expect(page.locator('aside [role=alert]')).toContainText('Cannot load photo');
  const context=await browser.newContext();const noWebgl=await context.newPage();
  await noWebgl.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;return original.apply(this,[type,...args] as never);} as typeof original;});
  await noWebgl.goto('http://127.0.0.1:4202');await expect(noWebgl.locator('box-photo-viewer [role=alert]')).toContainText('Enable WebGL');await context.close();
});

test('photo proportions reshape the mesh and manual dimensions override estimation',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Clear all',exact:true}).click();
  const file=page.locator('.face-card').first().locator('input[type=file]');
  const width=page.getByRole('spinbutton',{name:'width',exact:true});
  for(const ratio of [1,2,.5]){
    const data=await page.evaluate(ratio=>{const c=document.createElement('canvas');c.width=400*ratio;c.height=400;const ctx=c.getContext('2d')!;ctx.fillStyle='rgb(220,80,40)';ctx.fillRect(0,0,c.width,c.height);return c.toDataURL().split(',')[1];},ratio);
    await file.setInputFiles({name:'shape.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
    await expect(width).toHaveValue(String(ratio));await expect(page.getByRole('button',{name:'Inspect photo',exact:false})).toBeEnabled();
    await page.locator('box-photo-viewer nav').getByRole('button',{name:'front',exact:true}).click();
    const png=await page.locator('canvas[aria-label="3D photo box"]').screenshot();
    const renderedRatio=await page.evaluate(async base64=>{const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let left=c.width,right=0,top=c.height,bottom=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(Math.abs(pixels[i]-220)<4&&Math.abs(pixels[i+1]-80)<4&&Math.abs(pixels[i+2]-40)<4){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}return (right-left+1)/(bottom-top+1);},png.toString('base64'));
    expect(Math.abs(renderedRatio-ratio)).toBeLessThan(.03);
  }
  await width.fill('3');await width.press('Tab');await expect(page.getByRole('checkbox',{name:'Estimate shape from photos'})).not.toBeChecked();
  await file.setInputFiles('projects/demo/public/samples/fragile.jpg');await expect(page.getByRole('button',{name:'Inspect photo',exact:false})).toBeEnabled();await expect(width).toHaveValue('3');
  await page.getByRole('checkbox',{name:'Estimate shape from photos'}).check();await expect(width).not.toHaveValue('3');
});

test('rapid first uploads keep every selected face when replacing samples',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const bytes=await (await fetch('/samples/fragile.jpg')).arrayBuffer();
    const inputs=document.querySelectorAll<HTMLInputElement>('.face-card input[type=file]');
    for(const index of [0,3]){const transfer=new DataTransfer();transfer.items.add(new File([bytes],`face-${index}.jpg`,{type:'image/jpeg'}));inputs[index].files=transfer.files;inputs[index].dispatchEvent(new Event('change',{bubbles:true}));}
  });
  await expect(page.locator('.count')).toHaveText('2 / 6');
  await expect(page.locator('.face-card').nth(0)).toContainText('Photo added');
  await expect(page.locator('.face-card').nth(3)).toContainText('Photo added');
});

test('clear resets dimension errors and restores the empty box',async({page})=>{
  await page.goto('/');const width=page.getByRole('spinbutton',{name:'width',exact:true});
  await width.fill('0');await width.press('Tab');await expect(page.locator('.viewer-panel > [role=alert]')).toBeVisible();
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await expect(page.locator('.viewer-panel > [role=alert]')).toHaveCount(0);await expect(width).toHaveValue('1');
});

test('zoom remains outside the box instead of making every face disappear',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'Inspect photo',exact:false})).toBeEnabled();
  for(const axis of ['width','height','depth']){const field=page.getByRole('spinbutton',{name:axis,exact:true});await field.fill('1');await field.press('Tab');}
  await page.locator('box-photo-viewer nav').getByRole('button',{name:'front',exact:true}).click();
  const canvas=page.locator('canvas[aria-label="3D photo box"]');const rect=(await canvas.boundingBox())!;
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-5000);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  // The centre must still contain the photographic box, not the pale green background.
  await expect.poll(async()=>{
    const png=await canvas.screenshot();return page.evaluate(async base64=>{const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);const p=ctx.getImageData(c.width/2,c.height/2,1,1).data;return p[0]>p[1]+15;},png.toString('base64'));
  }).toBe(true);
});
