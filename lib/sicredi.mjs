import {request} from 'node:https';
import {problem} from './subscriptions.mjs';

// Use the product URLs issued together with the mutual TLS certificate.
export function sicredi(env=process.env){
  const base=new URL(env.SICREDI_PIX_BASE_URL.replace(/\/?$/,'/'));
  const tokenUrl=new URL(env.SICREDI_TOKEN_URL);
  for(const url of [base,tokenUrl]){
    if(url.protocol!=='https:'||!url.hostname.endsWith('.sicredi.com.br')||url.username||url.password||url.search||url.hash)
      throw problem(503,'Confira os endereços oficiais da API Pix Sicredi.');
    if(env.BILLING_ENV!=='production'&&url.hostname==='api-pix.sicredi.com.br')
      throw problem(503,'O sandbox requer os endereços de homologação do Sicredi.');
  }
  const tls={cert:Buffer.from(env.SICREDI_CERT_BASE64,'base64'),key:Buffer.from(env.SICREDI_KEY_BASE64,'base64')};
  function send(url,method,headers,body){
    return new Promise((resolve,reject)=>{
      const req=request(url,{...tls,method,headers,signal:AbortSignal.timeout(10000)},res=>{
        const parts=[];let bytes=0;
        res.on('error',reject);
        res.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576)req.destroy(new Error('Resposta Pix muito grande.'));else parts.push(chunk)});
        res.on('end',()=>{
          if(res.statusCode<200||res.statusCode>=300)return reject(Object.assign(problem(502,'Sicredi respondeu HTTP '+res.statusCode+'.'),{bankStatus:res.statusCode}));
          try{const raw=Buffer.concat(parts).toString();resolve(raw?JSON.parse(raw):{})}catch{reject(problem(502,'Resposta Pix inválida.'))}
        });
      });req.on('error',reject);req.end(body);
    });
  }
  let token,expires=0;
  return async(method,path,body)=>{
    if(!token||Date.now()>=expires){
      const credentials=Buffer.from(env.SICREDI_CLIENT_ID+':'+env.SICREDI_CLIENT_SECRET).toString('base64');
      const form=new URLSearchParams({grant_type:'client_credentials',scope:env.SICREDI_PIX_SCOPES||'rec.read rec.write cobr.read cobr.write payloadlocationrec.read payloadlocationrec.write'});
      const auth=await send(tokenUrl,'POST',{Authorization:'Basic '+credentials,'Content-Type':'application/x-www-form-urlencoded'},form.toString());
      if(!auth.access_token)throw problem(502,'O Sicredi não retornou o token de acesso.');
      token=auth.access_token;expires=Date.now()+Math.max(0,Number(auth.expires_in)-30)*1000;
    }
    return send(new URL(path,base),method,{Authorization:'Bearer '+token,'Content-Type':'application/json'},body?JSON.stringify(body):undefined);
  };
}
