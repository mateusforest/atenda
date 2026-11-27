import {put} from '@vercel/blob';
import {readWorkspace} from './workspace-blob.mjs';
import {uuid,fault} from './wa-transport.mjs';
import {models,customModel,serviceRoles} from '../dist/agent-models.mjs';

const fields=['name','goal','greeting','question','tone','pace','knowledge','handoff'];
function members(value){
  if(!Array.isArray(value)||!value.length||value.length>150||JSON.stringify(value).length>1500000)
    throw fault(400,'Equipe inválida ou muito grande.');
  const ids=new Set();
  return value.map(a=>{
    if(!a || !uuid.test(a.id)||ids.has(a.id)||!Number.isInteger(a.model)||!models[a.model]||
       !fields.every(k=>typeof a[k]==='string'&&a[k].length<=4000)||!a.name.trim())
      throw fault(400,'Configuração de agente inválida.');
    ids.add(a.id);
    const entry={id:a.id,model:a.model,licensed:a.licensed===true,paused:a.paused===true};
    for(const key of fields)entry[key]=a[key];
    if(a.legacy===true)entry.legacy=true;
    if(a.model===customModel&&a.functions){
      entry.functions={};
      for(const {key} of serviceRoles){
        if(!Object.hasOwn(a.functions,key))continue;
        if(typeof a.functions[key]!=='string'||a.functions[key].length>240)throw fault(400,'Pergunta de função inválida.');
        entry.functions[key]=a.functions[key];
      }
    }
    return entry;
  });
}
async function write(path,state,rev){
  try{
    return (await put(path,JSON.stringify(state),{access:'private',contentType:'application/json',addRandomSuffix:false,
      allowOverwrite:!!rev,...(rev?{ifMatch:rev}:{})})).etag;
  }catch(error){
    if(error.name==='BlobPreconditionFailedError'||/already exists|precondition/i.test(error.message))throw fault(409,'A equipe mudou. Reabra o portal antes de salvar.');
    throw error;
  }
}

export async function companyTeam(user,method,body,{read=readWorkspace,store=write}={}){
  if(!uuid.test(user?.id)||!user.email_confirmed_at)throw fault(403,'Confirme seu e-mail para acessar sua equipe.');
  const path='empresas/'+user.id+'/agentes.json';
  const doc=await read(path);
  let placeholder=doc?.state.placeholder;
  const team=doc?.state.team||[],rev=doc?.rev||'';
  if(method==='GET')return {team,rev};
  if(body?.rev!==rev)throw fault(409,'A equipe mudou. Reabra o portal antes de salvar.');
  const input=members(body.team);
  let next;
  if(body.mode==='seed'){
    if(team.length)return {team,rev};
    if(input.length!==1)throw fault(400,'Equipe inicial inválida.');
    next=input;placeholder=true;
  }else if(body.mode==='import'){
    const prior=new Set(team.map(a=>a.id));
    const additions=input.filter(a=>!prior.has(a.id));
    if(!additions.length)return {team,rev};
    next=members([...(placeholder?[]:team),...additions]);placeholder=false;
  }else if(body.mode==='save'){next=input;placeholder=false}
  else throw fault(400,'Operação de equipe inválida.');
  return {team:next,rev:await store(path,{team:next,placeholder},rev)};
}
