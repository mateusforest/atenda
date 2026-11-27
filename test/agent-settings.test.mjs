import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {receiver} from '../gateway/receiver.mjs';
import {formatAgentProfile,trialReply} from '../lib/agent-profile.mjs';
import {requestsTeam,openingForGreeting,relevantFact} from '../dist/agent-rules.mjs';
import {models,customModel,serviceRoles} from '../dist/agent-models.mjs';

test('preserva os modelos salvos e entrega ao Luna todas as funções do Personalizado',()=>{
  assert.deepEqual(models.slice(0,6).map(m=>m.name),['Atendente','Consultor','Comercial','Suporte','Pós-venda','Personalizado']);
  assert.equal(customModel,5);
  assert.equal(models[0].roleLabel,'Recepção');
  const functions=serviceRoles.map(role=>{
    const model=models[role.model];
    assert.ok(model.greeting.trim() && model.goal.trim() && model.questions.length>=2);
    return {name:role.label,goal:model.goal,question:model.questions[0]};
  });
  assert.equal(new Set(serviceRoles.map(r=>r.key)).size,13);
  const prompt=formatAgentProfile({functions},[]);
  assert.deepEqual(JSON.parse(prompt.slice(prompt.indexOf('{'))).functions,functions);
});

test('abertura, nome, fatos públicos e perguntas já feitas',async()=>{
  const p={name:'Eva',greeting:'Olá, sou {nome}.',tone:'Firme',pace:'Calmo',question:'Qual produto?\nQual prazo?',knowledge:'Horário: 8h às 18h.\nPreço: R$ 40.'};
  const msg=text=>({text,fromMe:false});
  assert.equal(openingForGreeting(p,[msg('Oi!')]),'Olá, sou Eva.');
  assert.equal(openingForGreeting(p,[msg('Oi, qual o preço?')]),'');
  assert.equal(openingForGreeting(p,[{fromMe:true,text:'Oi'},msg('Oi')]),'');
  assert.equal(relevantFact(p.knowledge,'Quanto custa?'),'Preço: R$ 40.');
  const settings=formatAgentProfile(p,[{fromMe:true,text:'Qual produto?'}]);
  assert.match(settings,/Qual prazo/);assert.doesNotMatch(settings,/Qual produto|Eva/);
  assert.match(settings,/uma etapa por vez/);assert.match(settings,/orientação clara/);
  assert.equal(requestsTeam('Quero um atendimento humanizado',''),false);
  assert.equal(requestsTeam('Solicito DEVOLUÇÃO.','devolucao'),true);
  assert.equal((await trialReply(()=>assert.fail(),p,[msg('quero falar com um atendente')])).handoff,true);
});
test('os dois motores respeitam a marcação de equipe, a transcrição e a retomada por mensagem',async()=>{
  const db=new DatabaseSync(':memory:'),owner={email:'teste@example.test',id:randomUUID()},jid='123@lid';
  let rows=[{type:'AUDIO',fromMe:false,keyId:'m1'}];
  const voice={start(){},state(){return {transcript:'Preciso de devolução'}}};
  const run=receiver({db,ownerEmail:owner.email,session:'s',sessionId:'s',voice,gateway:async path=>path.includes('inbox=')?{chats:[{jid}],counts:{}}:rows,draft:async()=>({text:'Rascunho'})});
  const cmd={owner,jid,profile:{handoff:'devolucao',greeting:'Oi!'},messageId:'m1'};
  assert.equal((await run({...cmd,op:'review'})).withTeam,true);
  assert.equal((await run({...cmd,op:'chats'})).chats[0].withTeam,true);
  for(const op of ['suggest','suggestContext'])assert.deepEqual(await run({...cmd,op}),{handoff:true});
  await assert.rejects(run({...cmd,op:'release',messageId:'old'}),{status:409});
  await run({...cmd,op:'release'});
  assert.equal((await run({...cmd,op:'review'})).withTeam,false);
  assert.equal((await run({...cmd,op:'suggestContext'})).context.at(-1).text,'Preciso de devolução');
  rows=[{keyId:'m2',type:'TEXT',fromMe:false,content:'Oi'}];
  for(const op of ['suggest','suggestContext'])assert.deepEqual(await run({...cmd,messageId:'m2',op}),{text:'Oi!',model:'roteiro'});
  rows.push({keyId:'m3',fromMe:false,content:'Quero falar com um atendente'},{keyId:'m4',fromMe:false,content:'Estou com o pedido em mãos'});
  assert.equal((await run({...cmd,op:'review'})).withTeam,true);
  await run({...cmd,messageId:'m4',op:'release'});
  rows.push({keyId:'m5',fromMe:false,content:'Obrigado'});
  assert.equal((await run({...cmd,op:'review'})).withTeam,false);
  db.close();
});
