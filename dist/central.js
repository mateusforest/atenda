const paths={home:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',chat:'M4 4h16v13H9l-5 4z',agent:'M5 8h14v11H5z M12 4v4 M9 12h.1 M15 12h.1 M9 16h6',channel:'M7 3h10v18H7z M11 17h2',quotes:'M5 3h10l4 4v14H5z M8 11h8 M8 15h6',clock:'M12 3a9 9 0 1 0 .1 0 M12 7v5l3 2'};
const icon=k=>'<svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><path d="'+paths[k]+'"/></svg>';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={home:'Visão geral',chat:'Conversas',agent:'Agentes',channel:'WhatsApp',panel:'Meu painel',integrations:'Integrações',settings:'Configurações'}, states=['Na fila','Com agente','Com equipe','Concluída'];
const initial=[['Marina Costa','Gostaria de uma cotação para Gramado.',0],['Rafael Lima','Vamos em dois adultos e uma criança.',1],['Beatriz Alves','Podemos confirmar as datas?',2],['Lucas Martins','Tem opções para o feriado?',0],['Lívia Rocha','Obrigada pelo atendimento!',3]];
const localDataKey='atenda.v1.'+AtendaAuth.user.id;
let data;try{data=JSON.parse(localStorage.getItem(localDataKey))}catch{}
data??={name:'Assistente de viagens',greeting:'Olá! Para onde você gostaria de viajar?',enabled:true,threads:initial.map(([name,msg,status],id)=>({id,name,status,messages:[[0,msg]]}))};
const save=()=>localStorage.setItem(localDataKey,JSON.stringify(data));let page='home',filter=-1,search='',current=0;
const catalog = [
 {id:'embarque',name:'Pré-embarque',type:'Preparação da viagem',description:'Organiza dúvidas sobre documentos, bagagem e horários antes da partida.',icon:'plane',welcome:'Olá! Qual é o destino e a data do seu embarque?',questions:['Sobre qual documento, bagagem ou horário você precisa de orientação?','Qual é a melhor forma de a equipe retornar?']},
 {id:'suporte',name:'Durante a viagem',type:'Suporte ao viajante',description:'Recebe imprevistos com hospedagem, transporte ou serviços e aciona a equipe.',icon:'support',welcome:'Olá! Em qual cidade você está e o que aconteceu?',questions:['Qual serviço ou reserva foi afetado?','Quando você precisa de retorno da equipe?']},
 {id:'retorno',name:'Pós-viagem',type:'Relacionamento',description:'Coleta a avaliação da experiência e encaminha sugestões para a agência.',icon:'heart',welcome:'Que bom ter você de volta! Como foi sua viagem?',questions:['O que mais gostou ou gostaria que fosse diferente?','Deseja que um consultor entre em contato?']}
];
Object.assign(paths,{plane:'m3 13 18-9-6 17-3-7-9-1z M12 14l9-10',support:'M4 14v-2a8 8 0 0 1 16 0v5a3 3 0 0 1-3 3h-3 M4 12h4v6H4z M16 12h4v6h-4z',heart:'M12 20 4 12C-1 4 8 1 12 7c4-6 13-3 8 5z'});
data.extras??={};
function activeCount(){return Number(data.enabled)+catalog.filter(a=>data.extras[a.id]?.active).length}
function agentCard(a){
 const item=data.extras[a.id]||{},status=item.active?'Ativo em teste':item.owned?'Pausado':item.requested?'Pedido registrado':'Disponível';
 const action=(label,op,style='light')=>'<button class="btn '+style+'" data-id="'+a.id+'" data-op="'+op+'">'+label+'</button>';
 return '<article class="special"><div class="row"><span class="tile '+a.id+'">'+icon(a.icon)+'</span><span class="tag '+(item.active?'bot':'')+'">'+status+'</span></div><small>'+a.type+'</small><h2>'+a.name+'</h2><p>'+a.description+'</p><div class="actions">'+
 (item.active?action('Testar agente','test','')+action('Pausar','pause'):action(item.owned?'Reativar':'Ativar em teste','activate',''))+
 (!item.requested?action('Contratar','order'):action('Ver pedido','order'))+'</div></article>';
}
function marketplace(){
 return title('Equipe de agentes','Escolha quem atende em cada etapa da viagem.')+'<section class="primaryAgent"><span class="tile">'+icon('agent')+'</span><div><small>Atendimento inicial</small><h2>'+esc(data.name)+'</h2></div><span class="tag">'+(data.enabled?'Ativo em teste':'Pausado')+'</span><button class="btn light" onclick="go(&quot;setup&quot;)">Configurar</button></section><div class="cardhead"><h2>Especialistas da agência</h2></div><div class="catalog">'+catalog.map(agentCard).join('')+'</div>';
}
function specialistAction(id,op){
 const a=catalog.find(a=>a.id===id);if(!a)return;
 const item=data.extras[id]??={};
 if(op==='order'){
  if(item.requested){modal('Pedido de contratação','<p><b>'+a.name+'</b></p><p class="sub">Pedido salvo neste navegador em '+esc(new Date(item.requested).toLocaleDateString('pt-BR'))+'. A contratação comercial depende de confirmação da Atenda.</p>');return}
  modal('Contratar '+a.name,'<div class="stack"><p>'+a.description+'</p><p class="muted">Registre seu interesse nesta demonstração. O pedido fica neste navegador, sem envio comercial ou cobrança.</p><button class="btn" data-id="'+id+'" data-op="confirm">Registrar pedido</button></div>');return;
 }
 if(op==='test'){if(item.active)startTest(id);return}
 if(op==='confirm'){item.requested??=new Date().toISOString();dialog.close()}
 else if(op==='activate'){item.owned=true;item.active=true}
 else if(op==='pause'){item.active=false}
 else return;
 save();render();
}
document.addEventListener('click',event=>{const b=event.target.closest('[data-op]');if(b)specialistAction(b.dataset.id,b.dataset.op)});

const models=[
 ['Atendente','Recebe o contato e identifica o motivo da conversa.','Como posso ajudar você hoje?','Que detalhe a equipe precisa saber para atender seu pedido?'],
 ['Consultor','Entende a necessidade e orienta a escolha.','O que você está procurando?','Que características são mais importantes para você?'],
 ['Comercial','Qualifica oportunidades para a equipe de vendas.','Qual produto ou serviço despertou seu interesse?','Qual é o prazo e a faixa de investimento?'],
 ['Suporte','Organiza o problema antes de acionar a equipe.','O que aconteceu?','Quando o problema começou e o que você já tentou?'],
 ['Pós-venda','Acompanha a experiência após a compra.','Como foi sua experiência?','O que poderíamos melhorar?'],
 ['Personalizado','Combine funções em um agente que acompanha toda a conversa.','Como posso ajudar?','O que você gostaria de acrescentar?']
];
const defaultGoals=[
 'Identificar o motivo do contato, responder à dúvida inicial e orientar o próximo passo.',
 'Entender as prioridades do cliente e recomendar uma opção com base nas informações disponíveis.',
 'Entender o que o cliente deseja comprar, qualificar a oportunidade e combinar o próximo passo de vendas.',
 'Identificar o problema, orientar a solução com as informações da empresa e encaminhar os casos que exigem a equipe.',
 'Acompanhar a experiência após a compra, esclarecer dúvidas e registrar o que precisa de acompanhamento.',
 'Identificar a necessidade atual e usar as funções selecionadas para acompanhar o cliente na mesma conversa.'
];
const defaultQuestions=[
 ['Que detalhe a equipe precisa saber para atender seu pedido?','Você tem algum prazo para resolver isso?'],
 ['Que características são mais importantes para você?','Para qual situação você pretende usar a solução?'],
 ['Para quando você precisa da solução?','Qual faixa de investimento você tem em mente?'],
 ['Quando o problema começou?','O que você já tentou fazer?'],
 ['O que atendeu às suas expectativas?','Há algo que você gostaria que a equipe acompanhasse?'],
 ['Qual resultado você espera desse atendimento?','Há algum detalhe importante para o próximo passo?']
];
const serviceRoles=[
 {key:'atendimento',label:'Atendimento',model:0},
 {key:'suporte',label:'Suporte',model:3},
 {key:'consultoria',label:'Consultoria',model:1},
 {key:'comercial',label:'Comercial',model:2},
 {key:'pos-venda',label:'Pós-venda',model:4}
];
const customModel=models.findIndex(([name])=>name==='Personalizado');
function memberRoles(agent){
 if(agent.model!==customModel)return [];
 return serviceRoles.filter(role=>Object.hasOwn(agent.functions||{},role.key)).map(role=>({
   ...role,question:agent.functions[role.key]||defaultQuestions[role.model][0]
 }));
}
function roleEditor(agent){
 const current=memberRoles(agent);
 const choices=serviceRoles.map(role=>{
   const saved=current.find(r=>r.key===role.key);
   return '<div class="member-function"><label><input type="checkbox" name="role" value="'+role.key+'" '+(saved?'checked':'')+'> '+role.label+'</label>'+
    '<label class="field" '+(saved?'':'hidden')+'>Pergunta inicial de '+role.label.toLowerCase()+'<input name="role-'+role.key+'" maxlength="240" value="'+esc(saved?.question||defaultQuestions[role.model][0])+'"></label></div>';
 }).join('');
 return '<fieldset class="member-functions"><legend>Funções deste agente</legend><p class="muted">Escolha as funções que ele pode assumir na mesma conversa. Todas contam como um só agente no plano.</p>'+choices+'</fieldset>';
}
const money=v=>'R$ '+Number(v).toLocaleString('pt-BR');
const oldWorkspace=Boolean(localStorage.getItem(localDataKey));
function makeAgent(model,first=false){
 const m=models[model];
 return {id:crypto.randomUUID(),model,name:m[0],goal:defaultGoals[model],greeting:m[2],question:defaultQuestions[model].join('\n'),tone:'Humanizado',pace:'Direto',knowledge:'',handoff:'',licensed:first,paused:false};
}
if(!data.team){
 const base=makeAgent(0,true);
 if(oldWorkspace){Object.assign(base,{name:data.name,greeting:data.greeting,question:models[0][3],paused:!data.enabled,legacy:true})}
 else{data.threads=[]}
 data.team=[base];
 if(oldWorkspace)for(const a of catalog){const state=data.extras[a.id];if(state&&(state.owned||state.requested)){data.team.push({...makeAgent(5),name:a.name,goal:a.description,greeting:a.welcome,question:a.questions.join('\n'),paused:!state.active})}}
 data.workspace=oldWorkspace?'Agência de viagens':'Minha empresa';save();
}
// Keep previously configured combinations under the model that now owns them.
const previouslyCombined=data.team.filter(a=>a.model!==customModel&&serviceRoles.some(r=>Object.hasOwn(a.functions||{},r.key)));
if(previouslyCombined.length){
 for(const a of previouslyCombined)a.model=customModel;
 save();
}
const monthly=(n=data.team.filter(a=>a.licensed).length)=>490+190*Math.max(0,n-1);
function action(label,fn,variant='light'){return '<button type="button" class="btn '+variant+'" onclick="'+fn+'">'+label+'</button>'}
function cmd(fn,id){return fn+'(&quot;'+esc(id)+'&quot;)'}
function findMember(id){return data.team.find(a=>a.id===id)}
function testAgentAI(id){
 const a=findMember(id),history=[];
 modal('Testar IA · '+a.name,'<div class="bubbles" aria-live="polite"></div><form class="compose"><input aria-label="Mensagem de teste para a IA" maxlength="1500" required placeholder="Escreva como cliente"><button class="btn">Testar resposta</button></form><output role="status"></output>');
 let withTeam=false;
 const form=dc.querySelector('form'), messages=dc.querySelector('.bubbles'), output=dc.querySelector('output');
 function add(fromMe,text){
   history.push({fromMe,text});
   const line=document.createElement('div');line.className='bubble '+(fromMe?'out':'');line.textContent=text;messages.append(line);
 }
 add(true,AgentRules.opening(a));
 form.onsubmit=async e=>{
   e.preventDefault();const input=form.querySelector('input'),button=form.querySelector('button'),question=input.value.trim();
   if(!question||button.disabled||withTeam)return;
   button.disabled=true;input.disabled=true;output.textContent='Consultando o agente…';
   try{
     const result=await agentRequest('trial',{profile:agentProfile(a),history:[...history,{fromMe:false,text:question}].slice(-12)});
     if(!form.isConnected)return;
     add(false,question);add(true,result.text);input.value='';withTeam=!!result.handoff;
     output.textContent=withTeam?'Com a equipe · teste encerrado.':result.model==='gpt-6-luna'?'Resposta do Luna':'Resposta do motor local';messages.scrollTop=messages.scrollHeight;
   }catch(e){output.textContent=e.message}
   finally{input.disabled=withTeam;button.disabled=withTeam;if(form.isConnected&&!withTeam)input.focus()}
 };
}
function teamPage(){
 return '<div class="heading"><div>'+title('Minha equipe','Os agentes compartilham o número da empresa. Em WhatsApp, escolha quem responde automaticamente. Em Conversas, a equipe acompanha e assume os atendimentos.')+'</div>'+action('Adicionar agente','chooseModel()','')+'</div><div class="catalog pane">'+data.team.map(a=>'<article class="special"><div class="row"><span class="tile">'+icon('agent')+'</span><span class="tag '+(a.licensed&&!a.paused?'bot':'')+'">'+(a.licensed?(a.paused?'Pausado':'Ativo em teste'):'Rascunho')+'</span></div><small>'+models[a.model][0]+'</small><h2>'+esc(a.name)+'</h2><p>'+esc(a.goal)+'</p>'+(memberRoles(a).length?'<p class="member-role-summary">'+memberRoles(a).map(r=>r.label).join(' · ')+'</p>':'')+'<div class="actions">'+action('Configurar',cmd('configure',a.id))+action('Testar roteiro',cmd('tryMember',a.id))+action('Testar IA',cmd('testAgentAI',a.id))+(a.licensed?action(a.paused?'Retomar':'Pausar',cmd('toggleMember',a.id)):action('Ativar',cmd('activateDialog',a.id),''))+'</div></article>').join('')+'</div>';
}
function chooseModel(){modal('Adicionar agente','<div class="options">'+models.map((m,i)=>'<button class="option" onclick="newDraft('+i+')"><b>'+m[0]+'</b><small>'+m[1]+'</small></button>').join('')+'</div>')}
function newDraft(i){const a=makeAgent(i);if(i===customModel)a.functions=Object.fromEntries(serviceRoles.slice(0,3).map(r=>[r.key,defaultQuestions[r.model][0]]));data.team.push(a);save();dialog.close();go('agent');configure(a.id)}
function field(label,key,value,area=false){return '<label class="field">'+label+(area?'<textarea name="'+key+'" maxlength="2000">'+esc(value)+'</textarea>':'<input name="'+key+'" value="'+esc(value)+'" maxlength="240" required>')+'</label>'}
function select(label,key,values,current){return '<label class="field">'+label+'<select name="'+key+'" aria-label="'+esc(label)+'">'+values.map(v=>'<option '+(v===current?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'}
function configure(id){
 const a=findMember(id);
 const modelChoice=a.model===customModel?'<div class="field">Modelo <strong>Personalizado</strong></div>':
   select('Modelo','model',[models[a.model][0],models[customModel][0]],models[a.model][0]);
 const modelSettings='<div data-model-settings '+(a.model===customModel?'':'hidden')+'>'+ (a.model===customModel?roleEditor(a):'')+'</div>';
 modal('Configurar agente','<form id="memberForm" class="stack">'+modelChoice+
   field('Nome do agente no portal','name',a.name)+'<small>O WhatsApp usa o perfil do número conectado. Para apresentar o agente, inclua {nome} na abertura.</small>'+
   field('Objetivo do agente','goal',a.goal)+'<button type="button" data-goal class="link">Usar objetivo sugerido do modelo</button>'+modelSettings+
   field('Abertura da conversa','greeting',a.greeting)+'<output class="preview" id="sample" aria-label="Prévia da abertura"></output>'+
   field('Perguntas seguintes · uma por linha','question',a.question,true)+'<small>No roteiro, o agente faz uma pergunta por vez na ordem escrita. A IA usa as que ainda fazem sentido para o pedido.</small>'+
   select('Tom de voz','tone',['Humanizado','Profissional','Firme'],a.tone)+select('Ritmo','pace',['Direto','Calmo'],a.pace)+'<small data-style></small>'+
   field('Informações da empresa para o cliente','knowledge',a.knowledge,true)+
   field('Encaminhar para a equipe ao mencionar · separe por vírgulas','handoff',a.handoff,true)+'<small>No modo automático, o agente verifica as novas mensagens mesmo com o portal fechado. Um pedido de atendimento humano ou um destes termos passa a conversa para a equipe.</small><button class="btn">Salvar configuração</button></form>');
 const form=document.querySelector('#memberForm');
 const sample=()=>{
   form.querySelector('#sample').textContent=AgentRules.opening({name:form.elements.name.value,greeting:form.elements.greeting.value});
   form.querySelector('[data-style]').textContent=AgentRules.toneGuide[form.elements.tone.value]+' '+AgentRules.paceGuide[form.elements.pace.value];
 };
 sample();form.oninput=sample;
 const modelInput=form.elements.namedItem('model');
 const isCustom=()=>a.model===customModel||modelInput?.value===models[customModel][0];
 form.querySelector('[data-goal]').onclick=()=>{form.elements.goal.value=defaultGoals[isCustom()?customModel:a.model]};
 if(modelInput){
   let previous=a.model;
   const settings=form.querySelector('[data-model-settings]');
   modelInput.onchange=()=>{
     const next=isCustom()?customModel:a.model;
     if([models[previous][1],defaultGoals[previous]].includes(form.elements.goal.value))form.elements.goal.value=defaultGoals[next];
     previous=next;
     if(isCustom()&&!settings.firstElementChild){
       const role=serviceRoles.find(r=>r.model===a.model);
       settings.innerHTML=roleEditor({...a,model:customModel,functions:{[role.key]:a.question.split('\n')[0].slice(0,240)}});
     }
     settings.hidden=!isCustom();
   };
 }
 form.onchange=e=>{if(e.target.name==='role')e.target.closest('.member-function').querySelector('.field').hidden=!e.target.checked};
 form.onsubmit=async e=>{e.preventDefault();const values=new FormData(form);
 const v=Object.fromEntries(['name','goal','greeting','question','tone','pace','knowledge','handoff'].map(k=>[k,values.get(k)]));
 if(['name','goal','greeting'].some(k=>!v[k].trim()))return;
 if(isCustom()){
   v.model=customModel;
   v.functions=Object.fromEntries(values.getAll('role').map(key=>[key,values.get('role-'+key).trim()]));
 }
 const submit=form.querySelector('[type=submit]')||form.querySelector('button.btn');if(submit.disabled)return;submit.disabled=true;
 try{await syncPublishedAgent({...a,...v});Object.assign(a,v);save();dialog.close();go('agent')}
 catch(error){let out=form.querySelector('[data-error]');if(!out){out=document.createElement('output');out.dataset.error='';form.append(out)}out.textContent=error.message}
 finally{submit.disabled=false}};
}
async function toggleMember(id){const a=findMember(id);if(a.licensed){try{await syncPublishedAgent({...a,paused:!a.paused});a.paused=!a.paused;save();render()}catch(e){modal('Não foi possível atualizar o agente',esc(e.message))}}}
function activateDialog(id){const a=findMember(id);if(a.licensed)return;modal('Ativar '+a.name,'<div class="stack"><p>Agente adicional no mesmo WhatsApp · R$ 190/mês</p><div class="listrow">Mensalidade atual<b>'+money(monthly())+'</b></div><div class="listrow">Após a ativação<b>'+money(monthly(data.team.filter(x=>x.licensed).length+1))+'/mês</b></div><p class="muted">Simulação local de assinatura. Nenhum pagamento será processado.</p>'+action('Confirmar ativação de teste',cmd('licenseMember',id),'')+'</div>')}
function licenseMember(id){const a=findMember(id);a.licensed=true;a.paused=false;save();dialog.close();go('agent')}
function tryMember(id,roleKey){
 const a=findMember(id),roles=memberRoles(a),role=roles.find(r=>r.key===roleKey);
 if(roles.length&&!role){
   modal('Testar roteiro · '+a.name,'<p class="sub">Escolha a função que quer testar.</p><div class="options"></div>');
   const options=dc.querySelector('.options');
   for(const r of roles){
     const button=document.createElement('button');button.type='button';button.className='option';button.textContent=r.label;button.onclick=()=>tryMember(id,r.key);options.append(button);
   }
   return;
 }
 specialist={name:a.name,questions:AgentRules.questions(a.question)};
 trial={id:Math.max(0,...data.threads.map(t=>t.id))+1,name:'Contato de teste',status:1,agentName:a.name,messages:[[1,AgentRules.opening(a)]]};step=0;
 function draw(){Empresa.bindTrial(draw);modal(a.name,(Empresa.guidelines?'<details><summary>Orientações internas</summary><p>'+esc(Empresa.guidelines)+'</p></details>':'')+Empresa.agentTools(a)+bubbles(trial)+'<form id="trialForm" class="compose"><input name="message" aria-label="Resposta de teste" maxlength="500" required><button class="btn">Enviar</button></form>');document.querySelector('#trialForm').onsubmit=e=>{e.preventDefault();const msg=e.target.elements.message.value.trim();if(!msg)return;trial.messages.push([0,msg]);const handoff=AgentRules.requestsTeam(msg,a.handoff);
 if(!handoff&&Empresa.allowed(a.id).length&&/^(buscar|consultar|cadastrar)\b/i.test(msg)){Empresa.runForm('',a.id,msg.replace(/^\S+\s*/,''),draw,/^cadastrar/i.test(msg)?'write':'read');return}
 const companyAnswer=Empresa.fact(msg);if(!handoff&&companyAnswer){trial.messages.push([1,companyAnswer]);draw();return}
 const detail=AgentRules.relevantFact(a.knowledge,msg);
 if(!handoff&&detail){trial.messages.push([1,detail]);draw();return}
 if(!handoff&&step<specialist.questions.length){trial.messages.push([1,specialist.questions[step++]]);draw();return}
 trial.messages.push([1,'Vou encaminhar seu atendimento para a equipe.']);trial.status=0;if(a.legacy){trial.trip=trial.messages.filter(m=>!m[0]).map(m=>m[1]).slice(0,5);trial.stage=0}
 data.threads.unshift(trial);save();go('agent');openThread(trial.id)}}
 if(a.legacy&&a.question===models[0][3])specialist.questions=questions;
 if(role)specialist.questions=[role.question,...specialist.questions.filter(q=>q!==role.question)];
 draw();
}
function subscription(){const n=data.team.filter(a=>a.licensed).length;
 return '<section class="card stack pane"><h2>Mensalidade da Atenda</h2><a class="btn" href="/checkout">Abrir tela de pagamento</a></section>'+ '<div class="grid pane"><section class="card stack"><h2>Simulador de equipe</h2><div class="price">'+money(monthly())+'<small> / mês</small></div><div class="listrow">Portal, 1 número e 1 agente<b>R$ 490</b></div><div class="listrow">'+(n-1)+' adicionais × R$ 190<b>'+money((n-1)*190)+'</b></div><p class="muted">Várias funções no mesmo agente contam uma vez. Pausar mantém o agente na assinatura simulada. Rascunhos são gratuitos.</p>'+action('Gerenciar agentes',"go(&quot;agent&quot;)")+data.team.filter((a,i)=>i&&a.licensed).map(a=>action('Remover '+esc(a.name)+' do plano',cmd('removeDialog',a.id))).join('')+'</section><section class="card stack"><span class="tile">'+icon('support')+'</span><h2>Projeto personalizado</h2><p>Implantação a partir de <b>R$ 3.900</b> para até dois agentes, além da mensalidade.</p><p class="muted">Inclui configuração, testes, treinamento e 30 dias de acompanhamento. Equipes maiores e integrações recebem orçamento por escopo.</p>'+action(data.project?'Ver solicitação':'Solicitar implantação','projectDialog()','')+'</section></div>'}
function removeDialog(id){const a=findMember(id);if(a===data.team[0]||!a.licensed)return;modal('Remover agente do plano','<div class="stack"><p>'+esc(a.name)+' voltará para rascunho. Próxima mensalidade simulada: <b>'+money(monthly()-190)+'</b>.</p>'+action('Confirmar remoção',cmd('removeLicense',id),'')+'</div>')}
async function removeLicense(id){const a=findMember(id);if(a!==data.team[0]){try{await syncPublishedAgent({...a,licensed:false});a.licensed=false;a.paused=true;save()}catch(e){dialog.close();modal('Não foi possível pausar o agente',esc(e.message));return}}dialog.close();go('billing')}
function projectDialog(){const p=data.project||{};modal('Projeto personalizado','<form id="projectForm" class="stack">'+field('Empresa','company',p.company||data.workspace)+field('Quantidade de agentes','size',p.size||'2').replace('maxlength="240"','type="number" min="1" max="999"')+field('O que sua equipe precisa automatizar?','scope',p.scope||'',true)+'<p class="muted">Solicitação de demonstração salva neste navegador. O orçamento depende do escopo.</p><button class="btn">Salvar solicitação</button></form>');document.querySelector('#projectForm').onsubmit=e=>{e.preventDefault();data.project=Object.fromEntries(new FormData(e.target));data.workspace=data.project.company;save();dialog.close();go('billing')}}

const menuButton = document.querySelector('.mobile-menu');
function setMenu(open) {
  menuButton.setAttribute('aria-expanded', String(open));
}
menuButton.onclick = () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
function go(p) {
  if (p === 'billing') {
    Empresa.selectSubscription();
    p = 'settings';
  }
  page = p;
  setMenu(false);
  render();
  if(page==='panel')Empresa.init();
  window.scrollTo(0, 0);
}
Object.assign(paths, {
  channel: 'M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7a8.5 8.5 0 1 1 16.2-4.1z M8 8c0 4 3.5 7 7 7l1-2-2-1-1 1a7 7 0 0 1-3-3l1-1-1-2z',
  diagonal: 'M6 18 18 6 M7 6h11v11',
  panel: 'M3 5h18v14H3z M9 5v14 M9 10h12',
  integrations: 'M3 9h6v6H3z M15 3h6v6h-6z M15 15h6v6h-6z M9 12h3V6h3 M12 12v6h3',
  settings: 'M3 6h18 M3 12h18 M3 18h18 M7 3v6 M16 9v6 M9 15v6'
});
function nav() {
  if (data.threads.some(thread => thread.trip)) labels.quotes = 'Cotações';
  const current = page === 'setup' ? 'agent' : page;
  document.querySelector('#nav').innerHTML = Object.entries(labels).map(([key, label]) => {
    const indicator = key === 'channel' ? '<wa-session-indicator compact></wa-session-indicator>' : '';
    return `<button type="button" class="sidebtn ${current === key ? 'on' : ''}" ${current === key ? 'aria-current="page"' : ''} onclick="go('${key}')">${icon(key)}<span>${label}</span>${indicator}</button>`;
  }).join('');
}
function title(h,p){return '<h1>'+h+'</h1><p class="sub">'+p+'</p>'}
function badge(s){return '<span class="tag '+(['wait','bot','',''][s])+'">'+states[s]+'</span>'}
function contact(t){return '<button class="contact" onclick="openThread('+t.id+')"><span class="avatar a'+t.id%3+'">'+esc(t.name.split(' ').map(s=>s[0]).slice(0,2).join(''))+'</span><span class="info"><b>'+esc(t.name)+'</b><small>'+esc(t.messages.at(-1)[1])+'</small></span>'+badge(t.status)+'</button>'}
function inbox(s=-1){filter=s;search='';go('chat')}
function openWhatsAppInbox(scope='all',chat=null){
  inbox();
  const panel=document.querySelector('whatsapp-inbox');
  if(chat)panel.select(chat);
  else if(scope!==panel.scope.value){panel.scope.value=scope;panel.changePage(1)}
}
function home() {
  const first = data.team[0];
  const active = data.team.filter(agent => agent.licensed && !agent.paused).length;
  const metrics = [
    ['total', 'Conversas no WhatsApp', 'chat', 'all'],
    ['waiting', 'Aguardando resposta', 'clock', 'waiting'],
    ['answered', 'Respondidas', 'agent', 'answered']
  ];
  return `<section class="home-cover">
    <div class="cover-copy">
      <h1>Central de <em>atendimento.</em></h1>
      <p>Acompanhe as conversas e organize o trabalho da sua equipe.</p>
      <div class="cover-actions"><button class="btn" onclick="openWhatsAppInbox()">Abrir conversas <span aria-hidden="true">→</span></button>
      <button class="link" onclick="chooseModel()">Adicionar agente</button></div>
    </div>
    <button type="button" class="cover-dot" data-open-dot aria-controls="dot-body" aria-label="Conversar com o Dot">
      <span class="orbit-lines" aria-hidden="true"></span><img src="/dot.png" alt="" width="270" height="270">
      <span class="dot-caption">Conversar com o Dot ${icon('diagonal')}</span>
    </button>
  </section>
  <whatsapp-overview>
    <div class="metrics">${metrics.map(([key,label,symbol,scope]) => `<button class="stat" onclick="openWhatsAppInbox('${scope}')"><span class="metric-label">${icon(symbol)}${label}</span><strong data-count="${key}">—</strong></button>`).join('')}</div>
    <div class="grid home-columns">
      <section class="card recent-section"><div class="cardhead"><h2>Conversas recentes</h2><button class="link" onclick="openWhatsAppInbox()">Ver todas <span aria-hidden="true">→</span></button></div>
        <p class="wa-feedback" role="status">Consultando WhatsApp…</p><div class="wa-recent"></div></section>
      <section class="card team-section"><div class="cardhead"><h2>Sua equipe</h2>${icon('agent')}</div>
        <div class="team-first"><span class="tile">${icon('agent')}</span><div><small>Atendimento inicial</small><strong>${esc(first.name)}</strong></div><span class="tag">${first.paused ? 'Pausado' : 'Ativo em teste'}</span></div>
        <div class="listrow">Agentes ativos em teste<b>${active}</b></div>
        <div class="listrow">WhatsApp<button class="link" onclick="go('channel')">Ver conexão</button></div>
        <button class="btn light" onclick="go('agent')">Gerenciar equipe</button>
      </section>
    </div>
  </whatsapp-overview>`;
}

function list(){const q=search.toLocaleLowerCase('pt-BR');const rows=data.threads.filter(t=>(filter<0||t.status===filter)&&t.name.toLocaleLowerCase('pt-BR').includes(q));document.querySelector('#rows').innerHTML=rows.map(contact).join('')||'<p class="muted">Nenhuma conversa encontrada.</p>'}
function chats(){return title('Conversas','Acompanhe os atendimentos do WhatsApp e responda aos clientes.')+'<section class="card stack pane"><whatsapp-inbox></whatsapp-inbox></section>'}
function agent(){return '<button class="link" onclick="go(&quot;agent&quot;)">Equipe de agentes</button>'+title('Configurar agente','Personalize e teste a primeira conversa com um viajante.')+'<form id="agentForm" class="card stack pane" style="max-width:720px"><label class="field">Nome do agente<input name="name" maxlength="64" required value="'+esc(data.name)+'"></label><label class="field">Mensagem de boas-vindas<textarea name="greeting" maxlength="500" required>'+esc(data.greeting)+'</textarea></label><label><input name="enabled" type="checkbox" style="width:auto" '+(data.enabled?'checked':'')+'> Ativar agente de teste</label><div><button class="btn">Salvar ajustes</button> <button type="button" class="btn light" onclick="startTest()">Testar conversa</button></div><span class="msg" id="notice" role="status"></span></form>'}

const tripFields=['Destino','Datas','Origem','Passageiros','Orçamento'];
const stages=['Solicitada','Em cotação','Proposta pronta','Encerrada'];
function quotes(){
 const items=data.threads.filter(t=>t.trip);
 return title('Cotações','Consulte os pedidos coletados pelo agente e acompanhe cada proposta.')+
 '<section class="card pane"><div class="cardhead"><h2>Pedidos de viagem</h2><button class="btn light" onclick="go(&quot;agent&quot;)">Gerenciar agentes</button></div>'+
 (items.length?items.map(t=>'<button class="contact" onclick="editQuote('+t.id+')"><span class="info"><b>'+esc(t.trip[0]||'Destino a definir')+'</b><small>'+esc(t.name)+' · '+esc(t.trip[1]||'Datas em aberto')+'</small></span><span class="badge">'+stages[t.stage||0]+'</span></button>').join(''):'<p class="muted">Os pedidos aparecem aqui quando o agente encaminha a conversa à equipe.</p>')+'</section>';
}
function editQuote(id){
 const t=data.threads.find(row=>row.id===id);
 modal('Ficha da viagem','<form id="quoteForm" class="stack"><span class="muted">'+esc(t.name)+'</span>'+
 tripFields.map((label,i)=>'<label class="field">'+label+'<input name="field'+i+'" maxlength="500" value="'+esc(t.trip[i]||'')+'"></label>').join('')+
 '<label class="field">Etapa<select name="stage">'+stages.map((v,i)=>'<option value="'+i+'" '+(i===(t.stage||0)?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
 '<label class="field">Observações internas<textarea name="notes" maxlength="2000">'+esc(t.notes||'')+'</textarea></label><div><button class="btn">Salvar ficha</button> <button type="button" class="link" onclick="openThread('+id+')">Ver conversa</button></div></form>');
 document.querySelector('#quoteForm').onsubmit=e=>{
 e.preventDefault();const fields=new FormData(e.target);t.trip=tripFields.map((_,i)=>String(fields.get('field'+i)).trim());
 t.stage=Number(fields.get('stage'));t.notes=String(fields.get('notes')).trim();save();dialog.close();go('quotes');
 };
}

function replySetup(){
 modal('Resposta automática no WhatsApp','<form id="liveReply" class="stack"><p>Escolha a palavra que inicia o atendimento em conversas privadas.</p><label class="field">Palavra exata<input name="keyword" required maxlength="80" placeholder="Ex.: orçamento"></label><label class="field">Resposta<textarea name="response" maxlength="2000"></textarea></label><div class="actions"><button class="btn light" value="read">Consultar</button><button class="btn" value="enable">Salvar e ativar</button><button class="btn light" value="disable">Desativar</button></div><output role="status"></output></form>');
 const f=document.querySelector('#liveReply');const out=f.querySelector('output');
 f.onsubmit=async e=>{e.preventDefault();const action=e.submitter.value;const keyword=f.elements.keyword.value.trim(),response=f.elements.response.value.trim();
 if(action==='enable'&&!response){out.textContent='Preencha a resposta.';return}
 for(const b of f.querySelectorAll('button'))b.disabled=true;
 try{const res=await fetch('/api/whatsapp?operation=reply',{method:'POST',headers:{'Content-Type':'application/json','X-Atenda-Panel':'1'},body:JSON.stringify({action,keyword,response})});const d=await res.json();if(!res.ok)throw Error(d.error||'Falha no gateway.');if(action==='read')f.elements.response.value=d.response;out.textContent=d.enabled?'Resposta ativa no gateway.':'Nenhuma resposta ativa para essa palavra.'}catch(err){out.textContent=err.message}finally{for(const b of f.querySelectorAll('button'))b.disabled=false}}
}
function channel(){
 return title('WhatsApp','Acompanhe a conexão do número usado nos atendimentos.')+
   '<section class="card stack pane"><h2>Conexão do número</h2><wa-session-indicator></wa-session-indicator></section><wa-account-profile class="card stack pane"></wa-account-profile><wa-automatic-replies class="card stack pane"></wa-automatic-replies>';
}
document.addEventListener('atenda-reply-setup',replySetup);
function render(){document.querySelector(".bar strong").textContent=Empresa.company||data.workspace;document.querySelector(".bar .badge").textContent=Empresa.privatePage?(Empresa.logged?"Área privada":"Acesso por conta"):(["home","chat","channel"].includes(page)?"Atendimento":"Demonstração");nav();document.querySelector('#app').innerHTML=({home,chat:chats,agent:teamPage,setup:agent,channel,quotes,settings:Empresa.settings,integrations:Empresa.integrations,panel:Empresa.panel})[page]();if(page==='setup')agentForm.onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),name=f.get('name').trim(),greeting=f.get('greeting').trim();if(!name||!greeting){notice.textContent='Preencha os dois campos.';return}Object.assign(data,{name,greeting,enabled:f.has('enabled')});save();notice.textContent='Ajustes salvos.'}}
function modal(title,html){dt.textContent=title;dc.innerHTML=html;if(!dialog.open)dialog.showModal();const b=dc.querySelector('.bubbles');if(b)b.scrollTop=b.scrollHeight}
function bubbles(t){return '<div class="bubbles">'+t.messages.map(([out,msg])=>'<div class="bubble '+(out?'out':'')+'">'+esc(msg)+'</div>').join('')+'</div>'}
function openThread(id){current=id;const t=data.threads.find(x=>x.id===id);modal(t.name,badge(t.status)+(t.agentName?' <span class="badge">'+esc(t.agentName)+'</span>':'')+(t.trip?'<button class="link" onclick="editQuote('+id+')">Ficha da viagem</button>':'')+bubbles(t)+(t.status===2?'<form class="compose" id="compose"><input name="text" maxlength="2000" required aria-label="Sua resposta" placeholder="Escreva uma resposta…"><button class="btn">Enviar</button></form><p style="margin-top:12px"><button class="link" onclick="statusTo(3)">Concluir atendimento</button></p>':'<button class="btn" onclick="statusTo(2)">'+(t.status===3?'Reabrir conversa':'Assumir atendimento')+'</button>'));const form=dc.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();const v=form.elements.text.value.trim();if(v){t.messages.push([1,v]);save();render();openThread(id)}}}
function statusTo(s){data.threads.find(x=>x.id===current).status=s;save();render();openThread(current)}
const questions=['Quais são as datas previstas para a viagem?','De qual cidade vocês vão sair?','Quantos adultos e crianças vão viajar?','Qual orçamento aproximado você gostaria de considerar?'];
let trial,step,specialist;
function startTest(id){specialist=catalog.find(a=>a.id===id);if(specialist&&!data.extras[id]?.active)return;if(!specialist&&!data.enabled){notice.textContent='Ative o agente e salve para testar.';return}trial={id:Math.max(...data.threads.map(t=>t.id))+1,name:'Viajante de teste',status:1,agentName:specialist?.name||data.name,messages:[[1,specialist?.welcome||data.greeting]]};step=0;testView()}
function testView(){modal(trial.agentName,bubbles(trial)+'<form class="compose" id="testform"><input required maxlength="500" name="text" placeholder="Responda como viajante" aria-label="Resposta do viajante"><button class="btn">Enviar</button></form>');testform.onsubmit=e=>{e.preventDefault();const v=testform.elements.text.value.trim();if(!v)return;trial.messages.push([0,v]);const script=specialist?.questions||questions;if(step===script.length||/\b(humano|atendente|consultor)\b/i.test(v)){trial.messages.push([1,'Vou encaminhar seu atendimento para um consultor da agência.']);if(!specialist){trial.trip=trial.messages.filter(([out])=>!out).map(([,msg])=>msg);if(/\b(humano|atendente|consultor)\b/i.test(v))trial.trip.pop();trial.stage=0}trial.status=0;data.threads.unshift(trial);save();go('agent');openThread(trial.id);return}trial.messages.push([1,script[step++]]);testView()}}
if(location.hash==='#assinatura')go('billing');else render();Empresa.init();

;
(()=>{
const dock=document.querySelector('.dot-shell'), log=dock.querySelector('.dot-log'), chips=dock.querySelector('.dot-chips'), form=dock.querySelector('form'), input=form.querySelector('input'), toggle=document.querySelector('.dot-toggle');
const shortcuts={settings:['Informações da empresa','Pagamentos'],panel:['Onde estão meus leads?','Ver documentos'],integrations:['Conectar API externa'],home:['Como está a fila?','Testar agente','Conectar WhatsApp'],chat:['Quem está esperando?','Resumo da fila'],agent:['Testar agente','Criar agente'],setup:['Configurar agente','Testar agente'],channel:['Como parear?','Resposta automática'],billing:['Qual a mensalidade?','Ver equipe'],quotes:['Ver cotações','Resumo da fila']};
const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const currentPage=()=>page==='setup'?'Configurar agente':labels[page]||'Visão geral';
let previous='';
function suggest(){chips.replaceChildren();for(const label of shortcuts[page]||shortcuts.home){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>ask(label);chips.append(b)}}
new MutationObserver(suggest).observe(document.getElementById('app'),{childList:true});
function line(text,user=false,action){const item=document.createElement('div');item.className='dot-line'+(user?' dot-user':'');item.textContent=text;
 if(action){const b=document.createElement('button');b.type='button';b.className='dot-link';b.textContent=action[0];b.onclick=()=>{action[1]();if(!dialog.open){const target=document.getElementById('app');target.scrollIntoView({block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true})}};item.append(b)}
 log.append(item);while(log.children.length>70)log.firstChild.remove();log.scrollTop=log.scrollHeight}
async function answer(topic){const team=data.team, first=team.find(a=>a.licensed&&!a.paused)||team[0];
 if(topic==='wait'||topic==='summary'){
   const {counts}=await whatsappInboxRequest('?view=chats');
   const waiting=counts.waiting===1?'1 conversa aguarda resposta.':counts.waiting+' conversas aguardam resposta.';
   return topic==='wait'?[waiting,['Abrir fila',()=>openWhatsAppInbox('waiting')]]:
     [waiting+' Respondidas: '+counts.answered+'. Total: '+counts.total+'.',['Ver conversas',()=>openWhatsAppInbox()]];
 }
 switch(topic){
 case 'settings':return ['Em Configurações você edita a empresa, o perfil e os dados de faturamento.',['Abrir configurações',()=>go('settings')]];
 case 'panel':return ['No Meu painel você encontra leads, clientes, documentos, tarefas e pagamentos.',['Abrir meu painel',()=>go('panel')]];
 case 'integrations':return ['Cadastre os endpoints do portal e escolha quem pode consultar ou enviar cadastros.',['Abrir integrações',()=>go('integrations')]];
 case 'test':return first?['Podemos testar '+first.name+'. Responda como cliente para conferir a abertura e as perguntas seguintes.',['Testar '+first.name,()=>tryMember(first.id)]]:['Adicione um agente para começar.',['Adicionar agente',chooseModel]];
 case 'new':return ['Escolha o tipo de agente e personalize o nome, o objetivo e a primeira mensagem.',['Escolher tipo de agente',chooseModel]];
 case 'team':return ['Sua equipe tem '+team.length+' agente(s), com '+team.filter(a=>a.licensed&&!a.paused).length+' ativo(s) em teste. Em Configurar, você pode ajustar as perguntas e o tom de voz.',['Gerenciar agentes',()=>go('agent')]];
 case 'auto':return ['Abra WhatsApp, selecione o agente em Respostas automáticas com Luna e ative o atendimento. Configure os termos de encaminhamento na ficha do agente.',['Abrir WhatsApp',()=>go('channel')]];
 case 'wa':return ['Abra WhatsApp para consultar a sessão. Clique em Conectar WhatsApp e escaneie pelo menu Aparelhos conectados do telefone.',['Abrir WhatsApp',()=>go('channel')]];
 case 'plan':return ['A mensalidade simulada desta equipe é '+money(monthly())+'. Em Configurações, na aba Assinatura, você pode conferir a composição do plano.',['Ver assinatura',()=>go('billing')]];
 case 'quotes':return [data.threads.some(t=>t.trip)?'Há fichas de viagem no portal. Abra Cotações para consultar o pedido e atualizar a etapa.':'Ainda não há fichas de viagem neste painel. Elas aparecem quando o agente de viagens encaminha um pedido.',['Ver conversas',()=>inbox()]];
 default:return ['Você está em '+currentPage()+'. Posso consultar a fila, mostrar sua equipe, iniciar um teste ou orientar a conexão do WhatsApp.']
 }}
function route(q){
 if(/integrac|api externa|portal externo/.test(q))return 'integrations';
 if(/faturamento|senha|perfil|informacoes da empresa|configuracoes/.test(q))return 'settings';
 if(/leads?|clientes?|documento|pagamento|meu painel|tarefa/.test(q))return 'panel';
 if(/automatic|palavra.chave/.test(q))return 'auto';
 if(/whats|parear|pareamento|qr|conectar|conexao/.test(q))return 'wa';
 if(/mensal|assinatura|preco|valor|custo|plano/.test(q))return 'plan';
 if(/test|experiment|simular/.test(q))return 'test';
 if(/(criar|adicionar|novo|montar|cadastrar).*(agent|equipe)|novo atendente/.test(q))return 'new';
 if(/agent|equipe|configur|personaliz/.test(q)&&!/fila|aguard|esper|resumo|conversa/.test(q))return 'team';
 if(/resumo|panorama|quant|andamento|conclui|situacao/.test(q))return 'summary';
 if(/fila|aguard|esper|precisa|prioridade|pendente|assum|conversa/.test(q))return 'wait';
 if(/cotac|viagem/.test(q))return 'quotes';
 if(/^(sim|abrir|onde|como assim|me mostra|mostrar|como)[?!. ]*$/.test(q)&&previous)return previous;
 return 'help';
}
async function ask(message){const value=message.trim();if(!value)return;line(value,true);input.value='';previous=route(fold(value));try{const [text,action]=await answer(previous);line(text,false,action)}catch(error){line(error.message,false)}}
form.onsubmit=e=>{e.preventDefault();ask(input.value)};
toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));document.getElementById('dot-body').hidden=!open;document.body.classList.toggle('dot-expanded',open);toggle.querySelector('.dot-sign').textContent=open?'−':'+'};
document.addEventListener('click', event => {
  if (!event.target.closest('[data-open-dot]')) return;
  if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  input.focus();
});
line('Oi, eu sou o Dot. Quer saber quem está esperando ou testar um agente comigo?');suggest();
})();
