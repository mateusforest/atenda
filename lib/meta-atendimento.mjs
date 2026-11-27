import {randomUUID} from 'node:crypto';
import {read,change,chats,digest,seed,credentials,graph} from './meta-store.mjs';
import {fault,uuid} from './wa-transport.mjs';
import {persistService} from './whatsapp-crm.mjs';
import {lunaKey} from './luna-key.mjs';
import {lunaReply} from './luna.mjs';
import {trialReply} from './agent-profile.mjs';
import {requestsTeam} from '../dist/agent-rules.mjs';
import {acceptedHandoff,confirmedName} from '../gateway/service-records.mjs';

const phonePattern=/^\d{6,15}$/;
const chatKey=phone=>'chats/'+phone;
const dateBR=time=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(time);
function addMessage(chat,m){
  if(!chat.messages.some(old=>old.id===m.id))chat.messages.push(m);
  chat.messages.sort((a,b)=>a.time-b.time);
  return chat;
}
function forModel(chat){return chat.messages.slice(-12).map(({fromMe,text})=>({fromMe,text}))}
async function updateCRM(chat,when){
  const binding=seed(),day=dateBR(when);
  const texts=chat.messages.filter(m=>!m.fromMe&&dateBR(m.time)===day).map(m=>m.text);
  if(!texts.length)return;
  const name=confirmedName(chat.messages);
  await persistService({id:binding.ownerId,email:process.env.WA_OWNER_EMAIL},{
    jid:chat.phone+'@s.whatsapp.net',session:binding.session,day,time:when,contactName:name||chat.name,confirmedName:!!name,withTeam:chat.team,
    email:texts.join(' ').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0],summary:texts.slice(-15).join('\n').slice(-2400),
    task:texts.some(t=>/\b(cota[çc][ãa]o|or[çc]amento|proposta)\b/i.test(t))?'Preparar cotação':chat.team?'Retornar atendimento':''});
}
async function voiceText(c,id){
  if(!/^\d+$/.test(id))throw fault(400,'Identificador de áudio inválido.');
  const media=await graph(c,id+'?phone_number_id='+c.phoneId);
  const url=new URL(media.url);
  if(url.protocol!=='https:'||!(url.hostname==='lookaside.fbsbx.com'||url.hostname.endsWith('.fbcdn.net')))throw fault(502,'URL de mídia da Meta inválida.');
  if(Number(media.file_size)>16*1024*1024)return '';
  const resp=await fetch(url,{headers:{Authorization:'Bearer '+c.token},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!resp.ok)throw fault(502,'Falha ao baixar o áudio da Meta.');
  const data=await resp.blob();if(data.size>16*1024*1024)return '';
  const f=new FormData();f.set('model','gpt-transcribe');f.set('file',data,'audio.'+({'audio/mpeg':'mp3','audio/mp4':'m4a','audio/aac':'aac','audio/amr':'amr'}[String(media.mime_type).split(';')[0]]||'ogg'));
  const result=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+await lunaKey()},body:f,signal:AbortSignal.timeout(55000),redirect:'error'});
  if(!result.ok)throw fault(502,'Transcrição indisponível.');return String((await result.json()).text||'').slice(0,12000);
}
async function send(config,phone,requestId,text,expected){
  const c=credentials(config),key='envios/'+digest(JSON.stringify([c.phoneId,requestId])),attempt=randomUUID();
  const prior=await change(key,old=>old?undefined:{attempt,phone,text,time:Date.now()});
  if(prior.phone!==phone||(!expected&&prior.text!==text))throw fault(409,'Identificador de envio já utilizado.');
  let id=prior.id;
  if(!id){
    if(prior.attempt!==attempt)throw fault(409,'Envio já iniciado. Confira o histórico antes de repetir.');
    const chat=(await read(chatKey(phone)))?.data;
    if(!chat||!chat.messages.some(m=>!m.fromMe&&Date.now()-m.time<86400000))throw fault(409,'A janela de resposta de 24 horas terminou.');
    if(expected&&(chat.team||chat.messages.at(-1).id!==expected||(await read('config')).data.revision!==config.revision))return {};
    const result=await graph(c,c.phoneId+'/messages',{messaging_product:'whatsapp',to:phone,type:'text',text:{body:text},biz_opaque_callback_data:digest(JSON.stringify([c.phoneId,requestId]))});
    id=result.messages?.[0]?.id;if(!id)throw fault(502,'A Meta não confirmou o envio.');
    await change(key,old=>({...old,id}));
  }
  await change(chatKey(phone),chat=>addMessage(chat,{id,text:prior.text,time:prior.time,fromMe:true}));
  return {keyId:id};
}
export async function deliveryStatus(s){
  if(!/^[a-f0-9]{64}$/.test(s.biz_opaque_callback_data||'')||!s.id)return;
  const key='envios/'+s.biz_opaque_callback_data;
  const row=await change(key,old=>old&&old.phone===s.recipient_id?{...old,id:s.id,status:s.status}:undefined);
  if(row?.id===s.id)await change(chatKey(row.phone),chat=>chat?addMessage(chat,{id:s.id,text:row.text,time:row.time,fromMe:true}):undefined);
}
export async function incoming(config,m,name){
  const c=credentials(config),phone=String(m.from||''),time=Number(m.timestamp)*1000;
  if(!phonePattern.test(phone)||typeof m.id!=='string'||!m.id||!Number.isSafeInteger(time)||time<config.since-1000||time>Date.now()+60000)return;
  const event='recebidas/'+digest(c.phoneId+'|'+m.id),old=(await read(event))?.data;
  if(old?.done)return;
  const chatPath=chatKey(phone);let chat=(await read(chatPath))?.data;
  let text=chat?.messages.find(x=>x.id===m.id)?.text||m.text?.body||m.button?.text||m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||m.image?.caption||m.document?.caption;
  if(!text&&m.type==='audio')text=await voiceText(c,String(m.audio?.id||''));
  const supported=!!text;text=String(text||'[Mensagem de mídia]').slice(0,12000);
  chat=await change(chatPath,state=>{
    state??={phone,name,team:false,messages:[]};
    if(state.messages.some(x=>x.id===m.id))return undefined;
    if(name)state.name=name;
    delete state.imported;
    const prior=state.messages.findLast(x=>x.fromMe&&x.time<=time);
    if(requestsTeam(text,config.profile?.handoff)||acceptedHandoff(text,prior?.text))state.team=true;
    return addMessage(state,{id:m.id,text,time,fromMe:false});
  });
  await updateCRM(chat,time);
  if(config.agent&&!chat.team&&supported&&chat.messages.at(-1).id===m.id&&Date.now()-time<86400000){
    const requestId='auto/'+m.id,existing=(await read('envios/'+digest(JSON.stringify([c.phoneId,requestId]))))?.data;
    if(!existing||existing.id){
      const history=forModel(chat);
      const profile={...config.profile,needsName:!confirmedName(chat.messages)&&!history.some(x=>x.fromMe&&/seu nome|se chama|prefere ser chamad/i.test(x.text))};
      const reply=existing?{text:existing.text}:await trialReply(async(p,h)=>lunaReply(p,h,{key:await lunaKey()}),profile,history);
      if(!reply.handoff)await send(config,phone,requestId,reply.text,m.id);
    }
  }
  await change(event,()=>({done:true,time}));
  await change('config',state=>state&&(!state.received||time>state.received)?{...state,received:time}:undefined);
}
export async function metaCommand(config,cmd){
  const binding=seed();if(cmd.owner?.id!==binding?.ownerId)throw fault(403,'Canal vinculado a outra conta.');
  if(cmd.op==='status')return {state:'connected',provider:'meta'};
  if(cmd.op==='profile')return {name:config.name,number:'+'+binding.number,about:'WhatsApp Business Platform · Meta',editable:false};
  if(cmd.op==='automatic'){
    if(cmd.mode!=='status'){
      if(cmd.mode==='enable'&&(!uuid.test(cmd.agent)||!cmd.profile?.name||!cmd.profile?.goal||!cmd.profile?.greeting))throw fault(400,'Selecione e configure um agente ativo.');
      config=await change('config',s=>{
        if(s.revision!==cmd.revision)throw fault(409,'Configuração atualizada. Reabra o canal.');
        return {...s,agent:cmd.mode==='enable'?cmd.agent:null,profile:cmd.mode==='enable'?cmd.profile:s.profile,revision:randomUUID()};
      });
    }
    return {enabled:!!config.agent,agent:config.agent,name:config.profile?.name,revision:config.revision,host:'Meta / Vercel'};
  }
  if(cmd.op==='chats'){
    const rows=(await chats()).map(c=>{const last=c.messages.at(-1);return {jid:c.phone+'@s.whatsapp.net',name:c.name,preview:last.text,time:last.time,fromMe:last.fromMe,withTeam:c.team}});
    const answered=rows.filter(c=>c.fromMe).length,counts={total:rows.length,answered,waiting:rows.length-answered};
    const filtered=rows.filter(c=>cmd.scope==='team'?c.withTeam:cmd.scope==='answered'?c.fromMe:cmd.scope==='waiting'?!c.fromMe:true);
    const start=(cmd.page-1)*50;return {counts,chats:filtered.slice(start,start+50),more:filtered.length>start+50};
  }
  const phone=String(cmd.jid||'').split('@')[0];if(!phonePattern.test(phone))throw fault(400,'Operação indisponível neste canal.');
  const key=chatKey(phone),chat=(await read(key))?.data;if(!chat)throw fault(404,'Conversa não encontrada.');
  if(['history','review'].includes(cmd.op))return {messages:chat.messages.slice(-300),withTeam:chat.team};
  if(cmd.op==='release'){
    const updated=await change(key,s=>{if(s.messages.at(-1).id!==cmd.messageId)throw fault(409,'A conversa mudou.');return {...s,team:false}});
    await updateCRM(updated,updated.messages.at(-1).time);return {withTeam:false};
  }
  if(cmd.op==='send')return send(config,phone,cmd.requestId,cmd.text);
  if(cmd.op==='suggestContext'){
    if(chat.team)return {handoff:true};if(chat.messages.at(-1).id!==cmd.messageId||chat.messages.at(-1).fromMe)throw fault(409,'A conversa mudou.');
    return {context:forModel(chat)};
  }
  throw fault(400,'Operação indisponível na API da Meta.');
}
