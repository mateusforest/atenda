import {createHmac,timingSafeEqual} from 'node:crypto';
export const officialSession='atenda-suporte-oficial';
export function workerToken(purpose='atenda-official-delivery-v1'){
  const key=process.env.WA_BRIDGE_SECRET;
  if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('Credencial do conector indisponível.');
  return createHmac('sha256',Buffer.from(key,'hex')).update(purpose).digest('hex');
}
export function isWorker(header,purpose){
  const want=Buffer.from('Bearer '+workerToken(purpose)),got=Buffer.from(header||'');
  return want.length===got.length&&timingSafeEqual(want,got);
}
