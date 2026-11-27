import {get,put,list,del} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {uuid,fault} from './wa-transport.mjs';
import {billingConfig} from './subscriptions.mjs';
import {invoiceEmail,mailConfigured} from './notification-email.mjs';
import {readWorkspace} from './workspace-blob.mjs';

const index='administracao/contas/', queue='administracao/fila/', receipts='administracao/entregas/';
export async function read(path){
  const result=await get(path,{access:'private',useCache:false});
  return result?{value:await new Response(result.stream).json(),etag:result.blob.etag}:null;
}
async function write(path,data,etag){
  return put(path,JSON.stringify(data),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{})});
}
function collision(e){return e.name==='BlobPreconditionFailedError'||/already exists|precondition/i.test(e.message)}
async function create(path,data){try{await write(path,data)}catch(e){if(!collision(e))throw e}}
async function* paths(prefix){
  let cursor;
  do{const batch=await list({prefix,cursor,limit:500});yield* batch.blobs.map(b=>b.pathname);cursor=batch.hasMore?batch.cursor:null}while(cursor);
}
export function phoneNumber(input){
  const value=String(input??'').trim();
  if(!/^\+?[\d ()-]{8,26}$/.test(value))return '';
  let digits=value.replace(/\D/g,'');
  if(!value.startsWith('+')&&[10,11].includes(digits.length))digits='55'+digits;
  return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
}
async function enqueue(event,phone,kind){
  const id=createHash('sha256').update(event).digest('hex');
  if(!await read(receipts+id+'.json'))await create(queue+id+'.json',{id,phone,kind,created:Date.now()});
}
export async function registerAccount(user,signup=false){
  if(!uuid.test(user?.id)||!user.email)return;
  const path=index+user.id+'.json',prior=await readWorkspace(path),meta=user.user_metadata||{};
  // Only the first registration binds an outbound number. Later profile edits cannot redirect alerts.
  const contact=meta.atenda_contact===true?phoneNumber(meta.atenda_phone):'';
  const entry=prior?.state||{id:user.id,email:user.email,created:user.created_at,phone:contact,confirmed:false};
  const confirmed=!!user.email_confirmed_at;
  if(!prior)await create(path,{...entry,confirmed});
  else if((confirmed&&!entry.confirmed)||confirmed&&entry.email!==user.email){
    try{await write(path,{...entry,confirmed:true,email:user.email},prior.rev)}catch(e){if(!collision(e))throw e}
  }
  if(entry.phone&&(signup||confirmed))await enqueue('welcome:'+entry.phone,entry.phone,'welcome');
}
export async function jobs(){
  const batch=await list({prefix:queue,limit:20});
  const rows=await Promise.all(batch.blobs.map(b=>read(b.pathname)));
  return rows.filter(Boolean).map(r=>r.value);
}
export async function acknowledge(id,status){
  if(!/^[a-f0-9]{64}$/.test(id)||!['sent','suppressed','uncertain'].includes(status))throw fault(400,'Entrega inválida.');
  const path=queue+id+'.json';
  if(!await read(path))return;
  await create(receipts+id+'.json',{status,at:Date.now()});
  await del(path);
}
export async function subscriptionNotifications(){
  if(billingConfig().environment!=='production')return;
  let mailFailures=0;
  for await(const path of paths('assinaturas/production/accounts/')){
    const id=path.split('/').at(-1).replace('.json','');
    if(!uuid.test(id))continue;
    const account=(await read(index+id+'.json'))?.value;
    if(!account?.confirmed)continue;
    const pointer=(await read(path))?.value;
    if(!uuid.test(pointer?.id))continue;
    const s=(await read('assinaturas/production/contracts/'+pointer.id+'.json'))?.value;
    if(!s?.enrolled||s.owner!==id)continue;
    for(const bill of s.invoices||[]){
      if(!bill.id||!['CAPTURED','CONCLUIDA','REFUSED','REJEITADA'].includes(bill.status))continue;
      const age=Date.now()-Date.parse(bill.date+'T00:00:00Z');
      if(!Number.isFinite(age)||age<0||age>7*86400000)continue;
      const event='invoice:'+s.id+':'+bill.id+':'+bill.status;
      if(account.phone)await enqueue(event,account.phone,'billing');
      if(mailConfigured()&&account.email){
        const id=createHash('sha256').update(event).digest('hex'),path='administracao/emails/'+id+'.json';
        let claim;
        try{claim=await write(path,{state:'reserved',at:Date.now()})}catch(e){if(collision(e))continue;throw e}
        try{
          await invoiceEmail(account.email,bill.status,id);
        }catch(e){
          // A definitive rejection can be retried. An interrupted DATA response may already have been accepted.
          if(e.responseCode>=400||['EAUTH','EDNS','ENOAUTH'].includes(e.code))await del(path);
          else await write(path,{state:'uncertain',at:Date.now()},claim.etag);
          mailFailures++;continue;
        }
        await write(path,{state:'accepted',at:Date.now()},claim.etag);
      }
    }
  }
  if(mailFailures)throw fault(503,'Confira os envios de e-mail das mensalidades antes de repetir.');
}
export async function dashboard(offset,owner){
  const {environment}=billingConfig(), ids=new Set();
  for(const prefix of [index,'empresas/','assinaturas/'+environment+'/accounts/']){
    for await(const path of paths(prefix)){
      if(prefix==='empresas/'&&!path.endsWith('/painel.json'))continue;
      const id=path.slice(prefix.length).split('/')[0].replace('.json','');
      if(uuid.test(id))ids.add(id);
    }
  }
  const page=[...ids].sort().slice(offset,offset+25);
  const accounts=await Promise.all(page.map(async id=>{
    const [account,company,pointer]=await Promise.all([read(index+id+'.json'),read('empresas/'+id+'/painel.json'),read('assinaturas/'+environment+'/accounts/'+id+'.json')]);
    const s=uuid.test(pointer?.value.id)?(await read('assinaturas/'+environment+'/contracts/'+pointer.value.id+'.json'))?.value:null;
    const contract=s?.enrolled&&s.owner===id?{status:s.status,seats:s.seats,amount:s.amount,method:s.method,last:s.invoices?.at(-1)?.status}:null;
    return {company:company?.value.profile?.company||'',email:account?.value.email||'',id,created:account?.value.created||null,confirmed:account?.value.confirmed??null,contract};
  }));
  const own=uuid.test(owner)?await read('empresas/'+owner+'/painel.json'):null;
  const records=own?.value.records||[];
  return {accounts,total:ids.size,offset,more:offset+page.length<ids.size,environment,billing:billingConfig(),mailConfigured:mailConfigured(),
    metrics:{leads:records.filter(r=>r.section==='leads').length,team:records.filter(r=>r.section==='services'&&r.status==='Com equipe').length,tasks:records.filter(r=>r.section==='tasks'&&r.status!=='Concluída').length}};
}
