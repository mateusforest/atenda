import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {receiver} from '../gateway/receiver.mjs';

test('a sugestão usa a transcrição da conversa, sem enviar, e recusa uma mensagem desatualizada',async()=>{
  const owner={id:randomUUID(),email:'owner@example.test'},jid='123@lid';
  const gateway=async path=>{
    assert.equal(path,'chat/test/'+encodeURIComponent(jid));
    return [{keyId:'m1',type:'AUDIO',fromMe:false}];
  };
  const voice={state:()=>({transcript:'Qual o horário?'}),start(){}};
  const draft=async(profile,rows)=>{assert.equal(rows.at(-1).text,'Qual o horário?');return {text:'Das 9h às 18h.'}};
  const run=receiver({db:new DatabaseSync(':memory:'),session:'test',sessionId:'test',ownerEmail:owner.email,gateway,voice,draft});
  assert.deepEqual(await run({op:'suggest',owner,jid,messageId:'m1'}),{text:'Das 9h às 18h.'});
  await assert.rejects(run({op:'suggest',owner,jid,messageId:'outro'}),{status:409});
  await assert.rejects(run({op:'audio',owner,jid,messageId:'outro',offset:0}),{status:404});
  await assert.rejects(run({op:'trial',owner:{...owner,email:'outro@example.test'}}),{status:403});
});

test('somente a conta vinculada lê mensagens e uma tentativa gera um único envio',async()=>{
  const db=new DatabaseSync(':memory:'),jid='123@s.whatsapp.net';
  const owner={id:randomUUID(),email:'owner@example.test'};
  const sent=[];
  const gateway=async(path,body)=>{
    if(path==='chat/test?inbox=all&page=1')return {counts:{total:1,waiting:1,answered:0},more:false,chats:[{jid,name:'Contato',preview:'Olá',fromMe:false},{jid:'status@broadcast'}]};
    if(path.endsWith('/profile-picture'))return {profilePicUrl:'https://pps.whatsapp.net/example.jpg'};
    if(path==='chat/test/'+encodeURIComponent(jid))return [{keyId:'one',fromMe:false,content:'Olá'}];
    assert.equal(path,'messages/test/'+encodeURIComponent(jid)+'/send');
    sent.push(body.message.text);
    return {key:{id:'two'}};
  };
  const run=receiver({db,gateway,session:'test',sessionId:'test',ownerEmail:owner.email});
  await assert.rejects(run({op:'chats',owner:{...owner,email:'wrong@example.test'}}),{status:403});
  const inbox=await run({op:'chats',owner});
  assert.equal(inbox.chats.length,1);
  assert.equal(inbox.counts.waiting,1);
  assert.equal((await run({op:'chats',owner})).chats[0].photo,'https://pps.whatsapp.net/example.jpg');
  await assert.rejects(run({op:'chats',owner:{...owner,id:randomUUID()}}),{status:403});
  assert.equal((await run({op:'history',owner,jid})).messages[0].text,'Olá');
  const send={op:'send',owner,jid,requestId:randomUUID(),text:'Resposta'};
  assert.equal((await run(send)).keyId,'two');
  assert.equal((await run(send)).keyId,'two');
  await assert.rejects(run({...send,text:'Outra'}),{status:409});
  await assert.rejects(run({...send,jid:'123@g.us'}),{status:400});
  assert.deepEqual(sent,['Resposta']);
  db.close();
});

test('falha após o início do envio mantém a tentativa bloqueada para repetição',async()=>{
  let attempts=0;
  const db=new DatabaseSync(':memory:'),owner={id:randomUUID(),email:'owner@example.test'};
  const gateway=async(path,body)=>{if(!body)return [{}];attempts++;throw Error('lost confirmation')};
  const run=receiver({db,gateway,session:'test',sessionId:'test',ownerEmail:owner.email});
  const cmd={op:'send',owner,jid:'123@lid',text:'Texto',requestId:randomUUID()};
  await assert.rejects(run(cmd),{status:502});await assert.rejects(run(cmd),{status:409});assert.equal(attempts,1);
  db.close();
});

test('somente o dono inicia pareamento e as consultas de QR não reiniciam a sessão',async()=>{
  const owner={id:randomUUID(),email:'owner@example.test'};
  let starts=0,connected=false,ready=false;
  const gateway=async(path,body)=>{
    if(path==='sessions')return [{sessionId:'test',status:connected?'CONNECTED':'LOGGED_OUT'}];
    if(path==='sessions/test')return {status:connected?'CONNECTED':'LOGGED_OUT'};
    if(path==='sessions/test/start'){starts++;assert.deepEqual(body,{importHistory:false});return {}}
    if(path==='sessions/test/qr'){
      if(!ready)throw Object.assign(new Error('no QR'),{gatewayStatus:404});
      return {base64:'data:image/png;base64,YQ=='};
    }
    assert.fail(path);
  };
  const run=receiver({db:new DatabaseSync(':memory:'),session:'test',sessionId:'test',ownerEmail:owner.email,gateway});
  await assert.rejects(run({op:'connect',owner:{...owner,email:'other@example.test'}}),{status:403});
  assert.deepEqual(await run({op:'pairing',owner}),{state:'stopped'});
  await assert.rejects(run({op:'profile',owner}),{status:409});
  assert.equal(starts,0);
  await Promise.all([run({op:'connect',owner}),run({op:'connect',owner})]);
  ready=true;
  assert.deepEqual(await run({op:'pairing',owner}),{state:'pairing',qr:'data:image/png;base64,YQ=='});
  connected=true;
  assert.deepEqual(await run({op:'pairing',owner}),{state:'connected'});
  assert.equal(starts,1);
});
