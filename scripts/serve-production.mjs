import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Static demo server. Place behind your HTTPS reverse proxy for public hosting. */
export function createProductionServer(root=resolve('dist/demo/browser')) {
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
  return createServer(async(req,res)=>{
    const nonce=randomBytes(24).toString('base64');
    res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' blob: data:; connect-src 'self' blob:; font-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'`);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');res.writeHead(405).end();return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const candidate=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      const realRoot=await realpath(root),file=await realpath(candidate),rel=relative(realRoot,file);
      if(rel.startsWith('..')||isAbsolute(rel)||!types[extname(file)]){res.writeHead(404).end();return;}
      const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
      let data=await readFile(file);
      if(extname(file)==='.html')data=Buffer.from(data.toString('utf8').replaceAll('__CSP_NONCE__',nonce));
      else if(/-[A-Z0-9]{8,}\.(js|css)$/i.test(file))res.setHeader('Cache-Control','public, max-age=31536000, immutable');
      res.setHeader('Content-Type',types[extname(file)]);res.setHeader('Content-Length',data.length);res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404).end();}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT??8080),host=process.env.HOST??'127.0.0.1';
  const server=createProductionServer();server.listen(port,host,()=>console.log(`Production demo: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
