import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {get,put} from '@vercel/blob';
import {lunaReply} from './luna.mjs';
import {fault} from './wa-transport.mjs';

const path='administracao/credenciais/luna-v1.json';
function encryptionKey(){
  const secret=process.env.WA_BRIDGE_SECRET;
  if(!/^[a-f0-9]{64}$/i.test(secret||''))throw fault(503,'O servidor precisa da chave de proteção da Atenda.');
  return hkdfSync('sha256',Buffer.from(secret,'hex'),'atenda','openai-project-key-v1',32);
}
export async function lunaKey(){
  if(!process.env.BLOB_READ_WRITE_TOKEN)return process.env.OPENAI_API_KEY||'';
  const record=await get(path,{access:'private',useCache:false});
  if(!record)return process.env.OPENAI_API_KEY||'';
  const {iv,tag,box}=await new Response(record.stream).json();
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(box,'base64')),decipher.final()]).toString();
}
export async function saveLunaKey(value){
  const key=String(value||'').trim();
  if(!/^sk-[a-zA-Z0-9_-]{15,500}$/.test(key))throw fault(400,'Cole a chave secreta completa criada no projeto da OpenAI.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  await lunaReply({},[{fromMe:false,text:'Teste técnico. Responda apenas OK.'}],{key});
  const box=Buffer.concat([cipher.update(key,'utf8'),cipher.final()]);
  await put(path,JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),box:box.toString('base64')}),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
}
