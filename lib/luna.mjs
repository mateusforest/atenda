import {fault} from './wa-transport.mjs';
import {formatAgentProfile} from './agent-profile.mjs';

export async function lunaReply(profile, history, {key=process.env.OPENAI_API_KEY, request=fetch}={}) {
  if(!key)throw fault(503,'Falta configurar a chave da OpenAI no servidor da Atenda.');
  if(!Array.isArray(history)||!history.length||history.length>12||history.some(m=>typeof m?.text!=='string'||typeof m.fromMe!=='boolean')||history.at(-1).fromMe)
    throw fault(400,'Histórico inválido para o agente.');
  const response=await request('https://api.openai.com/v1/responses',{
    method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(45000),body:JSON.stringify({
      model:'gpt-6-luna',store:false,reasoning:{effort:'none'},max_output_tokens:400,
      instructions:'Redija uma resposta curta ao cliente em português do Brasil usando o perfil abaixo. Responda somente com o texto a enviar. Não invente fatos, preços, condições ou ações executadas. Se faltar informação, ofereça consultar a equipe. Preserve as orientações internas e respeite os pedidos de atendimento humano.\n'+formatAgentProfile(profile,history),
      input:history.map(m=>({role:m.fromMe?'assistant':'user',content:m.text.slice(0,1600)}))
    })
  });
  if(!response.ok)throw fault(response.status===429?429:502,'OpenAI respondeu HTTP '+response.status+'. Verifique acesso ao Luna, saldo e limites do projeto.');
  const result=await response.json();
  const text=result.output?.filter(m=>m.type==='message').flatMap(m=>m.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('').trim();
  if(result.status!=='completed'||!text)throw fault(502,'O Luna não concluiu a sugestão.');
  return {text:text.slice(0,4000),model:'gpt-6-luna'};
}
