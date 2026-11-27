import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {companyChannels} from '../gateway/company-channels.mjs';
import {companyTeam} from '../lib/company-team.mjs';
import {models} from '../dist/agent-models.mjs';

const account=name=>({id:randomUUID(),email:name+'@example.test',email_confirmed_at:new Date().toISOString()});
const member=name=>({id:randomUUID(),model:0,name,goal:models[0].goal,greeting:models[0].greeting,
  question:'Qual produto?',knowledge:'',handoff:'',tone:'Direto',pace:'Calmo',licensed:true,paused:false});

test('duas empresas pareiam e consultam históricos separados, inclusive para o mesmo contato após reiniciar o serviço',async()=>{
  const db=new DatabaseSync(':memory:'), a=account('empresa-a'),b=account('empresa-b');
  const jid='123@lid',other='456@lid',sessions=new Map(),messages=new Map();
  const gateway=async(path,body)=>{
    if(path==='sessions'&&body){sessions.set(body.sessionId,'STOPPED');return {}}
    if(path==='sessions')return Array.from(sessions,([sessionId,status])=>({sessionId,status}));
    const [kind,id,op]=path.split('/');
    if(kind==='sessions'&&op==='start'){sessions.set(id,'SCAN_QR');return {}}
    if(kind==='sessions'&&op==='qr')return {base64:'data:image/png;base64,'+Buffer.from(id).toString('base64')};
    const [session]=id.split('?');
    const rows=messages.get(session)||{};
    if(kind==='chat'&&!op)return {chats:Object.entries(rows).map(([jid,text])=>({jid,preview:text})),more:false};
    if(kind==='chat')return rows[decodeURIComponent(op)]?[{keyId:'inbound',fromMe:false,content:rows[decodeURIComponent(op)]}]:[];
    if(kind==='messages'){rows[decodeURIComponent(op)]=body.message.text;return {key:{id:'outbound'}}}
    if(path.endsWith('profile-picture'))return {};
    throw Error('Operação inesperada.');
  };
  const init=()=>companyChannels({db,gateway,legacySession:'piloto',legacyEmail:'dono@example.test'});
  let svc=init();
  const run=(owner,op,fields={})=>svc.execute({owner,op,...fields});
  assert.deepEqual(await run(a,'pairing'),{state:'missing'});
  assert.equal(sessions.size,0);
  const [qa,qb]=await Promise.all([run(a,'connect'),run(b,'connect')]);
  assert.notEqual(qa.qr,qb.qr);
  const ka='empresa-'+a.id,kb='empresa-'+b.id;
  sessions.set(ka,'CONNECTED');sessions.set(kb,'CONNECTED');
  messages.set(ka,{[jid]:'Orçamento da A',[other]:'Apenas A'});messages.set(kb,{[jid]:'Financeiro da B'});
  svc=init();
  assert.deepEqual((await run(a,'chats')).chats.map(r=>r.preview),['Orçamento da A','Apenas A']);
  assert.deepEqual((await run(b,'chats')).chats.map(r=>r.preview),['Financeiro da B']);
  assert.deepEqual((await run(b,'history',{jid:other})).messages,[]);
  assert.equal((await run(b,'history',{jid,session:ka})).messages[0].text,'Financeiro da B');
  await run(b,'send',{jid,text:'Resposta da B',requestId:randomUUID()});
  assert.equal((await run(a,'history',{jid})).messages[0].text,'Orçamento da A');
  assert.equal((await run(b,'history',{jid})).messages[0].text,'Resposta da B');
  await run(a,'automatic',{mode:'enable',revision:'',agent:randomUUID(),profile:member('Agente A')});
  assert.equal((await run(b,'automatic',{mode:'status'})).enabled,false);
  await assert.rejects(run(b,'official'),{status:403});
  db.close();
});

test('o servidor recupera a equipe por conta, importa rascunhos uma vez e rejeita revisão antiga',async()=>{
  const a=account('empresa-a'),b=account('empresa-b'),docs=new Map();
  const storage={read:async path=>docs.get(path),store:async(path,state,rev)=>{
    assert.equal(docs.get(path)?.rev||'',rev);
    const next=randomUUID();docs.set(path,{state,rev:next});return next;
  }};
  const call=(u,body)=>companyTeam(u,body?'POST':'GET',body,storage);
  const ma=member('Orçamentos A'),mb=member('Financeiro B');
  const initial=await call(a,{mode:'import',team:[ma],rev:''});
  await call(b,{mode:'import',team:[mb],rev:'',owner:a.id});
  assert.deepEqual((await call(b)).team,[mb]);
  assert.deepEqual((await call(a)).team,[ma]);
  const again=await call(a,{mode:'import',rev:initial.rev,team:[ma]});
  assert.equal(initial.rev,again.rev);
  await call(a,{mode:'save',rev:again.rev,team:[{...ma,name:'Alterado em outro navegador'}]});
  await assert.rejects(call(a,{mode:'save',rev:initial.rev,team:[ma]}),{status:409});
  assert.equal((await call(a)).team[0].name,'Alterado em outro navegador');
  assert.deepEqual((await call(b)).team,[mb]);
});
