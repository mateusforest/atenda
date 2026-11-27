import {createHmac,timingSafeEqual} from 'node:crypto';
export const officialSession='atenda-suporte-oficial';
export function workerToken(){
  const key=process.env.WA_BRIDGE_SECRET;
  if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('Credencial do conector indisponível.');
  return createHmac('sha256',Buffer.from(key,'hex')).update('atenda-official-delivery-v1').digest('hex');
}
export function isWorker(header){
  const want=Buffer.from('Bearer '+workerToken()),got=Buffer.from(header||'');
  return want.length===got.length&&timingSafeEqual(want,got);
}
