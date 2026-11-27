export const toneGuide={
  Humanizado:'Acolha a pessoa com linguagem natural e próxima.',
  Profissional:'Use linguagem cordial, objetiva e precisa.',
  Firme:'Dê uma orientação clara e segura, mantendo o respeito.'
};
export const paceGuide={
  Direto:'Vá ao ponto com uma resposta breve e o próximo passo.',
  Calmo:'Explique uma etapa por vez e dê espaço para a pessoa responder.'
};
export function opening(profile){
  return String(profile?.greeting||'').trim().replaceAll('{nome}',()=>String(profile?.name||'').trim());
}
export function questions(value){
  return [...new Set(String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
}
function fold(text){
  return String(text||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export function relevantFact(knowledge,message){
  const ignore=new Set(['qual','quais','como','para','voces','voce','sobre','empresa','gostaria','saber','posso','com','uma','dos','das','que','tem']);
  const synonyms={abre:'horario',abrem:'horario',funcionamento:'horario',horarios:'horario',precos:'preco',custa:'preco',custos:'preco',contato:'telefone'};
  const words=text=>new Set(fold(text).split(' ').filter(w=>w.length>=3&&!ignore.has(w)).map(w=>synonyms[w]||w));
  const request=words(message);
  let best='',score=0;
  for(const line of questions(knowledge)){
    const matches=[...words(line)].filter(w=>request.has(w)).length;
    if(matches>score){best=line;score=matches}
  }
  return best;
}
export function requestsTeam(text,terms){
  const words=' '+fold(text)+' ';
  if(String(terms||'').split(/[,;\n]/).some(t=>{const term=fold(t);return term&&words.includes(' '+term+' ')}))return true;
  const person='(?:(?:um|uma|o|a|sua|seu) )?(?:atendente|humano|humana|pessoa|equipe|operador|operadora|representante|alguem|atendimento humano)';
  const request=new RegExp('\\b(?:(?:falar|conversar|contato|atendimento) com |(?:chame|chama|chamar|quero|preciso de|solicito) |(?:passe|passa|passar|transfira|transfere|transferir|encaminhar|encaminhe)(?: me)? (?:para |pra |pro )?)'+person+'\\b');
  return fold(text).split(/\b(?:mas|porem|agora sim)\b/).some(part=>{
    const phrase=part.trim();
    if(/\bnao (?:quero|preciso|desejo|me transfira|me encaminhe|chame)\b/.test(phrase))return false;
    return /^(?:(?:a |sua )?equipe|atendente|humano|humana|atendimento humano|suporte humano)(?: por favor)?$/.test(phrase)
      || /\b(?:quero|gostaria|preciso|prefiro) que (?:a |sua )?equipe (?:me |nos )?(?:atenda|ajude|oriente|responda|ligue|entre em contato)\b/.test(phrase)
      || request.test(phrase);
  });
}
export function promisesHandoff(text){
  const phrase=fold(text);
  return /\b(?:vou (?:te |lhe |me )?(?:encaminhar|transferir|passar)|encaminhei|transferi)\b.{0,85}\b(?:equipe|atendente|consultor|humano)\b/.test(phrase)
    && !/\b(?:nao|se quiser|se preferir|se voce)\b/.test(phrase);
}
export function openingForGreeting(profile,history){
  if(history.some(m=>m.fromMe))return '';
  const greetings=/^(oi+|ola|bom dia|boa tarde|boa noite|tudo bem|tudo bom|oi tudo bem|ola tudo bem)$/;
  return history.length&&history.every(m=>greetings.test(fold(m.text)))?opening(profile):'';
}
