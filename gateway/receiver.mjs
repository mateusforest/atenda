import {createHash} from 'node:crypto';
import {fault,privateJid,uuid} from '../lib/wa-transport.mjs';
import {contactPhotos} from './contact-photos.mjs';

export function receiver({db,gateway,session,sessionId,ownerEmail}){
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
    if(cmd.op==='history'){
      const rows=await gateway('chat/'+session+'/'+contact);
      // Mantém a resposta dentro do limite de um broadcast mesmo com textos extensos.
      let size=0;const messages=[];
      for(const row of rows.toReversed()){
        const message={id:row.keyId,fromMe:row.fromMe===true,text:excerpt(row.content||'[Mensagem de mídia]',12000),time:row.timestamp};
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
