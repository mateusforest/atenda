// A service record contains the customer's request. Original messages stay in the inbox.
export function requestSummary(value,name=''){
  const lines=new Set();
  for(const raw of String(value||'').split(/\r?\n/)){
    const line=raw.replace(/https?:\/\/\S+/gi,'').trim();
    const folded=line.toLocaleLowerCase('pt-BR').replace(/[.!?]+$/u,'').trim();
    if(!folded||folded===String(name||'').toLocaleLowerCase('pt-BR')||/^(?:oi+|ol[áa]|opa|bom dia|boa tarde|boa noite|ok|obrigad[oa]|valeu|\[mídia\]|\[áudio\])$/u.test(folded))continue;
    lines.add(line);
  }
  return [...lines].slice(-15).join('\n').slice(0,2400);
}
