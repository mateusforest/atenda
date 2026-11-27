import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handoffs} from './handoffs.mjs';

const {WA_AKG_SESSION, N8N_ATENDA_SECRET, ATENDA_MAIL_TOKEN} = process.env;
if (!WA_AKG_SESSION || !/^[a-f0-9]{64}$/.test(N8N_ATENDA_SECRET||'') || !/^[a-f0-9]{64}$/.test(ATENDA_MAIL_TOKEN||'')) throw Error('Configuração da fila incompleta.');
const source=new DatabaseSync('/source/atendimento.sqlite',{readOnly:true});
const state=new DatabaseSync('/state/notices.sqlite');
source.exec('PRAGMA busy_timeout=3000');
const queue=handoffs(source,state,WA_AKG_SESSION);
const expected=Buffer.from('Bearer '+N8N_ATENDA_SECRET);
async function send(job) {
  const res=await fetch('https://atendadot.com/api/admin?action=handoff-mail',{
    method:'POST', redirect:'error', signal:AbortSignal.timeout(30000),
    headers:{authorization:'Bearer '+ATENDA_MAIL_TOKEN,'content-type':'application/json'},
    body:JSON.stringify({...job,ownerId:source.prepare('SELECT user_id FROM owner WHERE session=?').get(encodeURIComponent(WA_AKG_SESSION))?.user_id})
  });
  const result=await res.json().catch(()=>({}));
  if (!res.ok || result.accepted!==true) {
    throw Object.assign(Error('O portal retornou HTTP '+res.status),{retryable:result.retryable===true});
  }
}
createServer(async (req,res)=>{
  const respond=(code,data)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  const auth=Buffer.from(req.headers.authorization||'');
  if (auth.length!==expected.length || !timingSafeEqual(auth,expected)) return respond(403,{error:'Acesso restrito.'});
  try {
    if (req.method==='GET' && req.url==='/due') {
      const due=queue.due();
      return respond(200,due);
    }
    const match=req.url?.match(/^\/deliver\/([0-9a-f]{64})$/);
    if (req.method==='POST' && match) return respond(200,{status:await queue.deliver(match[1],send)});
    return respond(404,{error:'Operação indisponível.'});
  } catch (error) {
    console.error('Falha na fila de avisos:', error.message.startsWith('O portal retornou HTTP ')?error.message:'verifique a fila persistente.');
    return respond(503,{error:'Falha ao processar a fila.'});
  }
}).listen(8787,'0.0.0.0');
