import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {open,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fault} from '../lib/wa-transport.mjs';

const run=promisify(execFile);
const script=fileURLToPath(new URL('./transcrever.py',import.meta.url));
const chunkSize=64000, maxBytes=16*1024*1024;

export function voiceService(db, sessionId) {
  db.exec('create table if not exists voice_notes(session text,jid text,message text,transcript text,issue text,updated integer,primary key(session,jid,message))');
  db.prepare('delete from voice_notes where updated < ?').run(Date.now()-7*86400000);
  const pending=new Set();
  const record=db.prepare('select transcript,issue from voice_notes where session=? and jid=? and message=?');
  const save=db.prepare('insert or replace into voice_notes values(?,?,?,?,?,?)');
  function state(jid,row) {
    return record.get(sessionId,jid,row.keyId) || {pending:pending.has(JSON.stringify([jid,row.keyId]))};
  }
  async function media(row) {
    const filename=row.mediaUrl?.match(/^\/api\/media\/([a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,10})$/)?.[1];
    const expected=sessionId.replace(/[^a-zA-Z0-9_-]/g,'')+'-'+row.keyId.replace(/[^a-zA-Z0-9_-]/g,'')+'.';
    if(row.type!=='AUDIO'||!filename?.startsWith(expected))throw fault(404,'O gateway não possui o arquivo deste áudio.');
    const path=join(process.env.LOCALAPPDATA,'Atenda','WhatsApp-1','app','data','media',filename);
    const info=await stat(path).catch(()=>null);
    if(!info?.isFile())throw fault(404,'Arquivo de áudio indisponível neste Windows.');
    if(info.size>maxBytes)throw fault(413,'O áudio excede o limite de 16 MB.');
    return {path,size:info.size};
  }
  async function chunk(row,offset) {
    const {path,size}=await media(row);
    if(!Number.isSafeInteger(offset)||offset<0||offset>=size)throw fault(400,'Posição de áudio inválida.');
    const file=await open(path,'r');
    try {
      const bytes=Buffer.alloc(Math.min(chunkSize,size-offset));
      const {bytesRead}=await file.read(bytes,0,bytes.length,offset);
      if(!bytesRead)throw fault(409,'O arquivo de áudio foi alterado.');
      return {bytes:bytes.subarray(0,bytesRead).toString('base64'),size};
    }finally{await file.close()}
  }
  function start(jid,row,retry=false) {
    const key=JSON.stringify([jid,row.keyId]), cached=state(jid,row);
    if(cached.transcript || cached.issue&&!retry || pending.has(key))return cached;
    if(pending.size)throw fault(429,'Outro áudio está em transcrição.');
    pending.add(key);
    if(cached.issue)db.prepare('delete from voice_notes where session=? and jid=? and message=?').run(sessionId,jid,row.keyId);
    (async()=>{
      try{
        const {path}=await media(row);
        const python=join(process.env.LOCALAPPDATA,'Atenda','voz-venv','Scripts','python.exe');
        const {stdout}=await run(python,[script,path],{windowsHide:true,timeout:240000,maxBuffer:131072});
        save.run(sessionId,jid,row.keyId,stdout.trim(),null,Date.now());
      }catch(e){
        const issue=e.status?e.message:e.code===2?'Formato inválido ou áudio acima de 15 minutos.':e.code===3?'Nenhuma fala identificada.':'Não foi possível transcrever o áudio no Windows.';
        save.run(sessionId,jid,row.keyId,null,issue,Date.now());
      }finally{pending.delete(key)}
    })();
    return {pending:true};
  }
  return {state,chunk,start};
}
