import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {receiver} from '../gateway/receiver.mjs';
import {automaticAgent} from '../gateway/automatic.mjs';
import {confirmedName,serviceRecords} from '../gateway/service-records.mjs';
import {mergeService} from '../lib/whatsapp-crm.mjs';
import {requestSummary} from '../lib/request-summary.mjs';

test('a solicitação inclui os detalhes da viagem e omite saudações e URLs com credenciais',()=>{
  assert.equal(requestSummary('oi\nViagem para a Itália\nVacaria RS\nhttps://example.test/?api_key=segredo\nMateus\nopa\nVacaria RS','Mateus'),'Viagem para a Itália\nVacaria RS');
});

test('recupera a cotação respondida, registra voz e fila e preserva edições em novas entregas',async()=>{
  const db=new DatabaseSync(':memory:'),owner={id:randomUUID(),email:'owner@test.invalid'},session='piloto',jid='5511000000000@s.whatsapp.net';
  const start=Date.now()-60000,history=[
    [false,'Mensagem anterior',-1],[false,'Preciso de uma cotação',1000],[false,'',2000],
    [true,'Vou consultar a equipe. Qual destino?',3000],[false,'Quero que eles me orientem',4000],[true,'Vou encaminhar seu pedido para a equipe.',5000]
  ].map(([fromMe,content,time],i)=>({fromMe,content,keyId:'m'+i,timestamp:start+time,type:i===2?'AUDIO':'TEXT'}));
  const gateway=async path=>path.includes('inbox=')?{chats:[{name:'Mateus',jid,time:history.at(-1).timestamp}]}:history;
  const voice={state:()=>({transcript:'Viagem para a Itália, quatro pessoas.'})};
  const execute=receiver({db,gateway,session,sessionId:session,ownerEmail:owner.email,voice});
  automaticAgent({db,gateway,execute,sessionId:session});
  db.prepare('insert into automatic_agent values(?,?,?,?,?,?)').run(session,JSON.stringify(owner),'a','{}',start,'v');
  db.prepare('insert into owner values(?,?)').run(session,owner.id);
  const state={records:[]};let writes=0;
  const crm=serviceRecords({db,sessionId:session,voice,gateway,save:async(o,e)=>{assert.equal(o.id,owner.id);writes++;mergeService(state,e)}});
  await crm.sync();assert.equal(crm.issue(),'');assert.equal(state.records.length,3);
  const lead=state.records.find(r=>r.section==='leads'),task=state.records.find(r=>r.section==='tasks'),service=state.records.find(r=>r.section==='services');
  assert.equal(task.related,lead.id);assert.match(service.waSummary,/Itália/);assert.doesNotMatch(service.waSummary,/anterior/);
  assert.equal(service.status,'Com equipe');assert.match(task.name,/cotação/);
  lead.section='clients';task.status='Concluída';task.notes='Nota da equipe';
  await execute({op:'release',jid,owner,messageId:'m5'});await crm.sync();assert.equal(service.status,'Com agente');
  await crm.sync();assert.equal(state.records.length,3);assert.equal(writes,2);assert.equal(task.notes,'Nota da equipe');assert.equal(task.status,'Concluída');
  assert.equal(confirmedName([{fromMe:true,text:'Qual é o seu nome?'},{fromMe:false,text:'Ana Paula'}]),'Ana Paula');db.close();
});
test('perfil usa a sessão vinculada, restringe os campos e envia fotos como multipart',async()=>{
  const db=new DatabaseSync(':memory:'),owner={id:randomUUID(),email:'owner@test.invalid'},calls=[];
  const gateway=async(...args)=>{calls.push(args);return args[0].startsWith('sessions/')?{me:{id:'5511999999999:1@s.whatsapp.net'}}:{name:'Atenda',status:'Atendimento',pictureUrl:'https://example.org/a.jpg'}};
  const run=receiver({db,gateway,session:'piloto',sessionId:'piloto',ownerEmail:owner.email});
  assert.deepEqual(await run({owner,op:'profile'}),{name:'Atenda',number:'+5511999999999',about:'Atendimento',photo:null,crmIssue:''});
  await assert.rejects(run({owner,op:'editProfile',field:'endpoint',value:'x'}),{status:400});
  await run({owner,op:'editProfile',field:'status',value:'Novo recado'});assert.deepEqual(calls.at(-1),['profile/piloto/status',{status:'Novo recado'},'PUT']);
  await run({owner,op:'editProfile',field:'picture',value:'/9j/2Q=='});assert.equal(calls.at(-1)[1].get('image').type,'image/jpeg');db.close();
});
