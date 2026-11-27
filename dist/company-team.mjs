async function request(body){
  const headers={Authorization:'Bearer '+await AtendaAuth.access()};
  if(body)headers['Content-Type']='application/json';
  const r=await fetch('/api/workspace?action=agents',{method:body?'POST':'GET',headers,
    body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await r.json();
  if(!r.ok)throw Object.assign(Error(result.error||'Não foi possível carregar a equipe.'),{status:r.status});
  return result;
}

export async function connectTeam(localTeam,importLocal){
  let current;
  for(let attempt=0;attempt<3;attempt++){
    current=await request();
    if(current.team.length&&!importLocal)break;
    try{
      current=await request({mode:importLocal?'import':'seed',rev:current.rev,team:localTeam});break;
    }catch(e){if(e.status!==409||attempt===2)throw e}
  }
  let saving=false;
  return {team:current.team,async save(team){
    if(saving)throw Error('Aguarde a alteração da equipe em andamento.');
    saving=true;
    try{
      current=await request({mode:'save',rev:current.rev,team});
      return current.team;
    }finally{saving=false}
  }};
}
