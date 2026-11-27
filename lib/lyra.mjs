import {createHmac,timingSafeEqual,randomInt} from 'node:crypto';
import {dueDate,problem} from './subscriptions.mjs';

export function signForm(fields,key){
  const data=Object.keys(fields).filter(k=>k.startsWith('vads_')).sort().map(k=>fields[k]).concat(key).join('+');
  return createHmac('sha256',key).update(data).digest('base64');
}
export function cardCheckout(s,email,env=process.env){
  const recurringDay=Math.min(Number(s.first.slice(-2)),28);
  const next=dueDate(s.first.slice(0,8)+String(recurringDay).padStart(2,'0'),1);
  const publicUrl=new URL(env.ATENDA_PUBLIC_URL);
  if(publicUrl.protocol!=='https:')throw problem(503,'Configure a origem HTTPS do checkout.');
  const fields={
    vads_site_id:env.LYRA_SHOP_ID,vads_version:'V2',vads_ctx_mode:env.BILLING_ENV==='production'?'PRODUCTION':'TEST',
    vads_action_mode:'INTERACTIVE',vads_page_action:'REGISTER_PAY_SUBSCRIBE',vads_payment_config:'SINGLE',
    vads_trans_date:s.acceptedAt.replace(/[-:T]/g,'').slice(0,14),vads_trans_id:String(randomInt(100000,1000000)),
    vads_amount:String(s.amount),vads_currency:'986',vads_sub_amount:String(s.amount),vads_sub_currency:'986',
    vads_sub_desc:'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY='+recurringDay,vads_sub_effect_date:next.replaceAll('-',''),
    vads_order_id:s.id.replaceAll('-',''),vads_cust_email:email,vads_language:'pt',
    vads_url_return:new URL('/portal',publicUrl).href,vads_url_check:new URL('/api/billing?action=card-notification',publicUrl).href
  };
  return {url:'https://secure.payzen.com.br/vads-payment/',fields:{...fields,signature:signForm(fields,env.LYRA_SIGNATURE_KEY)}};
}
export function verifyNotice(fields,env=process.env){
  if(!env.LYRA_SHOP_ID||!env.LYRA_SIGNATURE_KEY||!fields||Object.values(fields).some(v=>typeof v!=='string'))throw problem(403,'Notificação inválida.');
  const actual=Buffer.from(fields.signature||''), expected=Buffer.from(signForm(fields,env.LYRA_SIGNATURE_KEY));
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected)||fields.vads_site_id!==env.LYRA_SHOP_ID||
    fields.vads_ctx_mode!==(env.BILLING_ENV==='production'?'PRODUCTION':'TEST'))throw problem(403,'Assinatura da notificação inválida.');
}
export function cardNotice(s,f){
  if(s.method!=='card'||f.vads_order_id&&f.vads_order_id!==s.id.replaceAll('-','')&&f.vads_subscription!==s.providerId)throw problem(409,'Pedido de cartão divergente.');
  if(f.vads_subscription&&s.providerId&&s.providerId!==f.vads_subscription)throw problem(409,'Assinatura divergente.');
  if(f.vads_operation_type==='CREDIT')return;
  if(f.vads_recurrence_status==='CREATED'&&f.vads_result==='00'&&f.vads_subscription){
    if(f.vads_sub_currency!=='986'||Number(f.vads_sub_amount)!==s.amount)throw problem(409,'Valor da recorrência divergente.');
    s.providerId=f.vads_subscription;s.alias=f.vads_identifier||s.alias;
    if(s.status!=='canceled')s.status='authorized';
  }
  if(['ABANDONED','NOT_CREATED'].includes(f.vads_recurrence_status)&&!s.providerId)s.status='rejected';
  if(f.vads_operation_type==='DEBIT'&&f.vads_trans_uuid&&f.vads_trans_status){
    if(f.vads_currency!=='986'||Number(f.vads_amount)!==s.amount)throw problem(409,'Valor de transação divergente.');
    const id=f.vads_trans_uuid, stamp=f.vads_trans_date||'';
    if(!/^[a-zA-Z0-9-]{8,64}$/.test(id)||!/^\d{14}$/.test(stamp))throw problem(400,'Identificação da transação inválida.');
    const row=s.invoices.find(item=>item.id===id);
    const status=f.vads_trans_status;
    // A late authorization must not undo a capture, cancellation or refund.
    const rank=v=>({AUTHORISED:1,CAPTURED:2,CANCELLED:3,REFUNDED:4}[v]||0);
    if(!row)s.invoices.push({id,status,date:stamp.slice(0,4)+'-'+stamp.slice(4,6)+'-'+stamp.slice(6,8)});
    else if(rank(status)>=rank(row.status))row.status=status;
  }
}
export async function cancelCard(s,env=process.env){
  if(!s.providerId||!s.alias)throw problem(409,'Aguarde a confirmação da assinatura pelo processador.');
  const res=await fetch('https://api.payzen.com.br/api-payment/V4/Subscription/Cancel',{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(10000),headers:{Authorization:'Basic '+Buffer.from(env.LYRA_SHOP_ID+':'+env.LYRA_REST_PASSWORD).toString('base64'),'Content-Type':'application/json'},
    body:JSON.stringify({subscriptionId:s.providerId,paymentMethodToken:s.alias})});
  if(!res.ok||(await res.json()).status!=='SUCCESS')throw problem(502,'O processador não confirmou o cancelamento.');
  s.status='canceled';
}
