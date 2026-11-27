import {DatabaseSync} from 'node:sqlite';
import {receiver} from './receiver.mjs';
import {dirname,join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {fault, transport} from '../lib/wa-transport.mjs';

const {WA_AKG_URL,WA_AKG_API_KEY,WA_AKG_SESSION,WA_OWNER_EMAIL,LOCALAPPDATA}=process.env;
const stateDir=process.env.ATENDA_STATE_DIR||(LOCALAPPDATA&&join(LOCALAPPDATA,'Atenda','WhatsApp-1'));
if(!WA_AKG_API_KEY||!WA_AKG_SESSION||!WA_OWNER_EMAIL||!stateDir)throw Error('Configuração do atendimento incompleta.');
const origin=new URL(WA_AKG_URL);
if(origin.origin!=='http://127.0.0.1:38741')throw Error('O atendimento requer o gateway local da Atenda.');
const session=encodeURIComponent(WA_AKG_SESSION);
const filename=join(stateDir,'atendimento.sqlite');
mkdirSync(dirname(filename),{recursive:true});
const db=new DatabaseSync(filename);
async function gateway(path,body){
  const res=await fetch(new URL('/api/'+path,origin),{method:body?'POST':'GET',redirect:'error',
    headers:{'X-API-Key':WA_AKG_API_KEY,'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(11000)});
  if(!res.ok)throw fault(502,'O WA-AKG respondeu HTTP '+res.status+'.');
  const payload=await res.json();
  if(payload.status===false)throw fault(502,'O WA-AKG recusou a operação.');
  return payload.data ?? payload;
}
const execute=receiver({db,gateway,session,sessionId:WA_AKG_SESSION,ownerEmail:WA_OWNER_EMAIL});

const bus=transport();
bus.listen('request',async ({id,command})=>{
  let answer;
  try{answer={data:await execute(command)}}catch(e){answer={status:e.status||503,error:e.status?e.message:'Gateway local indisponível.'}}
  try{await bus.send('answer',{id,...answer})}catch{/* O solicitante pode já ter expirado. */}
});
bus.channel.subscribe(status=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))console.log('Canal de atendimento:',status)});

