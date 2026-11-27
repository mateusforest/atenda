import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {officialSupport} from '../gateway/official-support.mjs';
import {officialSession} from '../lib/official-channel.mjs';
import {phoneNumber} from '../lib/administration.mjs';
import admin from '../api/admin.mjs';

test('o painel exige autenticação para dados e comando do número',async()=>{
  for(const [method,url] of [['GET','/api/admin'],['POST','/api/admin?action=channel']]){
    const res={setHeader(){},end(value){this.data=JSON.parse(value)}};
    await admin({url,method,headers:{},body:{op:'connect'}},res);assert.equal(res.statusCode,401);
  }
  assert.equal(phoneNumber('(11) 99999-8765'),'5511999998765');
  assert.equal(phoneNumber('não definido'),'');
});
test('sessão isolada, boas-vindas únicas, suporte, adesão, saída e pausa',async()=>{
  const db=new DatabaseSync(':memory:'),jid='5511999998765@s.whatsapp.net',sent=[],receipts=[];
  let status='missing',history=[],job={id:'a'.repeat(64),phone:jid.split('@')[0],kind:'welcome',created:Date.now()};
  const gateway=async(path,body)=>{
    if(path==='sessions'){if(body){assert.equal(body.sessionId,officialSession);status='STOPPED';return {}}return status==='missing'?[]:[{sessionId:officialSession,status}]}
    assert.ok(path.includes(officialSession));
    if(path.endsWith('/start')){assert.equal(body.importHistory,false);status='SCAN_QR';return {}}
    if(path.endsWith('/qr'))return {base64:'data:image/png;base64,AAA='};
    if(path.startsWith('sessions/'))return {me:{id:'5511000000000:1@s.whatsapp.net'}};
    if(path.includes('inbox=waiting'))return {more:false,chats:history.length?[{jid,time:Date.now()}]:[]};
    if(path.startsWith('chat/'))return history;
    if(path.endsWith('/send')){sent.push(body.message.text);return {key:{id:'ok'}}}
    assert.fail(path);
  };
  let usedProfile;
  const services={db,gateway,clientSession:'atenda-piloto',voice:{},draft:async p=>{usedProfile=p;return {text:'Abra o menu Agentes.'}},
    delivery:async req=>{if(req.op==='pull')return {jobs:[job,job]};receipts.push(req.status);return {}}};
  const agent=officialSupport(services);
  assert.equal((await agent.command('status')).state,'missing');assert.equal((await agent.command('connect')).state,'pairing');status='CONNECTED';
  await agent.tick();assert.equal(sent.length,1);assert.deepEqual(receipts,['sent','sent']);
  const incoming=(key,text,ts=Date.now())=>{history=[{keyId:key,content:text,type:'TEXT',timestamp:ts,fromMe:false}]};
  incoming('old','Oi',Date.now()-900000);await agent.tick();assert.equal(sent.length,1);
  incoming('new','Onde está o agente?');await agent.tick();await agent.tick();assert.equal(sent.at(-1),'Abra o menu Agentes.');assert.equal(sent.length,2);
  incoming('off','PARAR');await agent.tick();incoming('skip','teste');await agent.tick();assert.equal(sent.length,3);
  incoming('on','SIM');await agent.tick();assert.equal(sent.length,4);
  await agent.command('pause');incoming('paused','Oi');await agent.tick();assert.equal(sent.length,4);
  assert.equal((await agent.command('finance-on')).finance,true);
  await agent.command('resume');incoming('finance','Minha fatura está paga?');await agent.tick();
  assert.equal(usedProfile.name,'Assessor financeiro');
  assert.match(usedProfile.goal,/Nunca afirme/);
  const restarted=officialSupport(services);assert.equal((await restarted.command('status')).finance,true);
  await restarted.command('finance-off');incoming('support','Minha mensalidade');await restarted.tick();
  assert.equal(usedProfile.name,'Suporte da Atenda');
  assert.throws(()=>officialSupport({...services,clientSession:officialSession}));db.close();
});
