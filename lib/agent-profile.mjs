const fields=['name','goal','greeting','question','tone','pace','knowledge','handoff','guidelines'];

export function formatAgentProfile(profile){
  const settings=Object.fromEntries(fields.map(key=>[key,String(profile?.[key]||'').slice(0,2000)]));
  const functions=Array.isArray(profile?.functions)?profile.functions.slice(0,5):[];
  if(!functions.length)return JSON.stringify(settings);
  settings.functions=functions.filter(f=>typeof f?.name==='string').map(f=>({
    name:f.name.slice(0,40),goal:String(f.goal||'').slice(0,240),question:String(f.question||'').slice(0,240)
  }));
  return 'Você é um único agente com as funções configuradas abaixo. Identifique qual função atende à necessidade atual e mude de função se o assunto mudar. Use a pergunta da função apenas se ajudar. Aproveite o histórico e não repita a saudação nem perguntas já respondidas. Se a intenção estiver ambígua, peça um detalhe.\n'+JSON.stringify(settings);
}
