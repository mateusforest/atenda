import {timingSafeEqual,createHash} from 'node:crypto';
const {WA_AKG_URL,WA_AKG_API_KEY,WA_AKG_SESSION,ATENDA_PASSWORD}=process.env;
const session=encodeURIComponent(WA_AKG_SESSION||'');
const hash=s=>createHash('sha256').update(s).digest();
const authorized=hash('Basic '+Buffer.from('atenda:'+ATENDA_PASSWORD).toString('base64'));
async function gateway(path,body){
 const base=new URL(WA_AKG_URL);
 if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('Use HTTPS para o gateway remoto.');
 const res=await fetch(base.origin+'/api/'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'X-API-Key':WA_AKG_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!res.ok){const e=Error('WA-AKG respondeu HTTP '+res.status);e.status=res.status;throw e}
 const payload=await res.json();if(payload.status===false)throw Error('Operação recusada pelo gateway.');return payload.data??payload;
}
let creating;
async function state(create=false){
 const sessions=await gateway('sessions');
 if(!Array.isArray(sessions))throw Error('Formato de sessões incompatível.');
 const row=sessions.find(s=>s.sessionId===WA_AKG_SESSION);
 if(!row&&create){
 creating??=gateway('sessions',{sessionId:WA_AKG_SESSION,name:'Atenda'}).finally(()=>creating=undefined);
 await creating;return state();
 }
 if(!row)return {state:'missing'};
 if(String(row.status).toLowerCase()==='connected')return {state:'connected'};
 try{
 const qr=await gateway('sessions/'+session+'/qr');
 if(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr.base64))return {state:'pairing',qr:qr.base64};
 }catch(e){if(![400,404].includes(e.status))throw e}
 return {state:'waiting'};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Content-Type-Options','nosniff');
 if(!ATENDA_PASSWORD){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'Canal aguardando configuração no servidor.'}))}
 if(!timingSafeEqual(authorized,hash(req.headers.authorization||''))){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Atenda", charset="UTF-8"'});return res.end()}
 const json=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v))};
 try{
 if(!['GET','POST'].includes(req.method))return json(404,{});
 if(req.headers['x-atenda-panel']!=='1')return json(403,{});
 if(!WA_AKG_URL||!WA_AKG_API_KEY||!session)return json(503,{error:'Configure a URL, a chave e a sessão do WA-AKG no servidor.'});
 return json(200,await state(req.method==='POST'));
 }catch(e){return json(502,{error:e.status?'O WA-AKG respondeu HTTP '+e.status+'. Verifique as permissões da sessão.':'Não foi possível consultar a instância WA-AKG.'})}
}
