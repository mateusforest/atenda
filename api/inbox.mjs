import {callWindows, fault, privateJid, uuid} from '../lib/wa-transport.mjs';
import {lunaReply} from '../lib/luna.mjs';
import {lunaKey} from '../lib/luna-key.mjs';
import {trialReply} from '../lib/agent-profile.mjs';

export default async function inbox(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  const json=(code,value)=>{res.statusCode=code;res.end(JSON.stringify(value))};
  try {
    const token=req.headers.authorization||'';
    if(!/^Bearer [^\s]+$/.test(token)) throw fault(401,'Entre na sua conta Atenda.');
    const {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,WA_OWNER_EMAIL}=process.env;
    if(!WA_OWNER_EMAIL||!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY) throw fault(503,'Canal ainda não configurado.');
    const auth=await fetch(new URL('/auth/v1/user',SUPABASE_URL),{
      headers:{authorization:token,apikey:SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(6000),redirect:'error'
    });
    if(!auth.ok) throw fault([401,403].includes(auth.status)?401:503,'Não foi possível validar a conta.');
    const user=await auth.json();
    if(!uuid.test(user.id)||!user.email_confirmed_at)throw fault(403,'Confirme seu e-mail para acessar a Atenda.');
    const isOwner=user.email?.toLowerCase()===WA_OWNER_EMAIL.toLowerCase();
    if(!isOwner){
      const b=req.method==='POST'&&(typeof req.body==='string'?JSON.parse(req.body):req.body);
      if(b?.op!=='trial')throw fault(403,'Esta conta não possui este canal de WhatsApp.');
      const {hasCurrentPayment}=await import('../lib/subscriber-access.mjs');
      if(!await hasCurrentPayment(user.id))throw fault(403,'O teste do Luna requer uma mensalidade vigente.');
    }
    const params=new URL(req.url,'https://atenda.local').searchParams;
    const owner={id:user.id,email:user.email.toLowerCase()};
    const meta=process.env.ATENDA_META_SEED&&isOwner?(await (await import('../lib/meta-store.mjs')).read('config'))?.data:null;
    const dispatch=async cmd=>meta?.active?(await import('../lib/meta-atendimento.mjs')).metaCommand(meta,cmd):callWindows(cmd);
    let command;
    if(req.method==='GET'){
      const op=params.get('view')||'chats', jid=params.get('jid');
      if(!['status','profile','chats','history'].includes(op)||op==='history'&&!privateJid.test(jid))throw fault(400,'Conversa inválida.');
      const scope=params.get('scope')||'all', page=Number(params.get('page')||1);
      if(!['all','waiting','answered','team'].includes(scope)||!Number.isSafeInteger(page)||page<1||page>100000)throw fault(400,'Filtro de conversas inválido.');
      command={op,jid,owner,scope,page};
    } else if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      if(body?.op==='editProfile'){
        if(!['picture','name','status'].includes(body.field)||typeof body.value!=='string'||body.value.length>(body.field==='picture'?190000:139))throw fault(400,'Perfil inválido.');
        command={op:'editProfile',owner,field:body.field,value:body.value};
      }else if(body?.op==='automatic'){
        if(!['status','enable','pause'].includes(body.mode)||JSON.stringify(body).length>25000)throw fault(400,'Configuração automática inválida.');
        if(body.mode==='enable'&&!await lunaKey())throw fault(409,'Cadastre a chave do Luna na administração da Atenda.');
        command={op:'automatic',owner,mode:body.mode,revision:body.revision,agent:body.agent,profile:body.profile};
      }else if(['review','release','suggest','trial','voice','audio'].includes(body?.op)){
        if(body.op!=='trial'&&!privateJid.test(body.jid))throw fault(400,'Conversa inválida.');
        if(!['trial','review'].includes(body.op)&&(typeof body.messageId!=='string'||!body.messageId||body.messageId.length>200))throw fault(400,'Mensagem inválida.');
        if(JSON.stringify(body).length>40000)throw fault(413,'Contexto muito longo.');
        const key=['trial','suggest'].includes(body.op)?await lunaKey():'';
        if(!isOwner&&!key)throw fault(503,'O Luna ainda precisa de uma chave na administração.');
        const draft=(p,h)=>lunaReply(p,h,{key});
        if(body.op==='trial'&&key)return json(200,await trialReply(draft,body.profile,body.history));
        if(body.op==='suggest'&&key){
          const result=await dispatch({op:'suggestContext',owner,jid:body.jid,profile:body.profile,messageId:body.messageId});
          return json(200,result.context?await draft(body.profile,result.context):result);
        }
        command={op:body.op,owner,jid:body.jid,messageId:body.messageId,profile:body.profile,history:body.history,offset:body.offset};
      }else{
      if(!privateJid.test(body?.jid)||!uuid.test(body?.requestId)||typeof body?.text!=='string'||!body.text.trim()||body.text.length>4000)throw fault(400,'Informe uma resposta de até 4.000 caracteres.');
      command={op:'send',owner,jid:body.jid,requestId:body.requestId,text:body.text.trim()};
      }
    } else throw fault(405,'Método inválido.');
    json(200,await dispatch(command));
  } catch(error){json(error.status||503,{error:error.status?error.message:'O serviço de atendimento está indisponível.'})}
}
