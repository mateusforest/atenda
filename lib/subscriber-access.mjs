import {get} from '@vercel/blob';
import {todayBR,dueDate} from './subscriptions.mjs';

async function snapshot(path){
  const doc=await get(path,{access:'private',useCache:false});
  return doc?new Response(doc.stream).json():null;
}
export async function hasCurrentPayment(userId){
  if(process.env.BILLING_ENV!=='production')return false;
  const root='assinaturas/production/',pointer=await snapshot(root+'accounts/'+userId+'.json');
  if(!pointer)return false;
  const s=await snapshot(root+'contracts/'+pointer.id+'.json');
  if(!s?.enrolled||s.owner!==userId)return false;
  const today=todayBR();
  return s.invoices.some(b=>['CAPTURED','CONCLUIDA'].includes(b.status)&&b.date<=today&&dueDate(b.date,1)>today);
}
