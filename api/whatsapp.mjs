import {timingSafeEqual,createHash} from 'node:crypto';
const {WA_AKG_URL,WA_AKG_API_KEY,WA_AKG_SESSION,ATENDA_PASSWORD}=process.env;
const session=encodeURIComponent(WA_AKG_SESSION||'');
const hash=s=>createHash('sha256').update(s).digest();
const authorized=hash('Basic '+Buffer.from('atenda:'+ATENDA_PASSWORD).toString('base64'));
async function gateway(path,body,method=body?'POST':'GET'){
 const base=new URL(WA_AKG_URL);
 if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('Use HTTPS para o gateway remoto.');
 const res=await fetch(base.origin+'/api/'+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{'X-API-Key':WA_AKG_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
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
 if(!WA_AKG_URL||!WA_AKG_API_KEY){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({setup:true,error:'A sessão da Atenda está preparada. Cadastre WA_AKG_URL e WA_AKG_API_KEY no ambiente Production da Vercel e faça um novo deploy.'}))}
 if(!ATENDA_PASSWORD){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'Canal aguardando configuração no servidor.'}))}
 if(!timingSafeEqual(authorized,hash(req.headers.authorization||''))){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Atenda", charset="UTF-8"'});return res.end()}
 const json=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v))};
 try{
 if(!['GET','POST'].includes(req.method))return json(404,{});
 if(req.headers['x-atenda-panel']!=='1')return json(403,{});
 if(!WA_AKG_URL||!WA_AKG_API_KEY||!session)return json(503,{error:'Configure a URL, a chave e a sessão do WA-AKG no servidor.'});
 const op=new URL(req.url,'http://localhost').searchParams.get('operation');
 if(op==='reply'){
   const current=await state();
   if(current.state!=='connected')return json(409,{error:'Conecte o WhatsApp antes de configurar a resposta.'});
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(req.method!=='POST'||!['read','enable','disable'].includes(body?.action))return json(400,{error:'Ação inválida.'});
   const key=String(body.keyword||'').trim().toLowerCase();
   if(!key||key.length>80)return json(400,{error:'Informe uma palavra-chave de até 80 caracteres.'});
   const path='autoreplies/'+session;
   const rules=await gateway(path);
   const matches=rules.filter(row=>row.keyword?.toLowerCase()===key);
   if(matches.length>1)return json(409,{error:'Há regras duplicadas para essa palavra no gateway.'});
   const existing=matches[0];
   if(body.action==='read')return json(200,{enabled:!!existing,response:existing?.response??''});
   if(existing&&(existing.matchType!=='EXACT'||existing.isMedia||existing.triggerType!=='PRIVATE'))return json(409,{error:'A palavra já pertence a uma regra de outro tipo.'});
   const rulePath=existing?path+'/'+encodeURIComponent(existing.id):path;
   if(body.action==='disable'){if(existing)await gateway(rulePath,undefined,'DELETE')}
   else{
     if(typeof body.response!=='string'||!body.response.trim()||body.response.length>2000)return json(400,{error:'Informe uma resposta de até 2.000 caracteres.'});
     await gateway(rulePath,{keyword:key,response:body.response.trim(),matchType:'EXACT',triggerType:'PRIVATE'},existing?'PUT':'POST');
   }
   const verified=(await gateway(path)).find(row=>row.keyword?.toLowerCase()===key);
   if(body.action==='disable'?!!verified:verified?.response!==body.response.trim())return json(502,{error:'O gateway ainda não confirmou a alteração.'});
   return json(200,{enabled:!!verified});
 }
 return json(200,await state(req.method==='POST'));
 }catch(e){return json(502,{error:e.status?'O WA-AKG respondeu HTTP '+e.status+'. Verifique as permissões da sessão.':'Não foi possível consultar a instância WA-AKG.'})}
}
