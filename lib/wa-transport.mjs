import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';

export const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const privateJid = /^\d{1,24}@(s\.whatsapp\.net|lid)$/;
export function fault(status, message) { return Object.assign(new Error(message), {status}); }

export function transport() {
  const key = Buffer.from(process.env.WA_BRIDGE_SECRET || '', 'hex');
  if (key.length !== 32) throw fault(503, 'A conexão com o Windows precisa ser configurada.');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}
  });
  const topic = createHmac('sha256', key).update('atenda-wa-v1').digest('hex');
  const channel = client.channel(topic, {config:{broadcast:{ack:true}}});
  function listen(event, callback) {
    channel.on('broadcast', {event}, ({payload}) => {
      let message;
      try {
        if (typeof payload?.box !== 'string' || payload.box.length > 430000) return;
        const box = Buffer.from(payload.box,'base64');
        const decipher = createDecipheriv('aes-256-gcm',key,box.subarray(0,12));
        decipher.setAAD(Buffer.from(event));
        decipher.setAuthTag(box.subarray(12,28));
        message = JSON.parse(Buffer.concat([decipher.update(box.subarray(28)),decipher.final()]));
        if (!uuid.test(message.id) || !Number.isFinite(message.time) || Math.abs(Date.now()-message.time)>45000) return;
      } catch { return; }
      callback(message);
    });
  }
  async function send(event, message) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(event));
    const data = Buffer.concat([cipher.update(JSON.stringify({...message,time:Date.now()})),cipher.final()]);
    const box = Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
    if (await channel.send({type:'broadcast',event,payload:{box}}) !== 'ok') throw fault(503,'A conexão com o Windows foi interrompida.');
  }
  return {channel,listen,send,close:()=>client.removeAllChannels()};
}

export async function callWindows(command) {
  const bus = transport(), id = randomUUID();
  let timer;
  try {
    return await new Promise((resolve,reject)=>{
      timer = setTimeout(()=>reject(fault(504,'O Windows não confirmou a operação a tempo.')),['suggest','trial'].includes(command.op)?84000:18000);
      bus.listen('answer',msg=>{
        if (msg.id!==id) return;
        if (msg.error) reject(fault(msg.status,msg.error)); else resolve(msg.data);
      });
      bus.channel.subscribe(status=>{
        if(status==='SUBSCRIBED') bus.send('request',{id,command}).catch(reject);
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT') reject(fault(503,'Canal de atendimento indisponível.'));
      });
    });
  } finally {clearTimeout(timer); await bus.close();}
}
