import {createHash} from 'node:crypto';
import {officialSession,workerToken} from '../lib/official-channel.mjs';
import {fault,privateJid} from '../lib/wa-transport.mjs';
import {cloudDraft} from './automatic.mjs';
import {voiceService} from './voice.mjs';

const sessionPath='sessions/'+officialSession;
const portal='https://atendadot.com';
const welcome='Olá! Aqui é o suporte da Atenda. Este número foi informado em um cadastro. Para começar, confirme seu e-mail e entre em '+portal+'/portal. Posso ajudar por aqui. Responda SIM para receber avisos de assinatura ou PARAR para encerrar as mensagens.';
const billing='Há uma atualização na sua mensalidade da Atenda. Consulte Assinatura no portal: '+portal+'/portal. Para interromper as mensagens, responda PARAR.';
const profile={name:'Suporte da Atenda',goal:'Orientar os usuários da Atenda em português, com passos curtos.',knowledge:'Login em '+portal+'/login. Menu WhatsApp conecta o número da empresa. Em Conversas a equipe revisa e envia respostas. Em Agentes > Configurar o modelo Personalizado combina funções. Em Assinatura o plano anunciado é R$ 490 por mês com um agente e um número; cada agente separado adicional custa R$ 190. A habilitação de cobrança depende do que o portal mostra. Para confirmar um pagamento consulte Assinatura no portal.',guidelines:'Atenda somente dúvidas sobre a Atenda. Você não pode ver dados privados, fazer pagamentos, alterar cadastro ou abrir chamados externos. Nunca peça senha, token, QR, documentos ou dados de cartão. Quando faltar informação, explique o que o usuário consegue verificar no portal.'};
function millis(value){const n=Number(value);return Number.isFinite(n)&&value!=null?n*(n<1e11?1000:1):Date.parse(value)}
const digest=value=>createHash('sha256').update(value).digest('hex');
async function cloud(body){
  const r=await fetch(portal+'/api/admin?action=delivery',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{Authorization:'Bearer '+workerToken(),'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw fault(502,'Fila de notificações respondeu HTTP '+r.status+'.');
  return r.json();
}
export function officialSupport({db,gateway,clientSession,draft=cloudDraft,delivery=cloud,voice=voiceService(db,officialSession)}){
  if(clientSession===officialSession)throw Error('O suporte requer uma sessão própria.');
  db.exec(`create table if not exists official_settings(id integer primary key,enabled integer not null,since integer not null);
    insert or ignore into official_settings values(1,0,0);
    create table if not exists official_events(id text primary key,kind text not null,state text not null,created integer not null);
    create table if not exists official_contacts(jid text primary key,permission text not null);`);
  db.exec('create table if not exists official_finance(id integer primary key,enabled integer not null); insert or ignore into official_finance values(1,0)');
  const finance=()=>!!db.prepare('select enabled from official_finance where id=1').get().enabled;
  const settings=()=>db.prepare('select enabled,since from official_settings where id=1').get();
  const contact=jid=>db.prepare('select permission from official_contacts where jid=?').get(jid)?.permission;
  const permission=(jid,value)=>db.prepare('insert or replace into official_contacts values(?,?)').run(jid,value);
  const seen=id=>db.prepare('select state from official_events where id=?').get(id)?.state;
  let connecting,lastStart=0,busy=false,issue='',lastPull=0,page=1;
  async function state(connect=false,withNumber=false){
    const rows=await gateway('sessions');let row=rows.find(x=>x.sessionId===officialSession);
    if(!row&&connect){await gateway('sessions',{name:'Suporte oficial da Atenda',sessionId:officialSession});row={status:'STOPPED'}}
    if(!row)return {state:'missing'};
    if(row.status==='CONNECTED'){
      const details=withNumber?await gateway(sessionPath):null;
      const identity=String(details?.me?.id||'').split('@')[0].split(':')[0];
      return {state:'connected',number:/^\d{7,15}$/.test(identity)?identity:''};
    }
    if(['STOPPED','LOGGED_OUT'].includes(row.status)&&connect&&Date.now()-lastStart>20000){
      await gateway(sessionPath+'/start',{importHistory:false});lastStart=Date.now();
    }
    try{
      const qr=await gateway(sessionPath+'/qr');
      return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr.base64)?{state:'pairing',qr:qr.base64}:{state:'waiting'};
    }catch(e){if(e.gatewayStatus===404)return {state:connect||Date.now()-lastStart<60000?'waiting':'offline'};
      if(e.gatewayStatus===400&&(await gateway('sessions')).some(x=>x.sessionId===officialSession&&x.status==='CONNECTED'))return {state:'connected'};
      throw e}
  }
  async function command(action){
    if(!['status','connect','pause','resume','finance-on','finance-off'].includes(action))throw fault(400,'Ação de suporte inválida.');
    let channel;
    if(action==='connect'){
      connecting??=state(true).finally(()=>{connecting=null});channel=await connecting;
    }else channel=await state(false,true);
    if(action==='pause')db.prepare('update official_settings set enabled=0 where id=1').run();
    if(action==='connect'||action==='resume'){
      if(action==='resume'&&channel.state!=='connected')throw fault(409,'Conecte o número oficial antes de retomar.');
      db.prepare('update official_settings set enabled=1,since=? where enabled=0').run(Date.now());
    }
    if(action==='finance-on'||action==='finance-off')db.prepare('update official_finance set enabled=? where id=1').run(action==='finance-on'?1:0);
    return {...channel,enabled:!!settings().enabled,finance:finance(),issue,activity:db.prepare('select kind,state,created from official_events order by created desc limit 10').all()};
  }
  async function sendOnce(id,jid,text,kind){
    const saved=seen(id);if(saved)return saved;
    if(!settings().enabled)return 'paused';
    const added=db.prepare('insert or ignore into official_events values(?,?,?,?)').run(id,kind,'uncertain',Date.now());
    if(!added.changes)return seen(id);
    const ret=await gateway('messages/'+officialSession+'/'+encodeURIComponent(jid)+'/send',{message:{text}});
    if(!ret?.key?.id)throw fault(502,'Envio sem confirmação do WhatsApp.');
    db.prepare("update official_events set state='sent' where id=?").run(id);
    return 'sent';
  }
  async function reply(chat,since){
    if(!privateJid.test(chat.jid)||!(millis(chat.time)>=since))return;
    const path='chat/'+officialSession+'/'+encodeURIComponent(chat.jid);
    const rows=await gateway(path),m=rows.at(-1);
    if(!m?.keyId||m.fromMe||!(millis(m.timestamp)>=since))return;
    const id=digest(chat.jid+'|'+m.keyId);
    if(seen(id))return;
    const aliases=[...new Set([chat.jid,m.senderJid,m.remoteJid].filter(j=>privateJid.test(j)))];
    let incoming=m.content||'';
    if(m.type==='AUDIO'){
      let s=voice.state(chat.jid,m);
      if(!s.transcript&&!s.issue){voice.start(chat.jid,m);return}
      incoming=s.transcript||'';
    }
    const word=incoming.trim().toLocaleLowerCase('pt-BR');
    let text;
    if(['parar','sair','cancelar mensagens'].includes(word)){
      aliases.forEach(j=>permission(j,'off'));text='Mensagens automáticas desativadas. Para voltar, responda SIM.';
    }else if(word==='sim'){
      aliases.forEach(j=>permission(j,'on'));text='Avisos da Atenda ativados. Como posso ajudar?';
    }else if(aliases.some(j=>contact(j)==='off'))return;
    else if(!incoming.trim())text='Pode descrever sua dúvida em texto para eu orientar você?';
    else{
      const context=rows.slice(-10).map(row=>({fromMe:!!row.fromMe,text:row===m?incoming:row.content||'[Mídia]'}));
      const financialTopic=/\b(?:cobran[çc]as?|mensalidades?|pagamentos?|faturas?|assinaturas?|pix|cart[aã]o|vencimento)\b/i.test(incoming);
      const role=finance()&&financialTopic?{...profile,name:'Assessor financeiro',goal:'Orientar sobre mensalidades, vencimentos e pagamentos da Atenda. Oriente a consultar a própria assinatura no portal. Nunca afirme que uma cobrança foi criada, paga ou cancelada.'}:profile;
      try{text=(await draft(role,context)).text}
      catch{text='Posso orientar pelos menus da Atenda. Use WhatsApp para conectar o número, Conversas para responder clientes e Assinatura para consultar a mensalidade. O assistente de dúvidas está temporariamente indisponível.'}
    }
    // A human reply, a pause or a newer message supersedes the pending draft.
    const latest=(await gateway(path)).at(-1);
    if(latest?.keyId!==m.keyId||latest.fromMe||!settings().enabled||settings().since!==since)return;
    await sendOnce(id,chat.jid,text,'support');
  }
  async function tick(){
    if(busy||!settings().enabled)return;busy=true;
    try{
      const channel=await state(false);if(channel.state!=='connected')return;
      const since=settings().since;
      const inbox=await gateway('chat/'+officialSession+'?inbox=waiting&page='+page);
      page=inbox.more?page+1:1;
      let partial='';
      for(const chat of inbox.chats){
        try{await reply(chat,since)}catch(e){partial=e.status?e.message:'Resposta do suporte pendente.'}
      }
      if(Date.now()-lastPull>=45000){
        const batch=await delivery({op:'pull'});lastPull=Date.now();
        for(const job of batch.jobs){
          if(!/^[a-f0-9]{64}$/.test(job.id)||!/^\d{8,15}$/.test(job.phone)||!['welcome','billing'].includes(job.kind))continue;
          const jid=job.phone+'@s.whatsapp.net',allowed=contact(jid);
          if(!settings().enabled)break;
          const already=seen(job.id);
          const skip=allowed==='off'||job.kind==='billing'&&(!finance()||allowed!=='on')||Date.now()-job.created>7*86400000;
          const status=already||(skip?'suppressed':await sendOnce(job.id,jid,job.kind==='welcome'?welcome:billing,job.kind));
          if(status==='paused')break;
          await delivery({op:'ack',id:job.id,status});
        }
      }
      issue=partial;
    }catch(e){issue=e.status?e.message:'Não foi possível concluir o ciclo do suporte.'}finally{busy=false}
  }
  return {command,tick};
}
