import {timingSafeEqual,createHash} from 'node:crypto';
const {WA_AKG_URL,WA_AKG_API_KEY,WA_AKG_SESSION,ATENDA_PASSWORD}=process.env;
const session=encodeURIComponent(WA_AKG_SESSION||'');
const hash=s=>createHash('sha256').update(s).digest();
const authorized=hash('Basic '+Buffer.from('atenda:'+ATENDA_PASSWORD).toString('base64'));
async function gateway(path,body,method=body?'POST':'GET'){
 const base=new URL(WA_AKG_URL);
 if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('Use HTTPS para o gateway remoto.');
 const res=await fetch(base.origin+'/api/'+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{'X-API-Key':WA_AKG_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!res.ok){
   const error=Error(`WA-AKG: ${method} /api/${path} (HTTP ${res.status}).`);
   error.status=res.status;
   if(res.status===400 && path.endsWith('/qr'))error.connected=(await res.json().catch(()=>({}))).connected===true;
   throw error;
 }
 const payload=await res.json();if(payload.status===false)throw Error('Operação recusada pelo gateway.');return payload.data??payload;
}
const sessionPath='sessions/'+session;
const idle=new Set(['STOPPED','LOGGED_OUT']);
let connecting;
let startedAt=0;

async function findSession(){
 const rows=await gateway('sessions');
 if(!Array.isArray(rows))throw Error('Formato de sessões incompatível.');
 return rows.find(row=>row.sessionId===WA_AKG_SESSION);
}

async function state(connect=false){
 let row=await findSession();
 if(!row){
   if(!connect)return {state:'missing'};
   try{row=await gateway('sessions',{sessionId:WA_AKG_SESSION,name:'Atenda'})}
   catch(error){
     // Outra instância do portal pode ter criado a mesma sessão.
     row=await findSession();
     if(!row)throw error;
   }
 }
 if(row.status==='CONNECTED')return {state:'connected'};
 // O WA-AKG só troca STOPPED por SCAN_QR quando o primeiro QR chega.
 if(idle.has(row.status) && Date.now()-startedAt>20000){
   if(!connect)return {state:'stopped'};
   await gateway(sessionPath+'/start',undefined,'POST');
   startedAt=Date.now();
 }
 try{
   const qr=await gateway(sessionPath+'/qr');
   if(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr.base64))return {state:'pairing',qr:qr.base64};
   throw Error('O WA-AKG retornou um QR inválido.');
 }catch(error){
   if(error.connected)return {state:'connected'};
   if(error.status===404)return {state:'waiting'};
   throw error;
 }
}

function connectSession(){
 connecting??=state(true).finally(()=>{connecting=undefined});
 return connecting;
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Content-Type-Options','nosniff');
 if(!ATENDA_PASSWORD){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'Canal aguardando configuração no servidor.'}))}
 if(!timingSafeEqual(authorized,hash(req.headers.authorization||''))){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Atenda", charset="UTF-8"'});return res.end()}
 return handleWhatsApp(req,res);
}

// O servidor local já autenticou o operador antes de delegar a requisição.
export async function handleWhatsApp(req,res){
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
 return json(200,await (req.method==='POST'?connectSession():state()));
 }catch(e){return json(502,{error:e.status?e.message:'Não foi possível consultar a instância WA-AKG.'})}
}
