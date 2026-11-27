import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {automaticAgent} from '../gateway/automatic.mjs';
import {receiver} from '../gateway/receiver.mjs';
import {requestsTeam} from '../dist/agent-rules.mjs';

test('o conector atende sem navegador, preserva a fila e cancela rascunhos ultrapassados',async()=>{
  const owner={id:randomUUID(),email:'conta@example.test'},agent=randomUUID(),jid='5511111111111@lid',db=new DatabaseSync(':memory:');
  const sent=[],rows=[];
  let onDraft=()=>{};
  const incoming=(content,age=2000)=>rows.push({keyId:randomUUID(),fromMe:false,content,timestamp:Date.now()+age,type:'TEXT'});
  const gateway=async(path,body)=>{
    if(path==='sessions')return [{sessionId:'s',status:'CONNECTED'}];
    if(path.includes('inbox=waiting'))return {chats:rows.length?[{jid,time:rows.at(-1).timestamp}]:[]};
    if(path.endsWith('/send')){sent.push(body.message.text);return {key:{id:randomUUID()}}}
    return rows;
  };
  const profile={name:'Luna',goal:'Orientar',greeting:'Olá, sou {nome}.',handoff:'devolução'};
  let draftText='Orientação do agente.';
  const automatic=automaticAgent({db,sessionId:'s',gateway,execute:cmd=>execute(cmd),draft:async()=>{onDraft();return {text:draftText}}});
  const execute=receiver({db,sessionId:'s',session:'s',ownerEmail:owner.email,automatic,gateway});
  const command=(mode,revision)=>execute({op:'automatic',mode,revision,owner,agent,profile});
  incoming('Pedido antigo',-60000);await automatic.tick();assert.equal(sent.length,0);
  const active=await command('enable','');await automatic.tick();assert.equal(sent.length,0);
  await assert.rejects(command('pause',''),{status:409});
  rows.length=0;incoming('Oi');await automatic.tick();await automatic.tick();assert.deepEqual(sent,['Olá, sou Luna.']);
  incoming('Tenho uma dúvida');await automatic.tick();assert.equal(sent[1],'Orientação do agente.');
  incoming('Quero devolução');incoming('Pedido 123');await automatic.tick();
  assert.equal((await execute({op:'history',owner,jid})).withTeam,true);
  assert.equal(sent.length,2);
  incoming('Ainda estou aqui');await automatic.tick();assert.equal(sent.length,2);
  await execute({op:'release',owner,jid,messageId:rows.at(-1).keyId});await automatic.tick();assert.equal(sent.length,2);
  incoming('Outra dúvida');onDraft=()=>incoming('Espere um momento');await automatic.tick();assert.equal(sent.length,2);
  onDraft=()=>{};await automatic.tick();assert.equal(sent.length,3);
  draftText='Vou encaminhar à equipe seu pedido.';
  incoming('Quais são os horários?');await automatic.tick();
  assert.match(sent.at(-1),/^Você quer que eu encaminhe/);
  rows.push({fromMe:true,content:sent.at(-1),keyId:randomUUID(),timestamp:Date.now()+2000});
  incoming('Sim');await automatic.tick();assert.equal((await execute({op:'history',owner,jid})).withTeam,true);
  incoming('Tenho mais uma dúvida');await automatic.tick();assert.equal(sent.length,4);
  await execute({op:'release',owner,jid,messageId:rows.at(-1).keyId});
  incoming('Mais uma dúvida');onDraft=()=>automatic.configure({mode:'pause',revision:active.revision,owner});
  await automatic.tick();await automatic.tick();assert.equal(sent.length,4);assert.equal(automatic.status().enabled,false);
  db.close();
});

test('pedidos de equipe e termos definidos pela empresa',()=>{
  for(const text of ['Pode me passar para um atendente?', 'Pode me transferir para a equipe?', 'Quero falar com alguém da equipe','Humano, por favor','Quero que a equipe me ajude','Equipe, por favor'])
    assert.equal(requestsTeam(text,''),true,text);
  for(const text of ['O corpo humano','Não preciso de um atendente','Não quero falar com uma pessoa'])
    assert.equal(requestsTeam(text,''),false,text);
  assert.equal(requestsTeam('Sobre o REEMBOLSO','reembolso'),true);
});
