import {callWindows,fault,uuid} from '../lib/wa-transport.mjs';
import {userOf} from './billing.mjs';
import {dashboard,jobs,acknowledge,registerAccount,phoneNumber} from '../lib/administration.mjs';
import {isWorker} from '../lib/official-channel.mjs';
import {saveLunaKey,lunaKey} from '../lib/luna-key.mjs';
import {lunaReply} from '../lib/luna.mjs';
import {persistService} from '../lib/whatsapp-crm.mjs';

async function signup(body){
  const email=typeof body.email==='string'?body.email.trim():'',password=body.password;
  const phone=body.consent===true?phoneNumber(body.phone):'';
  if(!email||email.length>254||typeof password!=='string'||password.length<8||password.length>1024||body.consent===true&&!phone)
    throw fault(400,'Confira o e-mail, a senha e o número com DDD.');
  const target=new URL('/auth/v1/signup',process.env.SUPABASE_URL);
  target.searchParams.set('redirect_to',new URL('/login',process.env.ATENDA_PUBLIC_URL).href);
  const r=await fetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(14000),headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email,password,data:{atenda_contact:!!phone,atenda_phone:phone}})});
  const result=await r.json();
  if(!r.ok)throw fault(r.status===429?429:400,r.status===429?'Aguarde antes de tentar outro cadastro.':'O serviço de contas recusou o cadastro. Confira o e-mail e a senha.');
  const user=result.user||result;
  if(uuid.test(user.id)&&(result.access_token||user.identities?.length))await registerAccount(user,true);
  return result.access_token?{access_token:result.access_token,refresh_token:result.refresh_token,expires_at:result.expires_at,expires_in:result.expires_in}:{accepted:true};
}
export default async function admin(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data))};
  try{
    const params=new URL(req.url,'https://atenda.local').searchParams,action=params.get('action')||'overview';
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(action==='signup'&&req.method==='POST')return send(200,await signup(body));
    if(action==='service-record'&&req.method==='POST'){
      if(!isWorker(req.headers.authorization,'atenda-crm-v1'))throw fault(401,'Acesso restrito.');
      await persistService(body.owner,body.event);return send(200,{saved:true});
    }
    if(action==='auto-reply'&&req.method==='POST'){
      if(!isWorker(req.headers.authorization,'atenda-luna-autoreply-v1'))throw fault(401,'Acesso restrito.');
      return send(200,await lunaReply(body.profile,body.history,{key:await lunaKey()}));
    }
    if(action==='auto-voice'&&req.method==='POST'){
      if(!isWorker(req.headers.authorization,'atenda-luna-autoreply-v1'))throw fault(401,'Acesso restrito.');
      if(typeof body.audio!=='string'||!body.audio.length||body.audio.length>3800000)throw fault(413,'Tamanho do áudio inválido.');
      const key=await lunaKey();if(!key)throw fault(503,'Configure a chave da OpenAI.');
      const audio=new FormData();audio.set('model','gpt-transcribe');audio.set('file',new Blob([Buffer.from(body.audio,'base64')],{type:'audio/mpeg'}),'mensagem.mp3');
      const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(75000),headers:{Authorization:'Bearer '+key},body:audio});
      if(!r.ok)throw fault(502,'OpenAI respondeu HTTP '+r.status+' na transcrição.');
      return send(200,{text:String((await r.json()).text||'').slice(0,12000)});
    }
    if(action==='delivery'&&req.method==='POST'){
      if(!isWorker(req.headers.authorization))throw fault(401,'Acesso restrito.');
      if(body.op==='pull')return send(200,{jobs:await jobs()});
      if(body.op==='ack'){await acknowledge(body.id,body.status);return send(200,{ok:true})}
      throw fault(400,'Operação de entrega inválida.');
    }
    const user=await userOf(req);
    const allowed=!!process.env.ATENDA_ADMIN_ID&&user.id===process.env.ATENDA_ADMIN_ID;
    if(action==='visit'&&req.method==='POST'){await registerAccount(user);return send(200,{admin:allowed})}
    if(!allowed)throw fault(403,'Esta área é exclusiva do proprietário da Atenda.');
    if(action==='meta'&&['GET','POST'].includes(req.method)){
      const {metaSetup}=await import('../lib/meta-setup.mjs');
      return send(200,await metaSetup(req.method==='GET'?{}:body,user));
    }
    if(action==='luna'&&req.method==='POST'){await saveLunaKey(body.key);return send(200,{configured:true})}
    if(action==='luna'&&req.method==='GET')return send(200,{configured:!!await lunaKey()});
    if(action==='overview'&&req.method==='GET'){
      const offset=Number(params.get('offset')||0);
      if(!Number.isSafeInteger(offset)||offset<0)throw fault(400,'Página inválida.');
      await registerAccount(user);return send(200,await dashboard(offset,user.id));
    }
    if(action==='channel'&&(req.method==='GET'||req.method==='POST'&&['connect','pause','resume'].includes(body.op))){
      return send(200,await callWindows({op:'official',action:req.method==='GET'?'status':body.op,owner:{id:user.id,email:user.email}}));
    }
    throw fault(405,'Operação indisponível.');
  }catch(error){const known=Number.isInteger(error.status)&&error.status>=400&&error.status<=599;
    send(known?error.status:503,{error:known?error.message:'A administração está temporariamente indisponível.'})}
}
