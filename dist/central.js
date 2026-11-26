const paths={home:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',chat:'M4 4h16v13H9l-5 4z',agent:'M5 8h14v11H5z M12 4v4 M9 12h.1 M15 12h.1 M9 16h6',channel:'M7 3h10v18H7z M11 17h2',quotes:'M5 3h10l4 4v14H5z M8 11h8 M8 15h6',clock:'M12 3a9 9 0 1 0 .1 0 M12 7v5l3 2'};
const icon=k=>'<svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><path d="'+paths[k]+'"/></svg>';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={home:'Visão geral',chat:'Conversas',agent:'Agentes',channel:'WhatsApp',billing:'Assinatura',panel:'Meu painel',integrations:'Integrações',settings:'Configurações'}, states=['Na fila','Com agente','Com equipe','Concluída'];
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
 ['Personalizado','Defina o objetivo e escreva o roteiro do agente.','Como posso ajudar?','O que você gostaria de acrescentar?']
];
const money=v=>'R$ '+Number(v).toLocaleString('pt-BR');
const oldWorkspace=Boolean(localStorage.getItem(localDataKey));
function makeAgent(model,first=false){
 const m=models[model];
 return {id:crypto.randomUUID(),model,name:m[0],goal:m[1],greeting:m[2],question:m[3],tone:'Humanizado',pace:'Direto',knowledge:'',handoff:'',licensed:first,paused:false};
}
if(!data.team){
 const base=makeAgent(0,true);
 if(oldWorkspace){Object.assign(base,{name:data.name,greeting:data.greeting,paused:!data.enabled,legacy:true})}
 else{data.threads=[]}
 data.team=[base];
 if(oldWorkspace)for(const a of catalog){const state=data.extras[a.id];if(state&&(state.owned||state.requested)){data.team.push({...makeAgent(5),name:a.name,goal:a.description,greeting:a.welcome,question:a.questions.join('\n'),paused:!state.active})}}
 data.workspace=oldWorkspace?'Agência de viagens':'Minha empresa';save();
}
const monthly=(n=data.team.filter(a=>a.licensed).length)=>490+190*Math.max(0,n-1);
function action(label,fn,variant='light'){return '<button type="button" class="btn '+variant+'" onclick="'+fn+'">'+label+'</button>'}
function cmd(fn,id){return fn+'(&quot;'+esc(id)+'&quot;)'}
function findMember(id){return data.team.find(a=>a.id===id)}
function teamPage(){
 return '<div class="heading"><div>'+title('Minha equipe','Configure os agentes que atendem pela sua empresa.')+'</div>'+action('Adicionar agente','chooseModel()','')+'</div><div class="catalog pane">'+data.team.map(a=>'<article class="special"><div class="row"><span class="tile">'+icon('agent')+'</span><span class="tag '+(a.licensed&&!a.paused?'bot':'')+'">'+(a.licensed?(a.paused?'Pausado':'Ativo em teste'):'Rascunho')+'</span></div><small>'+models[a.model][0]+'</small><h2>'+esc(a.name)+'</h2><p>'+esc(a.goal)+'</p><div class="actions">'+action('Configurar',cmd('configure',a.id))+action('Testar',cmd('tryMember',a.id))+(a.licensed?action(a.paused?'Retomar':'Pausar',cmd('toggleMember',a.id)):action('Ativar',cmd('activateDialog',a.id),''))+'</div></article>').join('')+'</div>';
}
function chooseModel(){modal('Adicionar agente','<div class="options">'+models.map((m,i)=>'<button class="option" onclick="newDraft('+i+')"><b>'+m[0]+'</b><small>'+m[1]+'</small></button>').join('')+'</div>')}
function newDraft(i){const a=makeAgent(i);data.team.push(a);save();dialog.close();go('agent');configure(a.id)}
function field(label,key,value,area=false){return '<label class="field">'+label+(area?'<textarea name="'+key+'" maxlength="2000">'+esc(value)+'</textarea>':'<input name="'+key+'" value="'+esc(value)+'" maxlength="240" required>')+'</label>'}
function select(label,key,values,current){return '<label class="field">'+label+'<select name="'+key+'">'+values.map(v=>'<option '+(v===current?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'}
function phrasing(tone,pace,line){const prefix={Humanizado:'Estou aqui para ajudar. ',Profissional:'Olá. ',Firme:'Vamos ao ponto. '};return prefix[tone]+(pace==='Calmo'?'Vamos por partes. ':'')+line}
function configure(id){
 const a=findMember(id);modal('Configurar agente','<form id="memberForm" class="stack">'+field('Nome','name',a.name)+field('Objetivo','goal',a.goal)+field('Abertura da conversa','greeting',a.greeting)+field('Perguntas seguintes · uma por linha','question',a.question,true)+select('Tom de voz','tone',['Humanizado','Profissional','Firme'],a.tone)+select('Ritmo','pace',['Direto','Calmo'],a.pace)+'<output class="preview" id="sample"></output>'+field('Informações da empresa para o atendimento','knowledge',a.knowledge,true)+field('Encaminhar para a equipe ao mencionar · separe por vírgulas','handoff',a.handoff,true)+'<button class="btn">Salvar configuração</button></form>');
 const form=document.querySelector('#memberForm');const sample=()=>document.querySelector('#sample').textContent=phrasing(form.elements.tone.value,form.elements.pace.value,form.elements.greeting.value);sample();form.oninput=sample;form.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form));if(['name','goal','greeting'].some(k=>!v[k].trim()))return;Object.assign(a,v);save();dialog.close();go('agent')};
}
function toggleMember(id){const a=findMember(id);if(a.licensed){a.paused=!a.paused;save();render()}}
function activateDialog(id){const a=findMember(id);if(a.licensed)return;modal('Ativar '+a.name,'<div class="stack"><p>Agente adicional · R$ 190/mês</p><div class="listrow">Mensalidade atual<b>'+money(monthly())+'</b></div><div class="listrow">Após a ativação<b>'+money(monthly(data.team.filter(x=>x.licensed).length+1))+'/mês</b></div><p class="muted">Simulação local de assinatura. Nenhum pagamento será processado.</p>'+action('Confirmar ativação de teste',cmd('licenseMember',id),'')+'</div>')}
function licenseMember(id){const a=findMember(id);a.licensed=true;a.paused=false;save();dialog.close();go('agent')}
function tryMember(id){
 const a=findMember(id);specialist={name:a.name,questions:a.question.split('\n').map(x=>x.trim()).filter(Boolean)};
 trial={id:Math.max(0,...data.threads.map(t=>t.id))+1,name:'Contato de teste',status:1,agentName:a.name,messages:[[1,phrasing(a.tone,a.pace,a.greeting)]]};step=0;
 function draw(){Empresa.bindTrial(draw);modal(a.name,(Empresa.guidelines?'<details><summary>Orientações internas</summary><p>'+esc(Empresa.guidelines)+'</p></details>':'')+Empresa.agentTools(a)+bubbles(trial)+'<form id="trialForm" class="compose"><input name="message" aria-label="Resposta de teste" maxlength="500" required><button class="btn">Enviar</button></form>');document.querySelector('#trialForm').onsubmit=e=>{e.preventDefault();const msg=e.target.elements.message.value.trim();if(!msg)return;trial.messages.push([0,msg]);const words=['humano','atendente humano',...a.handoff.toLowerCase().split(',').map(x=>x.trim()).filter(Boolean)];const handoff=words.some(w=>msg.toLowerCase().includes(w));
 if(!handoff&&Empresa.allowed(a.id).length&&/^(buscar|consultar|cadastrar)\b/i.test(msg)){Empresa.runForm('',a.id,msg.replace(/^\S+\s*/,''),draw,/^cadastrar/i.test(msg)?'write':'read');return}
 const companyAnswer=Empresa.fact(msg);if(!handoff&&companyAnswer){trial.messages.push([1,companyAnswer]);draw();return}
 if(!handoff&&a.knowledge&&/empresa|serviços|produtos|horário/i.test(msg)){trial.messages.push([1,a.knowledge]);draw();return}
 if(!handoff&&step<specialist.questions.length){trial.messages.push([1,specialist.questions[step++]]);draw();return}
 trial.messages.push([1,'Vou encaminhar seu atendimento para a equipe.']);trial.status=0;if(a.legacy){trial.trip=trial.messages.filter(m=>!m[0]).map(m=>m[1]).slice(0,5);trial.stage=0}
 data.threads.unshift(trial);save();inbox(0);openThread(trial.id)}}
 if(a.legacy&&a.question===models[0][3])specialist.questions=questions;draw();
}
function subscription(){const n=data.team.filter(a=>a.licensed).length;
 return title('Assinatura','Simule sua equipe e escolha como implantar a Atenda.')+'<div class="grid pane"><section class="card stack"><h2>Plano da empresa</h2><div class="price">'+money(monthly())+'<small> / mês</small></div><div class="listrow">Portal, 1 número e 1 agente<b>R$ 490</b></div><div class="listrow">'+(n-1)+' adicionais × R$ 190<b>'+money((n-1)*190)+'</b></div><p class="muted">Pausar mantém o agente na assinatura simulada. Rascunhos são gratuitos.</p>'+action('Gerenciar agentes',"go(&quot;agent&quot;)")+data.team.filter((a,i)=>i&&a.licensed).map(a=>action('Remover '+esc(a.name)+' do plano',cmd('removeDialog',a.id))).join('')+'</section><section class="card stack"><span class="tile">'+icon('support')+'</span><h2>Projeto personalizado</h2><p>Implantação a partir de <b>R$ 3.900</b> para até dois agentes, além da mensalidade.</p><p class="muted">Inclui configuração, testes, treinamento e 30 dias de acompanhamento. Equipes maiores e integrações recebem orçamento por escopo.</p>'+action(data.project?'Ver solicitação':'Solicitar implantação','projectDialog()','')+'</section></div>'}
