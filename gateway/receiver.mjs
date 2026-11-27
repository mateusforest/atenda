import {createHash} from 'node:crypto';
import {fault,privateJid,uuid} from '../lib/wa-transport.mjs';
import {contactPhotos} from './contact-photos.mjs';
import {voiceService} from './voice.mjs';
import {agentEngine} from './agents.mjs';

export function receiver({db,gateway,session,sessionId,ownerEmail,official,draft=agentEngine(),voice=voiceService(db,sessionId)}){
  const photo=contactPhotos(gateway,session);
  db.exec(`pragma busy_timeout=3000;
  create table if not exists owner(session text primary key,user_id text not null);
  create table if not exists sends(id text primary key, digest text not null, key_id text);`);
  function verifyOwner(owner){
    if(!uuid.test(owner?.id)||owner.email!==ownerEmail.toLowerCase())throw fault(403,'Conta sem acesso a este canal.');
    db.prepare('insert or ignore into owner values (?,?)').run(session,owner.id);
    if(db.prepare('select user_id from owner where session=?').get(session).user_id!==owner.id)throw fault(403,'O canal já possui outro vínculo de conta.');
  }
  function excerpt(text,max){
    const value=String(text||'');
    return value.length>max?value.slice(0,max-1)+'…':value;
  }
  return async function execute(cmd){
    if(cmd.op==='health'||cmd.op==='status'){
      if(cmd.op==='status')verifyOwner(cmd.owner);
      const rows=await gateway('sessions'), row=rows.find(s=>s.sessionId===sessionId);
      return {state:row?.status==='CONNECTED'?'connected':'offline'};
    }
    verifyOwner(cmd.owner);
    if(cmd.op==='official'&&official)return official.command(cmd.action);
    if(cmd.op==='trial') {
      if(!Array.isArray(cmd.history)||!cmd.history.length||cmd.history.length>12||cmd.history.some(m=>typeof m?.text!=='string'||typeof m.fromMe!=='boolean')||cmd.history.at(-1).fromMe)throw fault(400,'Teste inválido.');
      return draft(cmd.profile,cmd.history);
    }
    if(cmd.op==='chats'){
      const scope=cmd.scope??'all', page=cmd.page??1;
      if(!['all','waiting','answered'].includes(scope)||!Number.isSafeInteger(page)||page<1||page>100000)throw fault(400,'Filtro de conversas inválido.');
      const result=await gateway('chat/'+session+'?inbox='+scope+'&page='+page);
      const chats=result.chats.filter(r=>privateJid.test(r.jid)).map(r=>({
        jid:r.jid,name:excerpt(r.name||r.notify||r.jid.split('@')[0],120),photo:photo(r),
        preview:excerpt(r.preview||'[Mensagem de mídia]',160),time:r.time,fromMe:r.fromMe
      }));
      return {chats,counts:result.counts,more:result.more};
    }
    if(!privateJid.test(cmd.jid))throw fault(400,'Contato inválido.');
    const contact=encodeURIComponent(cmd.jid);
    if(['history','suggest','voice','audio'].includes(cmd.op)){
      const rows=await gateway('chat/'+session+'/'+contact);
      if(cmd.op==='voice'||cmd.op==='audio'){
        const row=rows.find(m=>m.keyId===cmd.messageId && m.type==='AUDIO');
        if(!row)throw fault(404,'Áudio não encontrado nesta conversa.');
        return cmd.op==='audio'?voice.chunk(row,cmd.offset):voice.start(cmd.jid,row,true);
      }
      const latest=rows.at(-1);
      if(latest?.type==='AUDIO'&&!latest.fromMe){
        try{voice.start(cmd.jid,latest)}catch(e){if(e.status!==429)throw e}
      }
      if(cmd.op==='suggest'){
        if(!latest || latest.fromMe || latest.keyId!==cmd.messageId)throw fault(409,'A conversa mudou. Confira a última mensagem.');
        if(latest.type==='AUDIO'&&!voice.state(cmd.jid,latest).transcript)throw fault(409,'Aguarde a transcrição ou confira o áudio.');
        if(latest.type!=='AUDIO'&&!latest.content?.trim())throw fault(409,'A última mensagem não contém texto para o agente.');
        return draft(cmd.profile,rows.slice(-12).map(row=>({fromMe:row.fromMe,text:(row.type==='AUDIO'?voice.state(cmd.jid,row).transcript:row.content)||'[Mídia]'})));
      }
      // Mantém a resposta dentro do limite de um broadcast mesmo com textos extensos.
      let size=0;const messages=[];
      for(const row of rows.toReversed()){
        const message={id:row.keyId,fromMe:row.fromMe===true,text:excerpt(row.content||'[Mensagem de mídia]',12000),time:row.timestamp};
        if(row.type==='AUDIO'){
          message.voice=voice.state(cmd.jid,row);
          message.text=message.voice.transcript||'Mensagem de voz';
        }
        size+=Buffer.byteLength(JSON.stringify(message));if(size>115000)break;
        messages.unshift(message);
      }
      return {messages,photo:photo({jid:cmd.jid})};
    }
    if(cmd.op!=='send'||!uuid.test(cmd.requestId)||typeof cmd.text!=='string'||!cmd.text.trim()||cmd.text.length>4000)throw fault(400,'Resposta inválida.');
    const digest=createHash('sha256').update(JSON.stringify([session,cmd.owner.id,cmd.jid,cmd.text])).digest('hex');
    const history=await gateway('chat/'+session+'/'+contact);
    if(!history.length)throw fault(409,'A conversa ainda não possui mensagens.');
    const inserted=db.prepare('insert or ignore into sends(id,digest) values (?,?)').run(cmd.requestId,digest);
    if(!inserted.changes){
      const previous=db.prepare('select digest,key_id from sends where id=?').get(cmd.requestId);
      if(previous.digest!==digest)throw fault(409,'Identificador de envio já utilizado.');
      if(previous.key_id)return {keyId:previous.key_id};
      throw fault(409,'Envio sem confirmação. Confira o histórico antes de enviar outra resposta.');
    }
    // O gateway não aceita chave de idempotência. Uma resposta ambígua nunca é reenviada automaticamente.
    let sent;
    try{sent=await gateway('messages/'+session+'/'+contact+'/send',{message:{text:cmd.text}})}
    catch{throw fault(502,'Envio sem confirmação do WhatsApp. Confira o histórico antes de repetir.')}
    if(!sent?.key?.id)throw fault(502,'O WhatsApp ainda não confirmou o envio.');
    db.prepare('update sends set key_id=? where id=?').run(sent.key.id,cmd.requestId);
    return {keyId:sent.key.id};
  }
}
