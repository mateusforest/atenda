import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handoffs} from '../gateway/n8n/handoffs.mjs';

function fixture(){
  const source=new DatabaseSync(':memory:'), state=new DatabaseSync(':memory:');
  source.exec('CREATE TABLE team_handoffs(session,jid,message,active, PRIMARY KEY(session,jid));CREATE TABLE service_chat(session,jid,name,preview);');
  const mark=(message,active=1)=>source.prepare('INSERT OR REPLACE INTO team_handoffs VALUES(?,?,?,?)').run('pilot','100@lid',message,active);
  let time=0;
  const start=()=>handoffs(source,state,'pilot',()=>time);
  return {source,start,mark,advance:hours=>time+=hours*3600000};
}
test('only new handoffs get one immediate notice and one reminder after 24h',async()=>{
  const f=fixture(); f.mark('old');
  let queue=f.start();
  assert.deepEqual(queue.due(),[]);
  f.mark('new'); const [{id}]=queue.due();
  const sent=[]; const send=async job=>{sent.push(job.reminder)};
  assert.equal(await queue.deliver(id,send),'accepted');
  assert.equal(await queue.deliver(id,send),'skipped');
  f.advance(23);queue=f.start();assert.deepEqual(queue.due(),[]);
  f.advance(1);assert.deepEqual(queue.due(),[{id}]);
  await queue.deliver(id,send);assert.deepEqual(queue.due(),[]);
  assert.deepEqual(sent,[false,true]);
});
test('release between listing and sending suppresses reminder and subsequent handoffs get a fresh id',async()=>{
  const f=fixture(),q=f.start(); f.mark('first');
  const [{id}]=q.due(); await q.deliver(id,async()=>{});
  f.advance(24);assert.equal(q.due().length,1);f.mark('released',0);
  assert.equal(await q.deliver(id,()=>assert.fail()),'skipped');
  f.mark('another'); const jobs=q.due();assert.equal(jobs.length,1);assert.notEqual(jobs[0].id,id);
});
test('uncertain deliveries are held and explicit rejection can be retried',async()=>{
  const f=fixture(),q=f.start();f.mark('a');const [{id}]=q.due();
  await assert.rejects(q.deliver(id,async()=>{throw Object.assign(Error('unavailable'),{retryable:true})}));
  assert.deepEqual(q.due(),[]);f.advance(1);
  await assert.rejects(q.deliver(id,async()=>{throw Error('connection lost')}));
  f.advance(24);assert.deepEqual(f.start().due(),[]);
});
test('two overlapping executions cannot dispatch the same notice',async()=>{
  const f=fixture(),q=f.start();f.mark('one');const [{id}]=q.due();
  let finish;const sending=q.deliver(id,()=>new Promise(resolve=>{finish=resolve}));
  assert.equal(await q.deliver(id,()=>assert.fail()),'skipped');finish();await sending;
});

for (const reminder of [false,true]) {
  test(`contact lookup failure keeps the ${reminder?'reminder':'initial notice'} queued for the next attempt`,async()=>{
    const f=fixture(), queue=f.start();
    f.mark('new');
    const [{id}]=queue.due();
    if (reminder) {
      await queue.deliver(id,async()=>{});
      f.advance(24);
    }
    const deliveries=[];
    const send=async job=>{deliveries.push([job.id,job.name,job.reminder])};
    f.source.exec('ALTER TABLE service_chat RENAME TO unavailable_chat');
    await assert.rejects(queue.deliver(id,send),/no such table: service_chat/);
    assert.deepEqual(deliveries,[]);
    f.source.exec('ALTER TABLE unavailable_chat RENAME TO service_chat');
    f.source.prepare('INSERT INTO service_chat VALUES(?,?,?,?)').run('pilot','100@lid','Contato fictício','Olá');
    const next=f.start();
    assert.deepEqual(next.due(),[{id}]);
    assert.equal(await next.deliver(id,send),'accepted');
    assert.equal(await next.deliver(id,send),'skipped');
    assert.deepEqual(next.due(),[]);
    assert.deepEqual(deliveries,[[id,'Contato fictício',reminder]]);
  });
}

test('an alert updates the existing CRM entry and each stage is recorded once', async()=>{
  const {recordNotice}=await import('../lib/handoff-email.mjs');
  const {mergeService}=await import('../lib/whatsapp-crm.mjs');
  const state={records:[]},event={session:'pilot',jid:'100@lid',day:'2026-11-27',time:Date.UTC(2026,10,27,12),withTeam:true,task:'Retornar atendimento'};
  mergeService(state,event);
  const job={...event,id:'x',opened:event.time,reminder:false};
  assert.ok(recordNotice(state,job));assert.equal(recordNotice(state,job),false);
  assert.ok(recordNotice(state,{...job,reminder:true}).waNotice.reminder);
  assert.equal(state.records.length,3);
});
