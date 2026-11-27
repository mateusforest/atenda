import {createHash} from 'node:crypto';
import {fault,privateJid,uuid} from '../lib/wa-transport.mjs';
import {contactPhotos,whatsappPhoto} from './contact-photos.mjs';
import {acceptedHandoff,confirmedName} from './service-records.mjs';
import {voiceService} from './voice.mjs';
import {agentEngine} from './agents.mjs';
import {trialReply} from '../lib/agent-profile.mjs';
import {openingForGreeting,requestsTeam} from '../dist/agent-rules.mjs';
import {incomingTime} from './automatic.mjs';

export function receiver({db,gateway,session,sessionId,ownerEmail,official,automatic,crmIssue=()=>'',draft=agentEngine(),voice=voiceService(db,sessionId)}){
  const photo=contactPhotos(gateway,session);
  db.exec(`pragma busy_timeout=3000;
  create table if not exists owner(session text primary key,user_id text not null);
  create table if not exists sends(id text primary key, digest text not null, key_id text);
  create table if not exists team_handoffs(session text,jid text,message text,active integer,primary key(session,jid));
  create table if not exists service_chat(session text,jid text,name text,preview text,time integer,fromMe integer,primary key(session,jid));`);
  const teamState=jid=>db.prepare('select message,active from team_handoffs where session=? and jid=?').get(sessionId,jid);
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
    if(cmd.op==='profile'){
      const [p,s]=await Promise.all([gateway('profile/'+session),gateway('sessions/'+session)]);
      const phone=String(s.me?.id||'').match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/)?.[1];
      return {name:p.name||s.me?.name||'',number:phone?'+'+phone:'',about:typeof p.status==='string'?p.status:p.status?.status||'',photo:whatsappPhoto(p.pictureUrl),crmIssue:crmIssue()};
    }
    if(cmd.op==='editProfile'){
      if(cmd.field==='picture'){
        if(typeof cmd.value!=='string'||cmd.value.length>190000||!/^\/9j\/[A-Za-z0-9+/=]+$/.test(cmd.value))throw fault(400,'Envie uma foto JPEG válida.');
        const form=new FormData();form.set('image',new Blob([Buffer.from(cmd.value,'base64')],{type:'image/jpeg'}),'perfil.jpg');
        await gateway('profile/'+session+'/picture',form,'PUT');
      }else{
        const max={name:25,status:139}[cmd.field];
        if(!['name','status'].includes(cmd.field)||typeof cmd.value!=='string'||!cmd.value.trim()||cmd.value.length>max)throw fault(400,'Confira o campo do perfil.');
        await gateway('profile/'+session+'/'+cmd.field,{[cmd.field]:cmd.value.trim()},'PUT');
      }
      return {saved:true};
    }
    if(cmd.op==='metaSnapshot'&&automatic){
      const since=db.prepare('select since from service_start where session=?').get(sessionId)?.since||Date.now();
      const chats=db.prepare('select jid,name from service_chat where session=? order by jid limit 40 offset ?').all(sessionId,cmd.offset||0);
      return {chats,since,automatic:automatic.status(),profile:automatic.activeProfile()};
    }
    if(cmd.op==='automatic'&&automatic)return automatic.configure(cmd);
    if(cmd.op==='official'&&official)return official.command(cmd.action);
    if(cmd.op==='trial') {
      return trialReply(draft,cmd.profile,cmd.history);
    }
    if(cmd.op==='chats'){
      const scope=cmd.scope??'all', page=cmd.page??1;
      if(!['all','waiting','answered','team'].includes(scope)||!Number.isSafeInteger(page)||page<1||page>100000)throw fault(400,'Filtro de conversas inválido.');
      if(scope==='team'){
        const active=db.prepare('select h.jid,c.name,c.preview,c.time,c.fromMe from team_handoffs h left join service_chat c on c.session=h.session and c.jid=h.jid where h.session=? and h.active=1 order by c.time desc,h.rowid desc limit 51 offset ?').all(sessionId,(page-1)*50);
        const chats=active.slice(0,50).map(item=>({...item,name:item.name||item.jid.split('@')[0],preview:item.preview||'Aguardando a equipe',fromMe:!!item.fromMe,photo:photo(item),withTeam:true}));
        return {chats,more:active.length>50};
      }
      const result=await gateway('chat/'+session+'?inbox='+scope+'&page='+page);
      const chats=result.chats.filter(r=>privateJid.test(r.jid)).map(r=>({
        jid:r.jid,name:excerpt(r.name||r.notify||r.jid.split('@')[0],120),photo:photo(r),
        preview:excerpt(r.preview||'[Mensagem de mídia]',160),time:r.time,fromMe:r.fromMe,withTeam:!!teamState(r.jid)?.active
      }));
      return {chats,counts:result.counts,more:result.more};
    }
    if(!privateJid.test(cmd.jid))throw fault(400,'Contato inválido.');
    const contact=encodeURIComponent(cmd.jid);
    if(['history','review','suggest','suggestContext','release','voice','audio'].includes(cmd.op)){
      const rows=await gateway('chat/'+session+'/'+contact);
      if(cmd.op==='voice'||cmd.op==='audio'){
        const row=rows.find(m=>m.keyId===cmd.messageId && m.type==='AUDIO');
        if(!row)throw fault(404,'Áudio não encontrado nesta conversa.');
        return cmd.op==='audio'?voice.chunk(row,cmd.offset):voice.start(cmd.jid,row,true);
      }
      const latest=rows.at(-1);
      if(cmd.op==='release'){
        if(latest?.keyId!==cmd.messageId)throw fault(409,'A conversa mudou. Confira antes de retomar.');
        db.prepare('update team_handoffs set active=0,message=? where session=? and jid=? and active=1').run(cmd.messageId,sessionId,cmd.jid);
        return {withTeam:false};
      }
      if(latest?.type==='AUDIO'&&!latest.fromMe){
        try{voice.start(cmd.jid,latest)}catch(e){if(e.status!==429)throw e}
      }
      const suggesting=cmd.op==='suggest'||cmd.op==='suggestContext';
      if(suggesting&&(!latest||latest.fromMe||latest.keyId!==cmd.messageId))throw fault(409,'A conversa mudou. Confira a última mensagem.');
      let team=teamState(cmd.jid);
      if((cmd.op==='review'||suggesting)&&!team?.active){
        const terms=(automatic?.activeProfile()||cmd.profile)?.handoff;
        for(let i=rows.length-1;i>=0;i--){
          const row=rows[i];
          if(row.fromMe||row.keyId===team?.message||cmd.autoSince&&incomingTime(row.timestamp)<cmd.autoSince)break;
          const note=row.type==='AUDIO'?voice.state(cmd.jid,row):null;
          if(cmd.autoSince&&note&&!note.transcript){
            if(note.issue)throw fault(422,note.issue);
            voice.start(cmd.jid,row);
            throw fault(409,'Aguarde a transcrição antes da resposta automática.');
          }
          const incoming=note?note.transcript:row.content;
          if(!requestsTeam(incoming,terms)&&!acceptedHandoff(incoming,rows.slice(0,i).findLast(r=>r.fromMe)?.content))continue;
          db.prepare('insert or replace into team_handoffs values(?,?,?,1)').run(sessionId,cmd.jid,row.keyId);
          team=teamState(cmd.jid);
          break;
        }
      }
      if(suggesting){
        if(team?.active)return {handoff:true};
        if(latest.type==='AUDIO'&&!voice.state(cmd.jid,latest).transcript)throw fault(409,'Aguarde a transcrição ou confira o áudio.');
        if(latest.type!=='AUDIO'&&!latest.content?.trim())throw fault(409,'A última mensagem não contém texto para o agente.');
        const context=rows.slice(-12).map(row=>({fromMe:row.fromMe,text:excerpt((row.type==='AUDIO'?voice.state(cmd.jid,row).transcript:row.content)||'[Mídia]',1600)}));
        const greeting=!rows.some(row=>row.fromMe)&&openingForGreeting(cmd.profile,context);
        if(greeting)return {text:greeting,model:'roteiro'};
        const needsName=!!cmd.autoSince&&!confirmedName(context)&&!rows.some(r=>r.fromMe&&/(?:seu nome|se chama|prefere ser chamad[oa])/i.test(r.content||''));
        return cmd.op==='suggestContext'?{context,...(needsName?{needsName:true}:{})}:draft(cmd.profile,context);
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
      return {messages,withTeam:!!team?.active,photo:photo({jid:cmd.jid})};
    }
    if(cmd.op!=='send'||!uuid.test(cmd.requestId)||typeof cmd.text!=='string'||!cmd.text.trim()||cmd.text.length>4000)throw fault(400,'Resposta inválida.');
    const digest=createHash('sha256').update(JSON.stringify([session,cmd.owner.id,cmd.jid,cmd.text])).digest('hex');
    const history=await gateway('chat/'+session+'/'+contact);
    if(!history.length)throw fault(409,'A conversa ainda não possui mensagens.');
    if(cmd.autoRevision){
      const last=history.at(-1),mark=teamState(cmd.jid);
      if(!automatic||automatic.status().revision!==cmd.autoRevision||last.fromMe||last.keyId!==cmd.expectedMessageId||mark?.active||mark?.message===last.keyId)
        throw fault(409,'O atendimento mudou antes do envio automático.');
    }
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
