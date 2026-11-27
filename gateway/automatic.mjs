import {createHash,randomUUID} from 'node:crypto';
import {privateJid,uuid,fault} from '../lib/wa-transport.mjs';
import {workerToken} from '../lib/official-channel.mjs';
import {promisesHandoff} from '../dist/agent-rules.mjs';

export async function cloudDraft(profile,history){
  const r=await fetch('https://atenda-amber.vercel.app/api/admin?action=auto-reply',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),
    headers:{Authorization:'Bearer '+workerToken('atenda-luna-autoreply-v1'),'Content-Type':'application/json'},
    body:JSON.stringify({profile,history})
  });
  const data=await r.json();
  if(!r.ok)throw fault(r.status,data.error||'Luna indisponível.');
  return data;
}
export function incomingTime(time){
  const n=Number(time);
  return time!=null&&Number.isFinite(n)?(n<1e11?n*1000:n):Date.parse(time);
}
export function automaticAgent({db,sessionId,ownerId,gateway,execute,draft=cloudDraft}){
  const session=encodeURIComponent(sessionId);
  db.exec('create table if not exists automatic_agent(session text primary key,owner text,agent text,profile text,since integer,revision text)');
  const current=()=>db.prepare('select * from automatic_agent where session=?').get(sessionId);
  let busy=false,page=1,issue='',retryAt=0;
  function status(){
    const row=current();
    return {enabled:!!row?.agent,agent:row?.agent||null,name:row?.agent?JSON.parse(row.profile).name:'',revision:row?.revision||'',issue,host:process.platform==='win32'?'Windows':'Servidor'};
  }
  function activeProfile(){const row=current();return row?.agent?JSON.parse(row.profile):null}
  function configure(cmd){
    if(cmd.mode==='status')return status();
    const prior=current();
    if(cmd.revision!==(prior?.revision||''))throw fault(409,'A configuração mudou. Reabra o WhatsApp no portal.');
    const enabled=cmd.mode==='enable';
    if(!enabled&&cmd.mode!=='pause')throw fault(400,'Comando automático inválido.');
    const p=cmd.profile;
    if(enabled&&(!uuid.test(cmd.agent)||!p||!['name','goal','greeting'].every(k=>typeof p[k]==='string'&&p[k].trim())||JSON.stringify(p).length>20000))throw fault(400,'Selecione e configure um agente ativo.');
    const since=prior?.agent?prior.since:Date.now();
    db.prepare('insert or replace into automatic_agent values(?,?,?,?,?,?)').run(sessionId,JSON.stringify(cmd.owner),enabled?cmd.agent:null,enabled?JSON.stringify(p):null,since,randomUUID());
    page=1;issue='';retryAt=0;return status();
  }
  async function tick(){
    const row=current();if(!row?.agent||busy||Date.now()<retryAt)return;
    busy=true;
    try{
      const sessions=await gateway('sessions');
      if(!sessions.some(s=>s.sessionId===sessionId&&s.status==='CONNECTED')){issue='WhatsApp desconectado. Confira a sessão do número.';retryAt=Date.now()+15000;return}
      const batch=await gateway('chat/'+session+'?inbox=waiting&page='+page);
      page=batch.more?page+1:1;
      const profile=JSON.parse(row.profile),owner=JSON.parse(row.owner);
      let failure='';
      for(const chat of batch.chats){
        if(current()?.revision!==row.revision)break;
        if(!privateJid.test(chat.jid)||!(incomingTime(chat.time)>=row.since))continue;
        const args={owner,jid:chat.jid,profile,autoSince:row.since};
        try{
          const rows=await gateway('chat/'+session+'/'+encodeURIComponent(chat.jid)),last=rows.at(-1);
          if(!last?.keyId||last.fromMe||!(incomingTime(last.timestamp)>=row.since))continue;
          const mark=db.prepare('select active,message from team_handoffs where session=? and jid=?').get(sessionId,chat.jid);
          if(mark?.active||mark?.message===last.keyId)continue;
          const h=createHash('sha256').update(JSON.stringify([sessionId,chat.jid,last.keyId])).digest('hex');
          const requestId=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
          const previous=db.prepare('select key_id from sends where id=?').get(ownerId?sessionId+'/'+requestId:requestId);
          if(previous){if(!previous.key_id)failure='Envio sem confirmação. Confira o histórico da conversa.';continue}
          const context=await execute({...args,op:'suggestContext',messageId:last.keyId});
          if(context.handoff)continue;
          const answer=context.text?context:await draft({...profile,needsName:!!context.needsName},context.context);
          const text=promisesHandoff(answer.text)?'Você quer que eu encaminhe seu atendimento para a equipe?':answer.text;
          await execute({...args,op:'send',requestId,text,expectedMessageId:last.keyId,autoRevision:row.revision});
        }catch(e){
          if(e.status===409)continue;
          failure=e.status?e.message:'Não foi possível preparar a resposta automática.';
          if([401,402,403,429,502,503,504].includes(e.status)){retryAt=Date.now()+60000;break}
        }
      }
      issue=failure;
    }catch(e){issue=e.status?e.message:'O gateway está indisponível.';retryAt=Date.now()+30000}
    finally{busy=false}
  }
  return {configure,status,tick,activeProfile};
}
