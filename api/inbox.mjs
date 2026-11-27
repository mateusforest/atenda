import {callWindows, fault, privateJid, uuid} from '../lib/wa-transport.mjs';

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
    if(!uuid.test(user.id)||!user.email_confirmed_at||user.email?.toLowerCase()!==WA_OWNER_EMAIL.toLowerCase()) throw fault(403,'Esta conta não possui este canal de WhatsApp.');
    const params=new URL(req.url,'https://atenda.local').searchParams;
    const owner={id:user.id,email:user.email.toLowerCase()};
    let command;
    if(req.method==='GET'){
      const op=params.get('view')||'chats', jid=params.get('jid');
      if(!['status','chats','history'].includes(op)||op==='history'&&!privateJid.test(jid))throw fault(400,'Conversa inválida.');
      const scope=params.get('scope')||'all', page=Number(params.get('page')||1);
      if(!['all','waiting','answered'].includes(scope)||!Number.isSafeInteger(page)||page<1||page>100000)throw fault(400,'Filtro de conversas inválido.');
      command={op,jid,owner,scope,page};
    } else if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      if(!privateJid.test(body?.jid)||!uuid.test(body?.requestId)||typeof body?.text!=='string'||!body.text.trim()||body.text.length>4000)throw fault(400,'Informe uma resposta de até 4.000 caracteres.');
      command={op:'send',owner,jid:body.jid,requestId:body.requestId,text:body.text.trim()};
    } else throw fault(405,'Método inválido.');
    json(200,await callWindows(command));
  } catch(error){json(error.status||503,{error:error.status?error.message:'O serviço de atendimento está indisponível.'})}
}
