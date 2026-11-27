import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import webhook,{validSignature,changesFor} from '../api/meta-whatsapp.mjs';
import {encrypt,credentials} from '../lib/meta-store.mjs';

test('Meta valida a assinatura dos bytes recebidos e exige a mesma conta e telefone',async()=>{
  const raw=Buffer.from('{"olá": "mundo"}'),secret='segredo de teste';
  const signed='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  assert.ok(validSignature(raw,signed,secret));assert.equal(validSignature(Buffer.concat([raw,Buffer.from(' ')]),signed,secret),false);
  const c={wabaId:'1001',phoneId:'2002'},number='555432100000';
  const v={messaging_product:'whatsapp',metadata:{phone_number_id:c.phoneId,display_phone_number:'+55 54 3210-0000'}};
  const body={object:'whatsapp_business_account',entry:[{id:c.wabaId,changes:[{field:'messages',value:v},{field:'history',value:v}]}]};
  assert.deepEqual(changesFor(body,c,number),[v]);
  assert.deepEqual(changesFor(body,{...c,wabaId:'outro'},number),[]);
  assert.deepEqual(changesFor(body,{...c,phoneId:'outro'},number),[]);
  assert.deepEqual(changesFor(body,c,'00000000'),[]);
  assert.equal((await webhook.fetch(new Request('https://example.test',{method:'POST',body:raw}))).status,403);
});
test('credenciais da Meta ficam cifradas e adulterações são recusadas',()=>{
  process.env.WA_BRIDGE_SECRET='ab'.repeat(32);
  const original={secret:'segredo de teste',token:'token de teste'},box=encrypt(original);
  assert.ok(!JSON.stringify(box).includes(original.token));assert.deepEqual(credentials({credentials:box}),original);
  assert.throws(()=>credentials({credentials:{...box,tag:Buffer.alloc(16).toString('base64')}}));
});
