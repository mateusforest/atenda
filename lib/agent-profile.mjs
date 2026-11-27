import {toneGuide,paceGuide,openingForGreeting,requestsTeam,questions} from '../dist/agent-rules.mjs';
import {serviceRoles} from '../dist/agent-models.mjs';
import {fault} from './wa-transport.mjs';

export function trialReply(draft,profile,history){
  if(!Array.isArray(history)||!history.length||history.length>12||history.some(m=>typeof m?.text!=='string'||typeof m.fromMe!=='boolean')||history.at(-1).fromMe)throw fault(400,'Histórico inválido para teste.');
  if(requestsTeam(history.at(-1)?.text,profile?.handoff))return {handoff:true,text:'A equipe vai continuar este atendimento.'};
  const text=openingForGreeting(profile,history);
  return text?{text,model:'roteiro'}:draft(profile,history);
}

export function formatAgentProfile(profile,history=[]){
  const fields=['goal','knowledge','companyFacts','guidelines'];
  const settings=Object.fromEntries(fields.map(key=>[key,String(profile?.[key]||'').slice(0,2000)]));
  const asked=line=>history.some(m=>m?.fromMe&&String(m.text||'').toLowerCase().includes(line.toLowerCase()));
  settings.perguntas=questions(String(profile?.question||'').slice(0,2000)).filter(line=>!asked(line));
  settings.tom=toneGuide[profile?.tone]||toneGuide.Humanizado;
  settings.ritmo=paceGuide[profile?.pace]||paceGuide.Direto;
  if(profile?.needsName)settings.proximaPergunta='Responda ao pedido desta mensagem. Para registrar o atendimento, a única pergunta desta vez deve ser como a pessoa se chama. Se ela já informou o nome, use-o e prossiga. O canal já fornece o contato WhatsApp.';
  const guidance='Responda primeiro à última mensagem. Quando a informação da empresa já traz a solução, dê essa orientação diretamente. Use somente fatos fornecidos sobre a empresa. Se faltar um fato, diga que precisa confirmar. Use o objetivo e as perguntas na ordem configurada quando pertinentes. Faça no máximo uma pergunta por vez e pule as já respondidas. Não cumprimente novamente nem acrescente uma pergunta genérica depois de resolver a dúvida. Aplique o tom e o ritmo. Não assine a mensagem.\n';
  const functions=Array.isArray(profile?.functions)?profile.functions.slice(0,serviceRoles.length):[];
  if(!functions.length)return guidance+JSON.stringify(settings);
  settings.functions=functions.filter(f=>typeof f?.name==='string').map(f=>({
    name:f.name.slice(0,40),goal:String(f.goal||'').slice(0,240),question:String(f.question||'').slice(0,240)
  }));
  return guidance+'Escolha a função adequada à última mensagem. Mude de função quando o assunto mudar. Faça a pergunta da função apenas quando faltar informação para orientar a pessoa.\n'+JSON.stringify(settings);
}
