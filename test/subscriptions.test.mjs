import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepare,enrollPix,reconcilePix,dueDate,billingConfig} from '../lib/subscriptions.mjs';
import {cardCheckout,verifyNotice,signForm,cardNotice} from '../lib/lyra.mjs';
import {lunaReply} from '../lib/luna.mjs';

const order={method:'pix',seats:2,amount:68000,accepted:true,name:'Teste Fictício',document:'12345678901'};
test('o valor e a autorização vêm do contrato calculado no servidor',()=>{
  assert.throws(()=>prepare({...order,amount:1},'teste@example.invalid'),{status:400});
  assert.throws(()=>prepare({...order,accepted:false},'teste@example.invalid'),{status:400});
  assert.throws(()=>prepare({...order,seats:'2'},'teste@example.invalid'),{status:400});
  assert.equal(dueDate('2028-01-31',1),'2028-02-29');
  assert.equal(dueDate('2028-01-31',2),'2028-03-31');
  assert.equal(billingConfig({}).card,false);
});
test('Pix cria a autorização, aguarda aprovação e concilia duas competências com repetição segura',async()=>{
  const {subscription:s,customer}=prepare(order,'teste@example.invalid','2027-01-01');
  const bills=new Map();let rec,status='CRIADA';
  const api=async(method,path,body)=>{
    if(path==='locrec')return {id:23};
    if(path==='rec'){rec=body;return {idRec:'R1'}}
    if(path==='rec/R1')return {...rec,status,dadosQR:{pixCopiaECola:'TESTE'}};
    const id=path.split('/')[1];
    if(method==='PUT'){
      assert.equal(status,'APROVADA');
      if(bills.has(id))throw Error('txid existente');
      const charge={...body,txid:id,status:'CRIADA'};bills.set(id,charge);return charge;
    }
    if(bills.has(id))return bills.get(id);
    throw Object.assign(Error('ausente'),{bankStatus:404});
  };
  await enrollPix(api,s,customer,async()=>{});
  await reconcilePix(api,s,'2027-01-02',true);
  assert.equal(s.code,'TESTE');assert.equal(bills.size,0);status='APROVADA';
  const before=structuredClone(s);
  await reconcilePix(api,s,'2027-01-02',true);
  await reconcilePix(api,before,'2027-01-02',true);
  assert.equal(bills.size,1);assert.equal(s.invoices[0].id,before.invoices[0].id);
  bills.values().next().value.status='CONCLUIDA';
  await reconcilePix(api,s,'2027-02-02',true);
  assert.equal(bills.size,2);assert.equal(s.invoices[0].status,'CONCLUIDA');assert.equal(s.invoices[1].date,'2027-02-09');
  status='CANCELADA';await reconcilePix(api,s,'2027-03-02',true);assert.equal(bills.size,2);
});
test('cartão exige notificação assinada da loja e separa autorização, captura e cancelamento',()=>{
  const env={ATENDA_PUBLIC_URL:'https://atenda.example',BILLING_ENV:'sandbox',LYRA_SHOP_ID:'12345678',LYRA_SIGNATURE_KEY:'teste'};
  const {subscription:s}=prepare({...order,method:'card'},'teste@example.invalid','2027-01-31');
  const {fields}=cardCheckout(s,'teste@example.invalid',env);
  assert.equal(fields.vads_ctx_mode,'TEST');assert.equal(fields.vads_sub_effect_date,'20270228');
  const notice={...fields,vads_result:'00',vads_operation_type:'DEBIT',vads_recurrence_status:'CREATED',vads_subscription:'sub1',vads_identifier:'tok1',vads_trans_uuid:'testtransaction1',vads_trans_status:'AUTHORISED'};
  notice.signature=signForm(notice,'teste');
  verifyNotice(notice,env);
  assert.throws(()=>verifyNotice({...notice,vads_sub_amount:'1'},env),{status:403});
  cardNotice(s,notice);cardNotice(s,notice);assert.equal(s.invoices.length,1);assert.equal(s.status,'authorized');
  cardNotice(s,{...notice,vads_trans_status:'CAPTURED'});cardNotice(s,notice);
  cardNotice(s,{...notice,vads_operation_type:'CREDIT',vads_trans_uuid:'refundtransaction',vads_trans_status:'CAPTURED'});assert.equal(s.invoices.length,1);
  assert.equal(s.invoices[0].status,'CAPTURED');s.status='canceled';cardNotice(s,notice);assert.equal(s.status,'canceled');
  assert.throws(()=>cardNotice(s,{...notice,vads_amount:'1'}),{status:409});
});
test('Luna usa Responses com contexto limitado e sem armazenar a resposta',async()=>{
  const request=async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(init.body);
    assert.equal(b.model,'gpt-6-luna');assert.equal(b.store,false);assert.equal(b.input[0].content,'Quais os horários?');
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Das 9h às 18h.'}]}]});
  };
  assert.equal((await lunaReply({},[{fromMe:false,text:'Quais os horários?'}],{key:'teste',request})).text,'Das 9h às 18h.');
  await assert.rejects(lunaReply({},[],{key:''}),{status:503});
});
