import {createHmac,timingSafeEqual} from 'node:crypto';
import {change,read,credentials,verificationToken,seed} from '../lib/meta-store.mjs';
import {incoming,deliveryStatus} from '../lib/meta-atendimento.mjs';

const reply=(status,body='')=>new Response(body,{status,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}});
function same(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)}
export function validSignature(bytes,signature,secret){
  return /^sha256=[a-f0-9]{64}$/.test(signature||'')&&same(signature,'sha256='+createHmac('sha256',secret).update(bytes).digest('hex'));
}
export function changesFor(payload,c,number){
  if(payload?.object!=='whatsapp_business_account')return [];
  return (payload.entry||[]).filter(entry=>entry.id===c.wabaId).flatMap(entry=>entry.changes||[])
    .filter(x=>x.field==='messages'&&x.value?.messaging_product==='whatsapp'&&x.value.metadata?.phone_number_id===c.phoneId&&String(x.value.metadata?.display_phone_number||'').replace(/\D/g,'')===number).map(x=>x.value);
}
export default {async fetch(request){
  try{
    if(request.method==='GET'){
      const q=new URL(request.url).searchParams,challenge=q.get('hub.challenge');
      if(q.get('hub.mode')!=='subscribe'||!challenge||challenge.length>512||!same(q.get('hub.verify_token'),verificationToken()))return reply(403);
      await change('challenge',()=>({time:Date.now()}));return reply(200,challenge);
    }
    if(request.method!=='POST')return reply(405);
    const sig=request.headers.get('x-hub-signature-256');
    if(!/^sha256=[a-f0-9]{64}$/.test(sig||''))return reply(403);
    if(Number(request.headers.get('content-length'))>1024*1024)return reply(413);
    const bytes=Buffer.from(await request.arrayBuffer());if(bytes.length>1024*1024)return reply(413);
    const config=(await read('config'))?.data;if(!config?.credentials)return reply(503);
    const c=credentials(config);if(!validSignature(bytes,sig,c.secret))return reply(403);
    let body;try{body=JSON.parse(bytes.toString('utf8'))}catch{return reply(400)}
    if(config.active){
      for(const v of changesFor(body,c,seed().number)){
        for(const s of v.statuses||[])await deliveryStatus(s);
        for(const m of v.messages||[])await incoming(config,m,v.contacts?.find(k=>k.wa_id===m.from)?.profile?.name||'');
      }
    }
    return reply(200,'OK');
  }catch{return reply(503,'Entrega pendente.')}
}};
