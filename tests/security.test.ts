import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectImage, validatePhotoUrl, readPhotoBytes, PHOTO_LIMITS } from '../projects/box-photo-viewer/src/lib/photo-source';
import { validateCorners } from '../projects/box-photo-viewer/src/lib/perspective';

test('source policy accepts local photos and explicitly allowed HTTPS origins',()=>{
  const base='https://app.example/inspection/';
  assert.equal(validatePhotoUrl('/photos/front.jpg',base),'https://app.example/photos/front.jpg');
  assert.equal(validatePhotoUrl('blob:https://app.example/test',base),'blob:https://app.example/test');
  assert.equal(validatePhotoUrl('https://images.example/a.jpg',base,['https://images.example']),'https://images.example/a.jpg');
  for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg/>','file:///etc/passwd','http://images.example/a','https://images.example.evil/a','https://app.example@evil.test/a','https://user:secret@app.example/a','blob:https://evil.test/id'])assert.throws(()=>validatePhotoUrl(url,base,['https://images.example']));
});

test('content sniffing rejects forged MIME types and image bombs before decode',async()=>{
  for(const name of ['fragile','fedex']){const result=inspectImage(await readFile(`projects/demo/public/samples/${name}.jpg`));assert.equal(result.type,'image/jpeg');assert.ok(result.width>0&&result.width<=1280);}
  assert.throws(()=>inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')));
  const header=new Uint8Array(24);header.set([137,80,78,71,13,10,26,10]);header.set([73,72,68,82],12);const view=new DataView(header.buffer);view.setUint32(16,20000);view.setUint32(20,20000);
  assert.throws(()=>inspectImage(header),/40 megapixels/);
  view.setUint32(16,8000);view.setUint32(20,8000);assert.throws(()=>inspectImage(header),/40 megapixels/);
  assert.throws(()=>validateCorners(null as never));assert.throws(()=>validateCorners([null,null,null,null] as never));
});

test('File/Blob bytes are supported directly with size and cancellation limits',async()=>{
  const blob=new Blob(['test'],{type:'image/jpeg'});assert.equal(new TextDecoder().decode(await readPhotoBytes(blob)),'test');
  await assert.rejects(readPhotoBytes(new Blob([new Uint8Array(PHOTO_LIMITS.bytes+1)])),/25 MB/);
  const controller=new AbortController();controller.abort();await assert.rejects(readPhotoBytes(blob,{signal:controller.signal}),{name:'AbortError'});
});

test('animated raster containers are rejected before decoder allocation',()=>{
  const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'),0);webp.set(new TextEncoder().encode('WEBPVP8X'),8);new DataView(webp.buffer).setUint32(16,10,true);webp[20]=2;
  assert.throws(()=>inspectImage(webp),/Animated images/);
  const png=new Uint8Array(53);png.set([137,80,78,71,13,10,26,10]);const v=new DataView(png.buffer);v.setUint32(8,13);png.set(new TextEncoder().encode('IHDR'),12);v.setUint32(16,1);v.setUint32(20,1);v.setUint32(33,8);png.set(new TextEncoder().encode('acTL'),37);
  assert.throws(()=>inspectImage(png),/Animated images/);
});

test('remote downloads omit credentials, block redirects, and enforce streamed limits',async()=>{
  const original=globalThis.fetch;let cancelled=false;let calls=0;
  try{
    globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options?.credentials,'omit');assert.equal(options?.redirect,'error');assert.equal(options?.referrerPolicy,'no-referrer');return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}));};
    await assert.rejects(readPhotoBytes('https://cdn.example/photo',{allowedOrigins:['https://cdn.example']},'https://app.example'),/25 MB/);assert.ok(cancelled);
    await assert.rejects(readPhotoBytes('https://evil.example/photo',{},'https://app.example'),/origin is not allowed/);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