function removeDialog(id){const a=findMember(id);if(a===data.team[0]||!a.licensed)return;modal('Remover agente do plano','<div class="stack"><p>'+esc(a.name)+' voltará para rascunho. Próxima mensalidade simulada: <b>'+money(monthly()-190)+'</b>.</p>'+action('Confirmar remoção',cmd('removeLicense',id),'')+'</div>')}
function removeLicense(id){const a=findMember(id);if(a!==data.team[0]){a.licensed=false;a.paused=true;save()}dialog.close();go('billing')}
function projectDialog(){const p=data.project||{};modal('Projeto personalizado','<form id="projectForm" class="stack">'+field('Empresa','company',p.company||data.workspace)+field('Quantidade de agentes','size',p.size||'2').replace('maxlength="240"','type="number" min="1" max="999"')+field('O que sua equipe precisa automatizar?','scope',p.scope||'',true)+'<p class="muted">Solicitação de demonstração salva neste navegador. O orçamento depende do escopo.</p><button class="btn">Salvar solicitação</button></form>');document.querySelector('#projectForm').onsubmit=e=>{e.preventDefault();data.project=Object.fromEntries(new FormData(e.target));data.workspace=data.project.company;save();dialog.close();go('billing')}}

function go(p){page=p;render()}
function nav(){if(data.threads.some(t=>t.trip))labels.quotes="Cotações";Object.assign(paths,{billing:paths.quotes,panel:'M3 5h18v14H3z M9 5v14 M9 10h12',integrations:'M3 9h6v6H3z M15 3h6v6h-6z M15 15h6v6h-6z M9 12h3V6h3 M12 12v6h3',settings:'M3 6h18 M3 12h18 M3 18h18 M7 3v6 M16 9v6 M9 15v6'});document.querySelector('#nav').innerHTML=Object.entries(labels).map(([k,v])=>'<button class="sidebtn '+((page==='setup'?'agent':page)===k?'on':'')+'" onclick="go(\''+k+'\')">'+icon(k)+v+'</button>').join('')}
function title(h,p){return '<h1>'+h+'</h1><p class="sub">'+p+'</p>'}
function badge(s){return '<span class="tag '+(['wait','bot','',''][s])+'">'+states[s]+'</span>'}
function contact(t){return '<button class="contact" onclick="openThread('+t.id+')"><span class="avatar a'+t.id%3+'">'+esc(t.name.split(' ').map(s=>s[0]).slice(0,2).join(''))+'</span><span class="info"><b>'+esc(t.name)+'</b><small>'+esc(t.messages.at(-1)[1])+'</small></span>'+badge(t.status)+'</button>'}
function count(s){return data.threads.filter(t=>t.status===s).length}
function inbox(s=-1){filter=s;search='';go('chat')}
function home(){return title('Central de atendimento','Acompanhe as conversas e organize o trabalho da equipe.')+'<section class="hero"><h2>Sua equipe de agentes</h2><p>'+data.team.filter(a=>a.licensed&&!a.paused).length+' em teste · Atendimento, vendas e suporte.</p><button class="btn mint" onclick="go(\'agent\')">Adicionar agente</button></section><div class="metrics">'+[[0,'Aguardando equipe','clock'],[1,'Com o agente','agent'],[2,'Em atendimento','chat']].map(([s,n,i])=>'<button class="stat" onclick="inbox('+s+')">'+icon(i)+'<span>'+n+'</span><strong>'+String(count(s)).padStart(2,'0')+'</strong></button>').join('')+'</div><div class="grid"><section class="card"><div class="cardhead"><h2>Conversas recentes</h2><button class="link" onclick="inbox()">Ver todas</button></div>'+(data.threads.slice(0,4).map(contact).join('')||'<p class="muted">Teste um agente para criar a primeira conversa.</p>')+'</section><section class="card"><div class="cardhead"><h2>Atendimento inicial</h2>'+icon('agent')+'</div><p><b>'+esc(data.team[0].name)+'</b></p><p class="muted">Primeiro contato com o cliente</p><div class="listrow">Modo de teste<b>'+(data.team[0].paused?'Pausado':'Ativo')+'</b></div><div class="listrow">Canal<button class="link" onclick="go(&quot;channel&quot;)">Ver conexão</button></div><p style="margin-top:18px"><button class="btn light" onclick="go(\'agent\')">Gerenciar equipe</button></p></section></div>'}
function list(){const q=search.toLocaleLowerCase('pt-BR');const rows=data.threads.filter(t=>(filter<0||t.status===filter)&&t.name.toLocaleLowerCase('pt-BR').includes(q));document.querySelector('#rows').innerHTML=rows.map(contact).join('')||'<p class="muted">Nenhuma conversa encontrada.</p>'}
function chats(){return title('Conversas','Abra um atendimento para consultar o histórico ou responder.')+'<section class="card pane"><input aria-label="Buscar contato" placeholder="Buscar contato" id="search" oninput="search=this.value;list()"><div class="tabs">'+['Todas',...states].map((n,i)=>'<button class="'+(filter===i-1?'sel':'')+'" onclick="inbox('+(i-1)+')">'+n+'</button>').join('')+'</div><div id="rows"></div></section>'}
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
 setTimeout(()=>checkChannel(false),0);
 return title('WhatsApp','Vincule o número da empresa à sessão WA-AKG.')+'<section class="card stack pane"><h2>Conexão do número</h2><div id="waState" role="status">Consultando sessão…</div><div id="waActions"></div></section>';
}
let waSequence=0;
async function checkChannel(create){
 const slot=document.querySelector('#waState'),actions=document.querySelector('#waActions');
 if(!slot||!actions)return;
 const seq=++waSequence;actions.replaceChildren();slot.textContent='Consultando sessão…';
 if(location.protocol==='file:'){slot.textContent='Abra a Atenda pelo servidor para vincular o número.';return}
 try{
 const r=await fetch('/api/whatsapp',{method:create?'POST':'GET',headers:{'X-Atenda-Panel':'1'},cache:'no-store',signal:AbortSignal.timeout(22000)});
 if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('O pareamento está disponível na versão com servidor.');
 const result=await r.json();if(result.setup){if(!slot.isConnected||seq!==waSequence)return;slot.textContent=result.error;actions.innerHTML='<a class="btn light" target="_blank" rel="noopener" href="https://vercel.com/mateus-maraschin-forests-projects/atenda/settings/environment-variables">Configurar instância WA-AKG</a> '+action('Verificar conexão','checkChannel(false)');return}if(!r.ok)throw Error(result.error||'Consulta indisponível.');
 if(!slot.isConnected||seq!==waSequence)return;
 const messages={missing:'A sessão ainda não foi criada.',connected:'WhatsApp conectado.',waiting:'Aguardando QR Code do gateway.',pairing:'No celular, abra Aparelhos conectados e escaneie o QR Code.'};
 slot.textContent=messages[result.state]||'Estado desconhecido.';
 if(result.state==='pairing'){const img=document.createElement('img');img.src=result.qr;img.alt='QR Code de pareamento';img.width=240;slot.append(document.createElement('br'),img)}
 if(['pairing','waiting'].includes(result.state))setTimeout(()=>{if(slot.isConnected&&seq===waSequence)checkChannel(false)},5000);
 if(result.state==='connected'){actions.innerHTML=action('Configurar resposta automática','replySetup()','');return}
 actions.innerHTML=result.state==='missing'?action('Gerar QR Code','checkChannel(true)',''):action('Atualizar','checkChannel(false)');
 }catch(e){if(slot.isConnected&&seq===waSequence){slot.textContent=e.message;actions.innerHTML=action('Tentar novamente','checkChannel(false)')}}
}
function render(){document.querySelector(".bar strong").textContent=Empresa.company||data.workspace;document.querySelector(".bar .badge").textContent=Empresa.privatePage?(Empresa.logged?"Área privada":"Acesso por conta"):"Demonstração";nav();document.querySelector('#app').innerHTML=({home,chat:chats,agent:teamPage,billing:subscription,setup:agent,channel,quotes,settings:Empresa.settings,integrations:Empresa.integrations,panel:Empresa.panel})[page]();if(page==='chat'){document.querySelector('#search').value=search;list()}if(page==='setup')agentForm.onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),name=f.get('name').trim(),greeting=f.get('greeting').trim();if(!name||!greeting){notice.textContent='Preencha os dois campos.';return}Object.assign(data,{name,greeting,enabled:f.has('enabled')});save();notice.textContent='Ajustes salvos.'}}
function modal(title,html){dt.textContent=title;dc.innerHTML=html;if(!dialog.open)dialog.showModal();const b=dc.querySelector('.bubbles');if(b)b.scrollTop=b.scrollHeight}
function bubbles(t){return '<div class="bubbles">'+t.messages.map(([out,msg])=>'<div class="bubble '+(out?'out':'')+'">'+esc(msg)+'</div>').join('')+'</div>'}
function openThread(id){current=id;const t=data.threads.find(x=>x.id===id);modal(t.name,badge(t.status)+(t.agentName?' <span class="badge">'+esc(t.agentName)+'</span>':'')+(t.trip?'<button class="link" onclick="editQuote('+id+')">Ficha da viagem</button>':'')+bubbles(t)+(t.status===2?'<form class="compose" id="compose"><input name="text" maxlength="2000" required aria-label="Sua resposta" placeholder="Escreva uma resposta…"><button class="btn">Enviar</button></form><p style="margin-top:12px"><button class="link" onclick="statusTo(3)">Concluir atendimento</button></p>':'<button class="btn" onclick="statusTo(2)">'+(t.status===3?'Reabrir conversa':'Assumir atendimento')+'</button>'));const form=dc.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();const v=form.elements.text.value.trim();if(v){t.messages.push([1,v]);save();render();openThread(id)}}}
function statusTo(s){data.threads.find(x=>x.id===current).status=s;save();render();openThread(current)}
const questions=['Quais são as datas previstas para a viagem?','De qual cidade vocês vão sair?','Quantos adultos e crianças vão viajar?','Qual orçamento aproximado você gostaria de considerar?'];
let trial,step,specialist;
function startTest(id){specialist=catalog.find(a=>a.id===id);if(specialist&&!data.extras[id]?.active)return;if(!specialist&&!data.enabled){notice.textContent='Ative o agente e salve para testar.';return}trial={id:Math.max(...data.threads.map(t=>t.id))+1,name:'Viajante de teste',status:1,agentName:specialist?.name||data.name,messages:[[1,specialist?.welcome||data.greeting]]};step=0;testView()}
function testView(){modal(trial.agentName,bubbles(trial)+'<form class="compose" id="testform"><input required maxlength="500" name="text" placeholder="Responda como viajante" aria-label="Resposta do viajante"><button class="btn">Enviar</button></form>');testform.onsubmit=e=>{e.preventDefault();const v=testform.elements.text.value.trim();if(!v)return;trial.messages.push([0,v]);const script=specialist?.questions||questions;if(step===script.length||/\b(humano|atendente|consultor)\b/i.test(v)){trial.messages.push([1,'Vou encaminhar seu atendimento para um consultor da agência.']);if(!specialist){trial.trip=trial.messages.filter(([out])=>!out).map(([,msg])=>msg);if(/\b(humano|atendente|consultor)\b/i.test(v))trial.trip.pop();trial.stage=0}trial.status=0;data.threads.unshift(trial);save();inbox(0);openThread(trial.id);return}trial.messages.push([1,script[step++]]);testView()}}
render();Empresa.init();

