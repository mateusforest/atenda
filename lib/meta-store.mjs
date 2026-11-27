import {get,put,list} from '@vercel/blob';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {workerToken} from './official-channel.mjs';
import {fault} from './wa-transport.mjs';

const prefix='administracao/meta-atendimento/';
export const digest=s=>createHash('sha256').update(s).digest('hex');
export const seed=()=>JSON.parse(process.env.ATENDA_META_SEED||'null');
export const verificationToken=()=>workerToken('atenda-meta-webhook-verificacao-v1');
export async function read(key){
  const row=await get(prefix+key+'.json',{access:'private',useCache:false});
  return row?{data:await new Response(row.stream).json(),etag:row.blob.etag}:null;
}
// The mutator may be replayed after a competing write. It must have no side effects.
export async function change(key,mutate){
  for(let i=0;i<8;i++){
    const row=await read(key),next=await mutate(row?.data??null);
    if(next===undefined)return row?.data;
    try{await put(prefix+key+'.json',JSON.stringify(next),{access:'private',addRandomSuffix:false,contentType:'application/json',allowOverwrite:!!row,...(row?{ifMatch:row.etag}:{})});return next}
    catch(e){if(!/already exists|precondition/i.test(e.message)&&e.name!=='BlobPreconditionFailedError')throw e}
  }
  throw fault(503,'Atendimento em atualização. Tente novamente.');
}
export async function chats(){
  let cursor;const rows=[];
  do{const page=await list({prefix:prefix+'chats/',cursor});cursor=page.cursor;
    for(let i=0;i<page.blobs.length;i+=12){
      const batch=await Promise.all(page.blobs.slice(i,i+12).map(b=>read(b.pathname.slice(prefix.length,-5))));
      rows.push(...batch.filter(Boolean).map(b=>b.data));
    }
  }while(cursor);
  return rows.sort((a,b)=>b.messages.at(-1).time-a.messages.at(-1).time);
}
export function encrypt(credentials){
  const key=Buffer.from(workerToken('atenda-meta-credentials-v1'),'hex'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const box=Buffer.concat([cipher.update(JSON.stringify(credentials),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),box:box.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function credentials(config){
  const c=config?.credentials;if(!c)throw fault(503,'Configure a conta Meta da Atenda.');
  const d=createDecipheriv('aes-256-gcm',Buffer.from(workerToken('atenda-meta-credentials-v1'),'hex'),Buffer.from(c.iv,'base64'));
  d.setAuthTag(Buffer.from(c.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(c.box,'base64')),d.final()]).toString());
}
export async function graph(c,path,body){
  const res=await fetch('https://graph.facebook.com/'+c.version+'/'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data=await res.json();
  if(!res.ok)throw fault(502,'Meta respondeu HTTP '+res.status+(Number.isInteger(data.error?.code)?' (código '+data.error.code+')':'')+'.');
  return data;
}
