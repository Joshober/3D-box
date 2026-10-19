import type { PhotoErrorCode } from './types';

export const PHOTO_LIMITS = Object.freeze({ bytes:25*1024*1024, pixels:40_000_000, edge:16384, timeoutMs:15000 });
export class PhotoInputError extends Error {
  constructor(public readonly code:PhotoErrorCode,message:string){super(message);this.name='PhotoInputError';}
}
export interface PhotoLoadOptions { allowedOrigins?:readonly string[]; signal?:AbortSignal; }
export interface LoadedPhoto { image:HTMLImageElement; url:string; dispose():void; }
/** Optional preflight for upload UIs; components enforce these checks independently. */
export async function validatePhotoFile(file:Blob):Promise<void> {
  const photo=await loadPhoto(file);photo.dispose();
}

/** Validate before making a network request. Redirects are separately prohibited by fetch. */
export function validatePhotoUrl(src:string,base:string,allowedOrigins:readonly string[]=[]):string {
  if(typeof src!=='string'||!src.trim()||src.length>8192)throw new PhotoInputError('invalid-input','Provide a valid image URL or File.');
  let url:URL;let origin:URL;
  try{url=new URL(src,base);origin=new URL(base);}catch{throw new PhotoInputError('blocked-source','Invalid image URL.');}
  if(url.username||url.password)throw new PhotoInputError('blocked-source','Image URLs cannot contain credentials.');
  if(url.protocol==='blob:'&&url.origin===origin.origin)return url.href;
  if((url.protocol==='https:'||url.protocol==='http:')&&url.origin===origin.origin)return url.href;
  if(url.protocol==='https:'&&allowedOrigins.includes(url.origin))return url.href;
  throw new PhotoInputError('blocked-source','Image origin is not allowed. Use a local File or add its HTTPS origin to allowedOrigins.');
}

/** Inspect raster headers before decoding; MIME names and extensions are not trusted. */
export function inspectImage(bytes:Uint8Array):{type:string;width:number;height:number} {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii=(at:number,length:number)=>String.fromCharCode(...bytes.subarray(at,at+length));
  let width=0,height=0,type='';
  if(bytes.length>=24&&bytes[0]===137&&ascii(1,3)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10&&ascii(12,4)==='IHDR'){
    width=view.getUint32(16);height=view.getUint32(20);type='image/png';
    for(let offset=8;offset+12<=bytes.length;){
      const size=view.getUint32(offset);if(size>bytes.length-offset-12)break;
      if(ascii(offset+4,4)==='acTL')throw new PhotoInputError('unsupported-image','Animated images are not supported. Use a still JPEG, PNG, or WebP.');
      offset+=size+12;
    }
  }else if(bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
    type='image/webp';let offset=12;
    while(offset+8<=bytes.length){
      const tag=ascii(offset,4),size=view.getUint32(offset+4,true),p=offset+8;
      if(p+size>bytes.length)break;
      if(tag==='VP8X'&&size>=10){if(bytes[p]&2)throw new PhotoInputError('unsupported-image','Animated images are not supported. Use a still JPEG, PNG, or WebP.');width=1+bytes[p+4]+(bytes[p+5]<<8)+(bytes[p+6]<<16);height=1+bytes[p+7]+(bytes[p+8]<<8)+(bytes[p+9]<<16);break;}
      if(tag==='VP8L'&&size>=5&&bytes[p]===0x2f){const bits=view.getUint32(p+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;break;}
      if(tag==='VP8 '&&size>=10&&bytes[p+3]===0x9d&&bytes[p+4]===1&&bytes[p+5]===0x2a){width=view.getUint16(p+6,true)&0x3fff;height=view.getUint16(p+8,true)&0x3fff;break;}
      offset=p+size+(size%2);
    }
  }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    type='image/jpeg';let offset=2;
    while(offset+4<=bytes.length){
      if(bytes[offset++]!==255)break;
      while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===0xda||marker===0xd9)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(offset+2>bytes.length)break;
      const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}
      offset+=length;
    }
  }
  if(!width||!height)throw new PhotoInputError('unsupported-image','Cannot load photo. Choose a valid JPEG, PNG, or WebP image.');
  if(width>PHOTO_LIMITS.edge||height>PHOTO_LIMITS.edge||width*height>PHOTO_LIMITS.pixels)throw new PhotoInputError('too-large','Photo exceeds 40 megapixels or 16,384 pixels per side.');
  return {type,width,height};
}

export async function readPhotoBytes(source:string|Blob,options:PhotoLoadOptions={},base=globalThis.location?.href):Promise<Uint8Array> {
  options.signal?.throwIfAborted();
  if(source instanceof Blob){
    if(source.size>PHOTO_LIMITS.bytes)throw new PhotoInputError('too-large','Photo exceeds the 25 MB limit.');
    const bytes=new Uint8Array(await source.arrayBuffer());options.signal?.throwIfAborted();return bytes;
  }
  if(!base)throw new PhotoInputError('invalid-input','Photo loading requires a browser.');
  const url=validatePhotoUrl(source,base,options.allowedOrigins);
  const response=await fetch(url,{signal:options.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',mode:'cors',cache:'no-store'});
  if(!response.ok||!response.body)throw new PhotoInputError('load-failed','Cannot load photo. Check the URL and server CORS permissions.');
  const reader=response.body.getReader();let complete=false;
  try{
    if(Number(response.headers.get('content-length'))>PHOTO_LIMITS.bytes)throw new PhotoInputError('too-large','Photo exceeds the 25 MB limit.');
    let size=0;const chunks:Uint8Array[]=[];
    while(true){const {done,value}=await reader.read();if(done){complete=true;break;}size+=value.byteLength;if(size>PHOTO_LIMITS.bytes)throw new PhotoInputError('too-large','Photo exceeds the 25 MB limit.');chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
  }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function loadPhoto(source:string|Blob,options:PhotoLoadOptions={}):Promise<LoadedPhoto> {
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)controller.abort();
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},PHOTO_LIMITS.timeoutMs);
  let url='';
  try{
    const bytes=await readPhotoBytes(source,{...options,signal:controller.signal});
    const metadata=inspectImage(bytes);controller.signal.throwIfAborted();
    url=URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:metadata.type}));
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const img=new Image();
      const cleanup=()=>{img.onload=null;img.onerror=null;controller.signal.removeEventListener('abort',cancel);};
      const cancel=()=>{cleanup();img.src='';reject(new DOMException('Photo load cancelled.','AbortError'));};
      img.onload=()=>{cleanup();resolve(img);};img.onerror=()=>{cleanup();reject(new PhotoInputError('unsupported-image','Cannot load photo. The image is corrupt or unsupported.'));};
      controller.signal.addEventListener('abort',cancel,{once:true});img.src=url;
      if(controller.signal.aborted)cancel();
    });
    if(image.naturalWidth*image.naturalHeight>PHOTO_LIMITS.pixels||Math.max(image.naturalWidth,image.naturalHeight)>PHOTO_LIMITS.edge)throw new PhotoInputError('too-large','Decoded photo exceeds the pixel limit.');
    const ownedUrl=url;return {image,url:ownedUrl,dispose:()=>{URL.revokeObjectURL(ownedUrl);image.src='';}};
  }catch(error){
    if(url)URL.revokeObjectURL(url);
    if(timedOut)throw new PhotoInputError('timeout','Photo loading timed out after 15 seconds.');
    if(options.signal?.aborted)throw new DOMException('Photo load cancelled.','AbortError');
    if(error instanceof PhotoInputError)throw error;
    throw new PhotoInputError('load-failed','Cannot load photo. Check the file, URL, and server CORS permissions.');
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