;
(()=>{
const dock=document.querySelector('.dot-shell'), log=dock.querySelector('.dot-log'), chips=dock.querySelector('.dot-chips'), form=dock.querySelector('form'), input=form.querySelector('input'), toggle=dock.querySelector('.dot-toggle');
const shortcuts={settings:['Informações da empresa','Pagamentos'],panel:['Onde estão meus leads?','Ver documentos'],integrations:['Conectar API externa'],home:['Como está a fila?','Testar agente','Conectar WhatsApp'],chat:['Quem está esperando?','Resumo da fila'],agent:['Testar agente','Criar agente'],setup:['Configurar agente','Testar agente'],channel:['Como parear?','Resposta automática'],billing:['Qual a mensalidade?','Ver equipe'],quotes:['Ver cotações','Resumo da fila']};
const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const currentPage=()=>page==='setup'?'Configurar agente':labels[page]||'Visão geral';
let previous='';
function suggest(){chips.replaceChildren();for(const label of shortcuts[page]||shortcuts.home){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>ask(label);chips.append(b)}}
new MutationObserver(suggest).observe(document.getElementById('app'),{childList:true});
function line(text,user=false,action){const item=document.createElement('div');item.className='dot-line'+(user?' dot-user':'');item.textContent=text;
 if(action){const b=document.createElement('button');b.type='button';b.className='dot-link';b.textContent=action[0];b.onclick=()=>{action[1]();if(!dialog.open){const target=document.getElementById('app');target.scrollIntoView({block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true})}};item.append(b)}
 log.append(item);while(log.children.length>70)log.firstChild.remove();log.scrollTop=log.scrollHeight}
function answer(topic){const team=data.team, n=count(0), first=team.find(a=>a.licensed&&!a.paused)||team[0];const summary=n===0?'A fila de espera está vazia.':n===1?'Uma conversa aguarda a equipe.':n+' conversas aguardam a equipe.';
 switch(topic){
 case 'settings':return ['Em Configurações você edita a empresa, o perfil e os dados de faturamento.',['Abrir configurações',()=>go('settings')]];
 case 'panel':return ['No Meu painel você encontra leads, clientes, documentos, tarefas e pagamentos.',['Abrir meu painel',()=>go('panel')]];
 case 'integrations':return ['Cadastre os endpoints do portal e escolha quem pode consultar ou enviar cadastros.',['Abrir integrações',()=>go('integrations')]];
 case 'wait':return [summary+(n?' Abra a fila e escolha um contato para assumir o atendimento.':' Você pode conferir os demais atendimentos em Conversas.'),n?['Abrir fila de espera',()=>inbox(0)]:['Ver conversas',()=>inbox()]];
 case 'summary':return [summary+' Com agente: '+count(1)+'. Com a equipe: '+count(2)+'. Concluídas: '+count(3)+'.',['Ver todas as conversas',()=>inbox()]];
 case 'test':return first?['Podemos testar '+first.name+'. Responda como cliente para conferir a abertura e as perguntas seguintes.',['Testar '+first.name,()=>tryMember(first.id)]]:['Adicione um agente para começar.',['Adicionar agente',chooseModel]];
 case 'new':return ['Escolha o tipo de agente e personalize o nome, o objetivo e a primeira mensagem.',['Escolher tipo de agente',chooseModel]];
 case 'team':return ['Sua equipe tem '+team.length+' agente(s), com '+team.filter(a=>a.licensed&&!a.paused).length+' ativo(s) em teste. Em Configurar, você pode ajustar as perguntas e o tom de voz.',['Gerenciar agentes',()=>go('agent')]];
 case 'auto':return ['Abra WhatsApp e confira a conexão. Com o número conectado, escolha Configurar resposta automática e defina a palavra que inicia a resposta.',['Consultar conexão',()=>go('channel')]];
 case 'wa':return ['Abra WhatsApp para consultar a sessão. Se o portal oferecer Gerar QR Code, clique e escaneie pelo menu Aparelhos conectados do telefone.',['Abrir WhatsApp',()=>go('channel')]];
 case 'plan':return ['A mensalidade simulada desta equipe é '+money(monthly())+'. Em Assinatura você pode conferir a composição do plano.',['Ver assinatura',()=>go('billing')]];
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
function ask(message){const value=message.trim();if(!value)return;line(value,true);input.value='';previous=route(fold(value));const [text,action]=answer(previous);line(text,false,action)}
form.onsubmit=e=>{e.preventDefault();ask(input.value)};
toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));document.getElementById('dot-body').hidden=!open;document.body.classList.toggle('dot-expanded',open);toggle.querySelector('.dot-sign').textContent=open?'−':'+'};
document.body.classList.add('dot-expanded');line('Oi, eu sou o Dot. Quer saber quem está esperando ou testar um agente comigo?');suggest();
})();
