import {createHash,randomUUID} from 'node:crypto';


export const basePrice=49000, extraPrice=19000;
export function problem(status,message){return Object.assign(new Error(message),{status})}
export function quote(seats){
  if(!Number.isSafeInteger(seats)||seats<1||seats>100)throw problem(400,'Escolha entre 1 e 100 agentes.');
  return basePrice+(seats-1)*extraPrice;
}
export function todayBR(time=new Date()){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(time);
}
function days(date,count){return new Date(Date.parse(date+'T12:00:00Z')+count*86400000).toISOString().slice(0,10)}
export function dueDate(first,cycle){
  const [year,month,day]=first.split('-').map(Number);
  const last=new Date(Date.UTC(year,month+cycle,0)).getUTCDate();
  return new Date(Date.UTC(year,month-1+cycle,Math.min(last,day))).toISOString().slice(0,10);
}
export function billingConfig(env=process.env){
  const environment=env.BILLING_ENV||'sandbox';
  if(!['production','sandbox'].includes(environment))throw problem(503,'Ambiente de cobrança inválido.');
  return {environment,card:!!(env.LYRA_SHOP_ID&&env.LYRA_SIGNATURE_KEY&&env.LYRA_REST_PASSWORD&&env.ATENDA_PUBLIC_URL),
    pix:!!(env.SICREDI_PIX_BASE_URL&&env.SICREDI_TOKEN_URL&&env.SICREDI_CLIENT_ID&&env.SICREDI_CLIENT_SECRET&&env.SICREDI_CERT_BASE64&&env.SICREDI_KEY_BASE64&&env.SICREDI_ACCOUNT&&env.SICREDI_BRANCH&&env.CRON_SECRET)};
}
export function prepare(order,email,today=todayBR()){
  const amount=quote(order.seats);
  if(order.accepted!==true||order.amount!==amount||!['pix','card'].includes(order.method))throw problem(400,'Confira e autorize a mensalidade indicada.');
  const name=String(order.name||'').trim(),doc=String(order.document||'').replace(/\D/g,'');
  if(order.method==='pix'&&(name.length<3||name.length>100||!/^\d{11}$|^\d{14}$/.test(doc)))throw problem(400,'Informe o nome e o CPF ou CNPJ do pagador.');
  const customer={name,email,[doc.length===11?'cpf':'cnpj']:doc};
  const subscription={id:randomUUID(),method:order.method,seats:order.seats,amount,status:'creating',
    acceptedAt:new Date().toISOString(),first:order.method==='pix'?days(today,8):today,cycle:0,invoices:[]};
  return {subscription,customer};
}
export async function enrollPix(api,s,customer,save){
  const loc=await api('POST','locrec');
  s.location=loc.id;
  await save();
  const rec=await api('POST','rec',{
    vinculo:{contrato:s.id.replaceAll('-',''),devedor:{nome:customer.name,...(customer.cpf?{cpf:customer.cpf}:{cnpj:customer.cnpj})},objeto:'Mensalidade Atenda'},
    calendario:{dataInicial:s.first,periodicidade:'MENSAL'},valor:{valorRec:(s.amount/100).toFixed(2)},loc:s.location,politicaRetentativa:'NAO_PERMITE'
  });
  s.providerId=rec.idRec;s.status='pending';await save();
}
export async function reconcilePix(api,s,today=todayBR(),schedule=false,env=process.env){
  if(!s.providerId&&s.method==='pix'&&s.location){
    const location=await api('GET','locrec/'+encodeURIComponent(s.location));
    s.providerId=location.idRec;
  }
  if(!s.providerId)return;
  const rec=await api('GET','rec/'+encodeURIComponent(s.providerId));
  if(rec.vinculo.contrato!==s.id.replaceAll('-','')||rec.valor.valorRec!==(s.amount/100).toFixed(2))throw problem(409,'Dados da autorização Pix divergentes.');
  s.status=({APROVADA:'authorized',CRIADA:'pending',CANCELADA:'canceled',EXPIRADA:'expired',REJEITADA:'rejected'})[rec.status]||'review';
  s.code=s.status==='pending'?(rec.dadosQR?.pixCopiaECola||rec.pixCopiaECola):undefined;
  for(const bill of s.invoices.filter(b=>['ATIVA','CRIADA'].includes(b.status))){
    const charge=await api('GET','cobr/'+bill.id);
    verifyCharge(charge,s,bill.id,bill.date);
    bill.status=charge.status;
  }
  if(!schedule||s.status!=='authorized')return;
  let due=dueDate(s.first,s.cycle);
  // Record a missed window instead of debiting a past instalment without notice.
  const billId=date=>createHash('sha256').update(s.id+'|'+date).digest('hex').slice(0,32);
  while(due<days(today,2)){
    const id=billId(due);
    try{
      const existing=await api('GET','cobr/'+id);
      verifyCharge(existing,s,id,due);
      s.invoices.push({id,date:due,status:existing.status});
    }catch(error){
      if(error.bankStatus!==404)throw error;
      s.invoices.push({date:due,status:'missed'});
    }
    due=dueDate(s.first,++s.cycle);
  }
  if(due>days(today,10))return;
  const txid=billId(due);
  const payload={idRec:s.providerId,calendario:{dataDeVencimento:due},valor:{original:(s.amount/100).toFixed(2)},ajusteDiaUtil:true,
    recebedor:{conta:env.SICREDI_ACCOUNT,agencia:env.SICREDI_BRANCH,tipoConta:env.SICREDI_ACCOUNT_TYPE||'CORRENTE'}};
  let charge;
  try{charge=await api('PUT','cobr/'+txid,payload)}
  catch(error){try{charge=await api('GET','cobr/'+txid)}catch{throw error}}
  verifyCharge(charge,s,txid,due);
  s.invoices.push({id:txid,date:due,status:charge.status});s.cycle++;
}
function verifyCharge(charge,s,id,date){
  if(charge.txid!==id||charge.idRec!==s.providerId||charge.valor.original!==(s.amount/100).toFixed(2)||charge.calendario.dataDeVencimento!==date)
    throw problem(409,'A cobrança Pix não corresponde a esta mensalidade.');
}
