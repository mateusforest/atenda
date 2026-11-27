import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual,createHash,randomBytes} from 'node:crypto';
import {handleWhatsApp} from './api/whatsapp.mjs';
const {ATENDA_PASSWORD}=process.env;
const port=Number(process.env.PORT||8140);
if(!ATENDA_PASSWORD) throw Error('Configure ATENDA_PASSWORD no servidor.');
const hash=s=>createHash('sha256').update(s).digest();
const authorized=hash('Basic '+Buffer.from('atenda:'+ATENDA_PASSWORD).toString('base64'));
// Cookie de sessão do operador local. Reiniciar o servidor expira o acesso.
const operatorToken=randomBytes(32).toString('base64url');
const operatorCookie='atenda_operator='+operatorToken;
http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Content-Type-Options','nosniff');
 const path=req.url.split('?')[0];
 if(!['/api/workspace','/api/inbox','/api/billing','/api/admin'].includes(path)){
   const hasCookie=(req.headers.cookie||'').split(/;\s*/).some(cookie=>timingSafeEqual(hash(cookie),hash(operatorCookie)));
   if(!hasCookie){
     if(!timingSafeEqual(authorized,hash(req.headers.authorization||''))){
       res.writeHead(401,{'WWW-Authenticate':'Basic realm="Atenda", charset="UTF-8"'});return res.end();
     }
     res.setHeader('Set-Cookie',operatorCookie+'; HttpOnly; SameSite=Strict; Path=/');
   }
 }
 const json=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v))};
 try{
 const pages=new Map([['/','index.html'],['/index.html','index.html'],['/portal','portal.html'],['/portal/','portal.html'],['/portal.html','portal.html'],['/login','acesso.html'],['/cadastro','acesso.html'],['/conta.js','conta.js'],['/central.js','central.js'],['/portal-acesso.js','portal-acesso.js'],['/empresa.js','empresa.js'],['/empresa.css','empresa.css'],['/dot.png','dot.png'],['/dot-motion.js','dot-motion.js']]);
 for(const file of ['landing.css','landing.js','dot-landing.webp'])pages.set('/'+file,file);
 pages.set('/favicon.ico','favicon.ico');
 pages.set('/dot-favicon-32.png','dot-favicon-32.png');
 pages.set('/whatsapp','whatsapp.html');
 for(const [route,file] of [['/admin','admin.html'],['/admin/','admin.html'],['/admin.html','admin.html'],['/admin.js','admin.js'],['/admin.css','admin.css']])pages.set(route,file);
 pages.set('/inbox.js','inbox.js');
 pages.set('/agent-rules.mjs','agent-rules.mjs');
 pages.set('/billing.js','billing.js');
 pages.set('/checkout','checkout.html');
 pages.set('/checkout.css','checkout.css');
 pages.set('/portal-ui.css','portal-ui.css');
 pages.set('/whatsapp-channel.js','whatsapp-channel.js');
 const localPortal=['/portal','/portal/','/portal.html'].includes(path) && !process.env.SUPABASE_URL;
 const asset=localPortal?'whatsapp.html':pages.get(path);
 if(asset&&req.method==='GET'){
  const content=await readFile(new URL('./dist/'+asset,import.meta.url));
  const type=asset.endsWith('.webp')?'image/webp':asset.endsWith('.ico')?'image/x-icon':asset.endsWith('.png')?'image/png':asset.endsWith('.css')?'text/css; charset=utf-8':/\.m?js$/.test(asset)?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
  res.writeHead(200,{'Content-Type':type});return res.end(content)
 }
 if(['/api/workspace','/api/whatsapp','/api/inbox','/api/billing','/api/admin'].includes(path)){
   if(req.method==='POST'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>3000000)return json(413,{error:'Arquivo muito grande.'});chunks.push(chunk)}
     const raw=Buffer.concat(chunks).toString();
     try{req.body=path==='/api/billing'&&req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(raw)):size?JSON.parse(raw):undefined}catch{return json(400,{error:'JSON inválido.'})}}
   if(path==='/api/admin'){const {default:admin}=await import('./api/admin.mjs');return await admin(req,res)}
   if(path==='/api/billing'){const {default:billing}=await import('./api/billing.mjs');return await billing(req,res)}
   if(path==='/api/inbox'){const {default:inbox}=await import('./api/inbox.mjs');return await inbox(req,res)}
   if(path==='/api/whatsapp')return await handleWhatsApp(req,res);
   const {workspace}=await import('./lib/workspace.mjs');return await workspace(req,res)
 }
 return json(404,{});
 }catch(e){return json(502,{error:e.status?'O WA-AKG respondeu HTTP '+e.status+'. Verifique as permissões da sessão.':'Não foi possível consultar a instância WA-AKG.'})}
}).listen(port,'127.0.0.1',()=>console.log('Atenda em http://127.0.0.1:'+port));
