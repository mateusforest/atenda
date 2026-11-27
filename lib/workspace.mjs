import {readWorkspace} from './workspace-blob.mjs';
import { randomUUID } from 'node:crypto';
import { get, put, del } from '@vercel/blob';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const profiles = ['company','sector','phone','website','about','guidelines','contact','role','profilePhone','taxId','billingEmail','paymentMethod','revenue'];
const sections = ['leads','clients','services','documents','tasks','payments'];
const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
function endpoint(v) {
  if (!v) return '';
  let url;
  try { url = new URL(v); } catch { fail(400, 'Informe uma URL HTTPS válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) fail(400,'Use o domínio público HTTPS da API, sem credenciais na URL.');
  return url.href;
}
async function external(conn, mode, term, payload, requestId) {
  const write = mode === 'write', u = new URL(endpoint(write ? conn.writeUrl : conn.readUrl));
  if (!write && term) u.searchParams.set(conn.queryKey || 'q',term);
  const addresses = await lookup(u.hostname,{all:true,verbatim:true});
  if (!addresses.length || addresses.some(a=>ipaddr.process(a.address).range()!=='unicast')) fail(400,'A API deve usar um endereço público.');
  const dest = addresses.find(a=>a.family===4) || addresses[0];
  const body = write ? JSON.stringify(payload) : undefined;
  const headers = {Accept:'application/json'};
  if (conn.secret) headers[conn.auth==='key'?'X-API-Key':'Authorization'] = conn.auth==='key'?conn.secret:'Bearer '+conn.secret;
  if (write) { headers['Content-Type']='application/json'; headers['Idempotency-Key']=requestId; }
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(u,{method:write?'POST':'GET',headers,agent:false,autoSelectFamily:false,family:dest.family,lookup:(_host,_options,cb)=>cb(null,dest.address,dest.family),signal:AbortSignal.timeout(9000)},res=>{
      const pieces=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>128*1024){req.destroy(new Error('large response'));return}pieces.push(chunk)});
      res.on('error',reject);
      res.on('end',()=>{
        if(res.statusCode<200 || res.statusCode>=300){reject(Object.assign(new Error('O portal externo respondeu HTTP '+res.statusCode+'.'),{status:502}));return}
        const raw=Buffer.concat(pieces).toString('utf8');let result=raw;
        try {result=JSON.stringify(JSON.parse(raw),null,2)} catch {}
        resolve((result||'Operação concluída.').slice(0,7000));
      });
    });req.on('error',reject);req.end(body);
  });
}
const blank=()=>({profile:{},sections:[],records:[],connections:[]});
const publicState=s=>({...s,connections:s.connections.map(({secret,...c})=>({...c,hasSecret:!!secret}))});
export function workspace(req,res){
  return handleWorkspace(req,res);
}

