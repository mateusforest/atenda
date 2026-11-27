import {get,put,list} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
import QRCode from 'qrcode';
import {basePrice,extraPrice,billingConfig,prepare,enrollPix,reconcilePix,problem,todayBR} from '../lib/subscriptions.mjs';
import {sicredi} from '../lib/sicredi.mjs';
import {cardCheckout,verifyNotice,cardNotice,cancelCard} from '../lib/lyra.mjs';

const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
async function read(path){
  const result=await get(path,{access:'private',useCache:false});
  return result?{data:await new Response(result.stream).json(),etag:result.blob.etag}:null;
}
async function write(path,data,etag){
  try{return (await put(path,JSON.stringify(data),{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag}:{allowOverwrite:false})})).etag}
  catch(e){if(/already exists|precondition/i.test(e.message)||e.name==='BlobPreconditionFailedError')throw problem(409,'A assinatura mudou. Atualize antes de continuar.');throw e}
}
async function userOf(req){
  const auth=req.headers.authorization||'';
  if(!/^Bearer \S+$/.test(auth))throw problem(401,'Entre na sua conta Atenda.');
  const r=await fetch(new URL('/auth/v1/user',process.env.SUPABASE_URL),{headers:{Authorization:auth,apikey:process.env.SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(6000),redirect:'error'});
  if(!r.ok)throw problem(r.status>=500?503:401,'Não foi possível validar a conta.');
  const user=await r.json();
  if(!uuid.test(user.id)||!user.email_confirmed_at)throw problem(403,'Confirme o e-mail da conta.');
  return user;
}
function jsonBody(req){try{return typeof req.body==='string'?JSON.parse(req.body):req.body}catch{throw problem(400,'JSON inválido.')}}
function cardIndex(root,id){return root+'card/'+createHash('sha256').update(id).digest('hex')+'.json'}
async function reserveCardForm(root,s,email){
  for(let attempt=0;attempt<5;attempt++){
    const form=cardCheckout(s,email);
    const {vads_trans_date,vads_trans_id}=form.fields;
    try{
      await write(root+'transactions/'+vads_trans_date.slice(0,8)+'-'+vads_trans_id+'.json',{id:s.id});
      return form;
    }catch(error){if(error.status!==409)throw error}
  }
  throw problem(503,'Tente abrir o checkout novamente.');
}
async function notice(root,req){
  const fields=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body;
  verifyNotice(fields);
  const order=fields.vads_order_id||'';
  let id;
  if(fields.vads_subscription)id=(await read(cardIndex(root,fields.vads_subscription)))?.data.id;
  if(!id&&/^[a-f0-9]{32}$/i.test(order))id=order.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
  if(!uuid.test(id))throw problem(404,'Contrato de cartão não encontrado.');
  const path=root+'contracts/'+id+'.json', current=await read(path);
  if(!current||!current.data.enrolled)throw problem(404,'Contrato inexistente.');
  cardNotice(current.data,fields);
  if(current.data.providerId){
    const lookup=cardIndex(root,current.data.providerId), linked=await read(lookup);
    if(!linked)await write(lookup,{id});
    else if(linked.data.id!==id)throw problem(409,'Referência do processador divergente.');
  }
  await write(path,current.data,current.etag);
}
async function publicInfo(s){
  if(!s)return null;
  const {id,amount,seats,method,status,first,invoices,code}=s;
  return {id,amount,seats,method,status,first,invoices:invoices.slice(-24),code,
    qr:code?await QRCode.toDataURL(code,{margin:3,width:280}):undefined,cardForm:method==='card'&&status==='pending'?s.cardForm:undefined};
}
function cronAuthorized(req){
  const expected=process.env.CRON_SECRET;
  if(!expected)return false;
  const a=Buffer.from(req.headers.authorization||''),b=Buffer.from('Bearer '+expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
async function scan(root){
  let cursor,failures=0;
  const api=sicredi();
  do{
    const result=await list({prefix:root+'contracts/',limit:100,cursor});
    for(const blob of result.blobs){
      try{
        const record=await read(blob.pathname),s=record?.data;
        if(!s?.enrolled||s.method!=='pix'||s.status==='creating'&&Date.now()-Date.parse(s.acceptedAt)<120000)continue;
        const before=JSON.stringify(s);
        await reconcilePix(api,s,todayBR(),true);
        if(JSON.stringify(s)!==before)await write(blob.pathname,s,record.etag);
      }catch{failures++}
    }
    cursor=result.hasMore?result.cursor:null;
  }while(cursor);
  if(failures)throw problem(503,'Conciliação pendente em '+failures+' contrato(s).');
}
export default async function billing(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  const send=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body))};
  try{
    const cfg=billingConfig(),root='assinaturas/'+cfg.environment+'/',action=new URL(req.url,'https://atenda.local').searchParams.get('action');
    if(action==='card-notification'){
      if(req.method!=='POST')throw problem(405,'Método inválido.');
      await notice(root,req);return send(200,{received:true});
    }
    if(action==='reconcile'){
      if(req.method!=='GET'||!cronAuthorized(req))throw problem(401,'Acesso restrito.');
      if(cfg.pix)await scan(root);return send(200,{ok:true});
    }
    const user=await userOf(req),account=root+'accounts/'+user.id+'.json',pointer=await read(account);
    let path=pointer?root+'contracts/'+pointer.data.id+'.json':null, current=path?await read(path):null;
    if(pointer&&(!current||current.data.owner!==user.id))throw problem(409,'Vínculo da assinatura inconsistente.');
    let s=current?.data,etag=current?.etag;
    const save=async()=>{etag=await write(path,s,etag)};
    if(s&&!s.enrolled){s.enrolled=true;await save()}
    if(s?.status==='creating'&&!s.location&&!s.providerId&&Date.now()-Date.parse(s.acceptedAt)>120000){
      s.status='rejected';await save();
    }
    if(req.method==='POST'){
      const order=jsonBody(req);
      if(order?.op==='start'){
        if(!['pix','card'].includes(order.method)||!cfg[order.method])throw problem(503,'Este meio de pagamento aguarda habilitação.');
        if(s&&!['canceled','expired','rejected'].includes(s.status))throw problem(409,'Já existe uma contratação em andamento nesta conta.');
        const request=prepare(order,user.email);
        s={...request.subscription,owner:user.id,enrolled:false};
        path=root+'contracts/'+s.id+'.json';etag=undefined;
        if(s.method==='card'){
          s.cardForm=await reserveCardForm(root,s,user.email);s.status='pending';
        }
        await save();
        await write(account,{id:s.id},pointer?.etag);
        s.enrolled=true;await save();
        if(s.method==='pix'){
          const api=sicredi();
          try{await enrollPix(api,s,request.customer,save)}
          catch(error){
            if(!s.providerId&&(!s.location||[400,401,403,422].includes(error.bankStatus))){s.status='rejected';await save()}
            throw error;
          }
          await reconcilePix(api,s);await save();
        }
      }else if(!s||order?.id!==s.id)throw problem(409,'Atualize a assinatura antes de continuar.');
      else if(order.op==='refresh'&&s.method==='pix'){
        if(!cfg.pix)throw problem(503,'Pix indisponível.');
        await reconcilePix(sicredi(),s);await save();
      }else if(order.op==='cancel'){
        if(order.confirmed!==true)throw problem(400,'Confirme o cancelamento.');
        if(s.method==='card'){await cancelCard(s)}
        else{
          if(!cfg.pix||!s.providerId)throw problem(409,'Aguarde a identificação da autorização no Sicredi.');
          await sicredi()('PATCH','rec/'+encodeURIComponent(s.providerId),{status:'CANCELADA'});
          await reconcilePix(sicredi(),s);
        }
        try{await save()}catch(error){
          if(error.status!==409||s.method!=='card'||s.status!=='canceled')throw error;
          const latest=await read(path);s=latest.data;etag=latest.etag;s.status='canceled';await save();
        }
      }else throw problem(400,'Operação desconhecida.');
    }else if(req.method!=='GET')throw problem(405,'Método inválido.');
    send(200,{config:cfg,basePrice,extraPrice,subscription:await publicInfo(s)});
  }catch(e){
    const safe=Number.isInteger(e.status)&&e.status>=400&&e.status<=599;
    send(safe?e.status:503,{error:safe?e.message:'O serviço de assinaturas está indisponível. Consulte o estado da assinatura antes de repetir.'});
  }
}
