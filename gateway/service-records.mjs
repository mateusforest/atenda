import {createHash} from 'node:crypto';
import {incomingTime} from './automatic.mjs';
import {workerToken} from '../lib/official-channel.mjs';
import {privateJid,fault} from '../lib/wa-transport.mjs';
import {requestsTeam} from '../dist/agent-rules.mjs';

const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
const namePattern=/^(?:meu nome é|me chamo|pode me chamar de)\s+([\p{L}][\p{L} '\-]{1,55})[.!]?$/iu;
const askedName=text=>/como (?:você |voce )?(?:se chama|prefere ser chamad[oa])|(?:qual|confirmar|informar) (?:é |o )*(?:seu )?nome/i.test(text||'');
export function confirmedName(rows){
  for(let i=rows.length-1;i>=0;i--){
    if(rows[i].fromMe)continue;
    const value=String(rows[i].text||'').trim();
    const explicit=value.match(namePattern)?.[1];
    if(explicit)return explicit.trim();
    if(rows[i-1]?.fromMe&&askedName(rows[i-1].text)&&/^[\p{Lu}][\p{L}'-]{1,25}(?: (?:de |da |dos |do |das )?[\p{Lu}][\p{L}'-]{1,25}){0,4}$/u.test(value)&&!/^(sim|não|obrigad[oa]|oi|olá)$/i.test(value))return value;
  }
  return '';
}
export function acceptedHandoff(text,prior){
  return /(?:equipe|atendente|consultor)/i.test(prior||'')&&/\b(?:quero que (?:eles|elas|a equipe)|prefiro (?:eles|a equipe)|pode (?:me )?encaminhar|sim[, ]+pode (?:me )?(?:chamar|encaminhar))\b/i.test(text||'');
}
async function publish(owner,event){
  const resp=await fetch('https://atendadot.com/api/admin?action=service-record',{method:'POST',redirect:'error',signal:AbortSignal.timeout(18000),headers:{authorization:'Bearer '+workerToken('atenda-crm-v1'),'content-type':'application/json'},body:JSON.stringify({owner,event})});
  if(!resp.ok)throw fault(resp.status,'Sincronização do painel respondeu HTTP '+resp.status+'.');
}
export function serviceRecords({db,sessionId,gateway,voice,save=publish}){
  const session=encodeURIComponent(sessionId);
  db.exec('create table if not exists service_cursor(session text,jid text,stamp text,primary key(session,jid)); create table if not exists service_start(session text primary key,since integer)');
  const prior=db.prepare('select since from automatic_agent where session=?').get(sessionId);
  db.prepare('insert or ignore into service_start values(?,?)').run(sessionId,prior?.since||Date.now());
  const since=db.prepare('select since from service_start where session=?').get(sessionId).since;
  let busy=false,page=1,lastIssue='';
  async function sync(){
    if(busy)return;busy=true;
    try{
      const ownerId=db.prepare('select user_id from owner where session=?').get(session)?.user_id;
      if(!ownerId)return;
      const batch=await gateway('chat/'+session+'?inbox=all&page='+page);
      page=batch.more&&batch.chats.every(c=>incomingTime(c.time)>=since)?page+1:1;
      let issue='';
      for(const chat of batch.chats){
        if(!privateJid.test(chat.jid)||!(incomingTime(chat.time)>=since))continue;
        try{
          const handoff=db.prepare('select active,message from team_handoffs where session=? and jid=?').get(sessionId,chat.jid);
          const stamp=JSON.stringify([chat.time,chat.preview,chat.fromMe,handoff?.active,handoff?.message,chat.name]);
          const digest=createHash('sha256').update(stamp).digest('hex');
          if(db.prepare('select stamp from service_cursor where session=? and jid=?').get(sessionId,chat.jid)?.stamp===digest)continue;
          const history=await gateway('chat/'+session+'/'+encodeURIComponent(chat.jid));
          const rows=history.filter(r=>incomingTime(r.timestamp)>=since).map(r=>({...r,text:r.type==='AUDIO'?voice.state(chat.jid,r).transcript:r.content}));
          const last=rows.at(-1);
          if(!last)continue;
          db.prepare('insert or replace into service_chat values(?,?,?,?,?,?)').run(sessionId,chat.jid,chat.name||chat.notify||'',String(last.text||'[Mídia]').slice(0,160),incomingTime(last.timestamp),last.fromMe?1:0);
          // Repair a previously promised transfer once, without sending another message.
          const inboundIndex=rows.findLastIndex(r=>!r.fromMe);
          const request=rows[inboundIndex]?.text;
          const asked=requestsTeam(request,JSON.parse(db.prepare('select profile from automatic_agent where session=?').get(sessionId)?.profile||'{}').handoff)||acceptedHandoff(request,rows.slice(0,inboundIndex).findLast(r=>r.fromMe)?.text);
          const promised=asked&&last.fromMe&&/\b(?:vou encaminhar|encaminhei) (?:o |seu |a )?(?:pedido|atendimento|conversa).*?(?:equipe|atendente)/i.test(last.text||'');
          if(promised&&!handoff)db.prepare('insert or ignore into team_handoffs values(?,?,?,1)').run(sessionId,chat.jid,last.keyId);
          const team=!!(handoff?.active||promised&&!handoff),name=confirmedName(rows);
          const days=Map.groupBy(rows,r=>dateFormat.format(incomingTime(r.timestamp)));
          for(const [day,messages] of days){
            const inbound=messages.filter(m=>!m.fromMe);
            if(!inbound.length)continue;
            const texts=inbound.map(m=>m.text|| (m.type==='AUDIO'?'[Áudio]':'[Mídia]'));
            const quote=texts.some(t=>/\b(cota[çc][ãa]o|or[çc]amento|proposta)\b/i.test(t));
            const teamToday=team&&day===dateFormat.format(incomingTime(last.timestamp));
            const event={session:sessionId,jid:chat.jid,day,time:incomingTime(messages.at(-1).timestamp),contactName:name||chat.name||chat.notify||inbound.at(-1).pushName,confirmedName:!!name,email:texts.join(' ').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0],summary:texts.slice(-15).join('\n').slice(-2400),withTeam:teamToday,task:quote?'Preparar cotação':teamToday?'Retornar atendimento':''};
            await save({id:ownerId,email:process.env.WA_OWNER_EMAIL},event);
          }
          db.prepare('insert or replace into service_cursor values(?,?,?)').run(sessionId,chat.jid,digest);
        }catch(e){issue=e.status?e.message:'Não foi possível registrar o atendimento.'}
      }
      lastIssue=issue;
    }catch(e){lastIssue=e.status?e.message:'Falha na consulta do WhatsApp para o painel.'}finally{busy=false}
  }
  return {sync,issue:()=>lastIssue};
}