export async function handleWorkspace(req,res,teamStorage){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const json=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body))};
  try{
    const url=process.env.SUPABASE_URL?.replace(/\/$/,''), key=process.env.SUPABASE_PUBLISHABLE_KEY;
    if(!url||!key)fail(503,'O acesso por conta ainda precisa ser configurado.');
    const search=new URL(req.url,'http://localhost').searchParams;
    if(req.method==='GET'&&search.get('action')==='config')return json(200,{url,key});
    if(!['GET','POST'].includes(req.method))fail(405,'Método inválido.');
    const token=req.headers.authorization||'';
    if(!/^Bearer [^\s]+$/.test(token))fail(401,'Entre para acessar esta empresa.');
    const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:token},signal:AbortSignal.timeout(9000)});
    if(!auth.ok)fail(auth.status===401||auth.status===403?401:503,'Não foi possível validar a sessão.');
    const user=await auth.json();if(!uuid.test(user.id))fail(401,'Sessão inválida.');
    if(search.get('action')==='agents'){
      const {companyTeam}=await import('./company-team.mjs');
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      return json(200,await companyTeam(user,req.method,body,teamStorage));
    }
    const prefix='empresas/'+user.id+'/', path=prefix+'painel.json';
    const doc=await readWorkspace(path);
    const state=doc?.state??blank(), rev=doc?.rev||'';
    if(req.method==='GET'){
      const file=search.get('file');
      if(file){const row=state.records.find(r=>r.file?.id===file);if(!row||!uuid.test(file))fail(404,'Documento não encontrado.');
        const stored=await get(prefix+'arquivos/'+file,{access:'private'});if(!stored)fail(404,'Arquivo indisponível.');
        res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(row.file.name));return res.end(Buffer.from(await new Response(stored.stream).arrayBuffer()))}
      return json(200,{state:publicState(state),rev,email:user.email});
    }
    const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!input||typeof input!=='object')fail(400,'Solicitação inválida.');
    const v=input.value||{};let attached;
    if(input.action==='run'){
      const c=state.connections.find(c=>c.id===v.connection);
      const write=v.mode==='write';if(!c||!['read','write'].includes(v.mode)||!c.enabled||!(write?c.writers:c.readers).includes(v.agent)||!(write?c.writeUrl:c.readUrl))fail(403,'Operação não permitida para este agente.');
      if(write && (v.confirmed!==true || !uuid.test(v.requestId) || !v.payload || typeof v.payload!=='object' || Array.isArray(v.payload)||JSON.stringify(v.payload).length>12000))fail(400,'Confira o cadastro antes de enviar.');
      try{return json(200,{result:await external(c,v.mode,clean(v.term,500),v.payload,v.requestId)})}catch(e){if(e.status)throw e;fail(502,write?'A confirmação do portal não chegou. Confira o registro no destino antes de repetir.':'A API externa está indisponível ou retornou uma resposta muito grande.')}
    }
    if(input.rev!==rev)fail(409,'O painel mudou em outra aba. Atualize e confira os dados antes de salvar.');
    if(input.action==='profile'){
      for(const k of profiles)if(Object.hasOwn(v,k))state.profile[k]=clean(v[k],['about','guidelines'].includes(k)?3000:250);
    }else if(input.action==='section'){
      const name=clean(v.name,50);if(!name)fail(400,'Informe o nome da seção.');
      if(state.sections.length>=20)fail(400,'O limite é de 20 seções adicionais.');
      if(state.sections.some(s=>s.name.toLowerCase()===name.toLowerCase()))fail(400,'Esta seção já existe.');
      state.sections.push({id:randomUUID(),name});
    }else if(input.action==='connection'){
      let c=v.id?state.connections.find(c=>c.id===v.id):null;if(v.id&&!c)fail(404,'Integração não encontrada.');
      if(!c&&state.connections.length>=30)fail(400,'O limite é de 30 integrações.');
      const name=clean(v.name), readUrl=endpoint(clean(v.readUrl,1500)),writeUrl=endpoint(clean(v.writeUrl,1500));
      if(!name||(!readUrl&&!writeUrl))fail(400,'Informe o nome e pelo menos um endpoint.');
      const ids=list=>Array.isArray(list)?[...new Set(list.filter(id=>uuid.test(id)))].slice(0,150):[];
      const queryKey=clean(v.queryKey,64)||'q';if(!/^[\w.-]+$/.test(queryKey))fail(400,'Parâmetro de busca inválido.');
      const agentNames=Object.fromEntries([...new Set([...ids(v.readers),...ids(v.writers)])].map(id=>[id,clean(v.agentNames?.[id]||c?.agentNames?.[id]||'Agente')]));
      const priorSecret=c?.secret||'';
      const changedHost=c&&[readUrl,writeUrl].filter(Boolean).some(u=>![c.readUrl,c.writeUrl].filter(Boolean).some(old=>new URL(u).origin===new URL(old).origin));
      const secret=v.auth==='none'?'':clean(v.secret,4096)||(changedHost?'':priorSecret);
      if(v.auth!=='none'&&!secret)fail(400,'Informe a chave para este destino.');
      if(!c){c={id:randomUUID()};state.connections.push(c)}
      Object.assign(c,{agentNames,name,readUrl,writeUrl,queryKey,readers:readUrl?ids(v.readers):[],writers:writeUrl?ids(v.writers):[],enabled:!!v.enabled,auth:['key','bearer'].includes(v.auth)?v.auth:'none',secret});
    }else if(input.action==='record'){
      const valid=[...sections,...state.sections.map(s=>s.id)];
      if(!valid.includes(v.section)||!clean(v.name))fail(400,'Informe o nome e a seção.');
      let row=v.id?state.records.find(r=>r.id===v.id):null;if(v.id&&!row)fail(404,'Registro não encontrado.');
      if(row && row.section!==v.section && !(row.section==='leads'&&v.section==='clients'))fail(400,'Mudança de seção inválida.');
      if(!row){if(state.records.length>=2000)fail(400,'O painel atingiu 2.000 registros.');row={id:randomUUID(),createdAt:new Date().toISOString()};state.records.unshift(row)}
      for(const k of ['name','contact','email','notes','status','date','amount','related'])row[k]=clean(v[k],k==='notes'?2000:250);
      row.section=v.section;row.updatedAt=new Date().toISOString();
      if(v.upload){if(row.file)fail(400,'Crie outro documento para enviar um novo arquivo.');if(v.section!=='documents'||typeof v.upload.data!=='string'||v.upload.data.length>2800000)fail(400,'Envie um documento de até 2 MB.');
        const bytes=Buffer.from(v.upload.data,'base64');if(!bytes.length||bytes.length>2*1024*1024)fail(400,'Arquivo vazio ou muito grande.');
        const file={id:randomUUID(),name:clean(v.upload.name)||'documento',size:bytes.length};
        await put(prefix+'arquivos/'+file.id,bytes,{access:'private',addRandomSuffix:false,contentType:'application/octet-stream'});attached=prefix+'arquivos/'+file.id;row.file=file}
    }else fail(400,'Operação desconhecida.');
    try{
      const saved=await put(path,JSON.stringify(state),{access:'private',addRandomSuffix:false,contentType:'application/json',allowOverwrite:!!rev,...(rev?{ifMatch:rev}:{})});
      return json(200,{state:publicState(state),rev:saved.etag,email:user.email});
    }catch(e){
      if(e.name==='BlobPreconditionFailedError'||/already exists|precondition/i.test(e.message)){if(attached)await del(attached).catch(()=>{});fail(409,'O painel foi atualizado. Recarregue antes de salvar.')}
      throw e;
    }
  }catch(e){json(e.status||503,{error:e.status?e.message:'O serviço da empresa está indisponível. Tente novamente.'})}
}
