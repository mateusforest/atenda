import nodemailer from 'nodemailer';
import {readWorkspace} from './workspace-blob.mjs';
import {recordId,updateServiceRecords} from './whatsapp-crm.mjs';
import {fault,privateJid,uuid} from './wa-transport.mjs';
import {requestSummary} from './request-summary.mjs';
import {mailConfigured} from './notification-email.mjs';

export function recordNotice(state,job){
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(job.opened);
  const lead=recordId('lead',job.session,job.jid);
  const key=job.id+(job.reminder?'-24h':'-new');
  const rows=state.records.filter(r=>r.section==='services'&&r.related===lead);
  rows.sort((a,b)=>(b.waTime||0)-(a.waTime||0));
  // A new day can move an open handoff into a newer service record.
  const row=rows.find(r=>r.date>=day)||rows[0];
  if(!row)throw Object.assign(fault(409,'Aguardando a sincronização do atendimento.'),{retryable:true});
  if(row.status==='Concluído'||row.waNotice?.key===key)return false;
  if(row.status!=='Com equipe')throw Object.assign(fault(409,'Aguardando a atualização da fila.'),{retryable:true});
  row.waNotice={key,jid:job.jid,opened:job.opened,reminder:job.reminder};
  return row;
}

export async function handoffEmail(job){
  if(!/^[a-f0-9]{64}$/.test(job.id) || !privateJid.test(job.jid) || !uuid.test(job.ownerId) ||
     typeof job.session!=='string' || !job.session || job.session.length>160 ||
     (process.env.WA_AKG_SESSION && job.session!==process.env.WA_AKG_SESSION) ||
     typeof job.reminder!=='boolean'||!Number.isSafeInteger(job.opened)) throw fault(400,'Encaminhamento inválido.');
  const account=await readWorkspace('administracao/contas/'+job.ownerId+'.json');
  if(!account?.state?.email || account.state.email.toLowerCase()!==process.env.WA_OWNER_EMAIL?.toLowerCase())
    throw fault(403,'Conta sem acesso ao canal.');
  let summary='';
  let newlyRecorded=false;
  await updateServiceRecords({id:job.ownerId,email:account.state.email},state=>{
    const row=recordNotice(state,job);
    newlyRecorded=!!row;
    if(row)summary=row.waSummary||job.preview;
    return newlyRecorded;
  });
  const recipient=process.env.ATENDA_TEAM_EMAIL||process.env.ATENDA_SMTP_USER;
  if(!newlyRecorded || process.env.ATENDA_HANDOFF_EMAIL_ENABLED!=='true' || !mailConfigured())return {accepted:true};
  const contact=String(job.name||'Contato no WhatsApp').replace(/[\r\n]/g,' ').slice(0,100);
  const details=requestSummary(summary,contact).slice(0,900);
  const user=process.env.ATENDA_SMTP_USER;
  const smtp=nodemailer.createTransport({host:'smtp.hostinger.com',port:465,secure:true,
    auth:{user,pass:process.env.ATENDA_SMTP_PASSWORD},connectionTimeout:6000,greetingTimeout:6000,socketTimeout:10000});
  try{
    await smtp.sendMail({from:{name:'Atenda',address:user},to:{address:recipient,name:''},
      messageId:'<handoff-'+job.id+'-'+(job.reminder?'24h':'new')+'@atendadot.com>',
      subject:job.reminder?'Lembrete de atendimento com a equipe':'Novo atendimento com a equipe',
      text:[job.reminder?contact+' continua com a equipe após 24 horas.':contact+' passou para a equipe.',details,
        'Abrir conversa: https://atendadot.com/portal#conversa='+encodeURIComponent(job.jid)].filter(Boolean).join('\n\n')});
    return {accepted:true};
  }catch(e){
    throw Object.assign(fault(502,'O servidor de e-mail não confirmou o envio.'),{retryable:false});
  }
}
