import {randomUUID} from 'node:crypto';
import {change,read,credentials,graph,seed,encrypt,verificationToken} from './meta-store.mjs';
import {callWindows,fault} from './wa-transport.mjs';
import {lunaKey} from './luna-key.mjs';

export async function metaSetup(body,user){
  const binding=seed();
  if(!binding||binding.ownerId!==user.id||user.email.toLowerCase()!==process.env.WA_OWNER_EMAIL?.toLowerCase())throw fault(403,'A configuração pertence à conta do número conectado.');
  let config=(await read('config'))?.data;
  if(body.op==='token')return {token:verificationToken()};
  if(body.op==='save'){
    if(config?.active)throw fault(409,'A conexão Meta já está ativa.');
    const {appId,phoneId,wabaId,version,secret,token}=body;
    if(![appId,phoneId,wabaId].every(v=>typeof v==='string'&&/^\d{5,25}$/.test(v))||!/^v\d{1,3}\.0$/.test(version)||!/^\w{32,128}$/.test(secret)||typeof token!=='string'||token.length<32||token.length>4096)throw fault(400,'Confira os IDs, a versão e as credenciais da aplicação na Meta.');
    const c={appId,phoneId,wabaId,version,secret,token};
    const phone=await graph(c,phoneId+'?fields=display_phone_number,verified_name');
    if(phone.display_phone_number?.replace(/\D/g,'')!==binding.number)throw fault(409,'O número da Meta é diferente do WhatsApp vinculado à Atenda.');
    const phones=await graph(c,wabaId+'/phone_numbers?fields=id&limit=100');
    if(!phones.data?.some(p=>p.id===phoneId))throw fault(409,'O telefone não pertence à conta WhatsApp informada.');
    const box=encrypt(c);
    config=await change('config',old=>{
      if(old?.active)throw fault(409,'O canal já foi ativado.');
      return {...old,credentials:box,setupId:randomUUID(),name:phone.verified_name,agent:binding.agent,profile:binding.profile,revision:randomUUID()};
    });
  }
  if(body.op==='activate'&&!config?.active){
    const c=credentials(config);
    if(!await lunaKey())throw fault(409,'Configure o Luna antes de ativar.');
    if(!(await read('challenge'))?.data)throw fault(409,'Verifique primeiro a URL de retorno na Meta.');
    const subs=await graph(c,c.wabaId+'/subscribed_apps?limit=100');
    if(!subs.data?.some(s=>String(s.whatsapp_business_api_data?.id||s.id)===c.appId))throw fault(409,'Associe este aplicativo à conta WhatsApp e assine o campo messages na Meta.');
    const owner={id:user.id,email:user.email.toLowerCase()};
    let snapshot;
    for(let offset=0;;offset+=40){
      snapshot=await callWindows({op:'metaSnapshot',owner,offset});
      for(const chat of snapshot.chats){
        if(!/^\d{6,15}@s\.whatsapp\.net$/.test(chat.jid))continue;
        const history=await callWindows({op:'history',owner,jid:chat.jid});
        const messages=history.messages.map(m=>({...m,time:Number(m.time)<1e11?Number(m.time)*1000:Number(m.time)||Date.parse(m.time)})).filter(m=>Number.isFinite(m.time)&&m.time>=snapshot.since);
        if(!messages.length)continue;
        const phone=chat.jid.split('@')[0];
        await change('chats/'+phone,old=>old&&!old.imported?undefined:{phone,name:chat.name,team:history.withTeam,messages,imported:true});
      }
      if(snapshot.chats.length<40)break;
    }
    const local=snapshot.automatic;
    let paused;
    if(local.enabled)paused=await callWindows({op:'automatic',mode:'pause',revision:local.revision,owner});
    try{
      config=await change('config',old=>{
        if(old?.active)return undefined;
        if(old?.setupId!==config.setupId)throw fault(409,'Credenciais atualizadas. Confira a conexão.');
        return {...old,active:true,since:Date.now(),agent:local.agent,profile:snapshot.profile||binding.profile,revision:randomUUID()};
      });
    }catch(err){
      if(paused&&!(await read('config'))?.data?.active)await callWindows({op:'automatic',mode:'enable',revision:paused.revision,agent:local.agent,profile:snapshot.profile,owner});
      throw err;
    }
  }
  return {number:'+'+binding.number,configured:!!config?.credentials,active:!!config?.active,received:config?.received||null};
}
