import {createHash} from 'node:crypto';
import {privateJid,uuid,fault} from './wa-transport.mjs';
import {readWorkspace} from './workspace-blob.mjs';
import {put} from '@vercel/blob';
import {requestSummary} from './request-summary.mjs';

export function recordId(...parts){
  const h=createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
}
export function mergeService(state,event){
  const {session,jid,day,contactName,email,summary,task,withTeam}=event;
  if(!privateJid.test(jid)||typeof session!=='string'||!session||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(event.time))throw fault(400,'Atendimento inválido.');
  const phone=jid.endsWith('@s.whatsapp.net')?'+'+jid.split('@')[0]:'';
  const name=String(contactName||phone||'Contato no WhatsApp').slice(0,160);
  function ensure(id,defaults){
    const existing=state.records.find(r=>r.id===id);
    if(existing)return existing;
    if(state.records.length>=2000)throw fault(409,'Meu painel atingiu o limite de registros.');
    const created={id,createdAt:new Date(event.time).toISOString(),...defaults};
    state.records.unshift(created);return created;
  }
  const lead=ensure(recordId('lead',session,jid),{section:'leads',name,contact:phone,status:'Em contato',date:day});
  if(event.confirmedName&&(!lead.waName||lead.name===lead.waName))lead.name=name;
  lead.waName=name;
  if(!lead.email&&email)lead.email=String(email).slice(0,250);
  const service=ensure(recordId('service',session,jid,day),{section:'services',name:'Atendimento · '+name,date:day,related:lead.id});
  if((service.waTime||0)>event.time)return;
  service.waTime=event.time;
  service.waSummary=requestSummary(summary,name);
  if(!service.status||['Com agente','Com equipe'].includes(service.status))service.status=withTeam?'Com equipe':'Com agente';
  if(task){
    const row=ensure(recordId('task',session,jid,day),{section:'tasks',name:String(task).slice(0,140)+' · '+name,date:day,related:lead.id,status:'A fazer'});
    row.waSummary=service.waSummary;
  }
}
export async function updateServiceRecords(owner,change){
  if(!uuid.test(owner?.id)||!owner?.email)throw fault(403,'Canal não vinculado a esta empresa.');
  const path='empresas/'+owner.id+'/painel.json';
  for(let i=0;i<4;i++){
    const doc=await readWorkspace(path);
    const state=doc?.state??{profile:{},sections:[],records:[],connections:[]};
    if(change(state)===false)return;
    try{await put(path,JSON.stringify(state),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!doc,...(doc?{ifMatch:doc.rev}:{})});return}
    catch(e){if(!/precondition|already exists/i.test(e.message)&&e.name!=='BlobPreconditionFailedError')throw e}
  }
  throw fault(409,'O painel está sendo atualizado. A sincronização será repetida.');
}

export function persistService(owner,event){
  const tenantSession=uuid.test(owner?.id)&&event?.session==='empresa-'+owner.id.toLowerCase();
  const legacy=owner?.email && owner.email.toLowerCase()===process.env.WA_OWNER_EMAIL?.toLowerCase() && !String(event?.session).startsWith('empresa-');
  if(!tenantSession&&!legacy)throw fault(403,'Canal não vinculado a esta empresa.');
  return updateServiceRecords(owner,state=>mergeService(state,event));
}
