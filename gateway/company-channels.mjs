import {fault,uuid} from '../lib/wa-transport.mjs';
import {receiver} from './receiver.mjs';
import {automaticAgent} from './automatic.mjs';
import {serviceRecords} from './service-records.mjs';
import {voiceService} from './voice.mjs';

export function companyChannels({db,gateway,legacySession,legacyEmail,official}){
  db.exec('CREATE TABLE IF NOT EXISTS company_channels (owner_id TEXT PRIMARY KEY, session TEXT UNIQUE NOT NULL, email TEXT NOT NULL)');
  const channels=new Map();
  function open(sessionId,email,ownerId){
    const session=encodeURIComponent(sessionId);
    const voice=voiceService(db,sessionId);
    const automatic=automaticAgent({db,gateway,sessionId,ownerId,execute:cmd=>execute(cmd)});
    const execute=receiver({db,gateway,session,sessionId,ownerEmail:email,ownerId,automatic,voice,
      official:sessionId===legacySession?official:undefined,crmIssue:()=>crm.issue()});
    const crm=serviceRecords({db,gateway,sessionId,ownerId,ownerEmail:email,voice});
    const channel={execute,automatic,crm};
    channels.set(sessionId,channel);
    return channel;
  }
  const legacy=open(legacySession,legacyEmail);
  for(const row of db.prepare('SELECT * FROM company_channels').all())
    open(row.session,row.email,row.owner_id);
  async function execute(cmd){
    if(cmd.op==='health')return legacy.execute(cmd);
    const owner=cmd.owner;
    if(!uuid.test(owner?.id)||typeof owner.email!=='string'||!owner.email)throw fault(403,'Empresa inválida.');
    if(owner.email.toLowerCase()===legacyEmail.toLowerCase())return legacy.execute(cmd);
    if(['official','metaSnapshot'].includes(cmd.op))throw fault(403,'Canal administrativo restrito.');
    const sessionId='empresa-'+owner.id.toLowerCase();
    if(sessionId===legacySession)throw fault(409,'Conflito de sessão.');
    let channel=channels.get(sessionId);
    if(!channel){
      if(cmd.op==='status')return {state:'offline',canPair:true};
      if(cmd.op==='pairing')return {state:'missing'};
      if(cmd.op==='chats')return {chats:[],more:false,counts:{total:0,waiting:0,answered:0}};
      if(cmd.op==='automatic'&&cmd.mode==='status')return {enabled:false,agent:null,revision:'',host:'Servidor'};
      if(cmd.op!=='connect')throw fault(409,'Conecte o WhatsApp desta empresa.');
      db.prepare('INSERT INTO company_channels(owner_id,session,email) VALUES(?,?,?)').run(owner.id,sessionId,owner.email);
      channel=open(sessionId,owner.email,owner.id);
    }
    return channel.execute(cmd);
  }
  return {execute,tick(){for(const c of channels.values())void c.automatic.tick()},
    sync(){for(const c of channels.values())void c.crm.sync()}};
}
