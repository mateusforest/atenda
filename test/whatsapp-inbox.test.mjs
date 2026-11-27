import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {receiver} from '../gateway/receiver.mjs';

test('somente a conta vinculada lê mensagens e uma tentativa gera um único envio',async()=>{
  const db=new DatabaseSync(':memory:'),jid='123@s.whatsapp.net';
  const owner={id:randomUUID(),email:'owner@example.test'};
  const sent=[];
  const gateway=async(path,body)=>{
    if(path==='chat/test')return [{jid,name:'Contato',lastMessage:{content:'Olá'}},{jid:'status@broadcast'}];
    if(path==='chat/test/'+encodeURIComponent(jid))return [{keyId:'one',fromMe:false,content:'Olá'}];
    assert.equal(path,'messages/test/'+encodeURIComponent(jid)+'/send');
    sent.push(body.message.text);
    return {key:{id:'two'}};
  };
  const run=receiver({db,gateway,session:'test',sessionId:'test',ownerEmail:owner.email});
  await assert.rejects(run({op:'chats',owner:{...owner,email:'wrong@example.test'}}),{status:403});
  assert.equal((await run({op:'chats',owner})).chats.length,1);
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
