const Empresa = (() => {
  const baseSections={leads:'Leads', clients:'Clientes', documents:'Documentos', tasks:'Tarefas', payments:'Pagamentos'};
  const singular={leads:'lead',clients:'cliente',documents:'documento',tasks:'tarefa',payments:'pagamento'};
  const stages={leads:['Novo','Em contato','Qualificado','Perdido'],clients:['Ativo','Inativo'],documents:['Vigente','Em revisão','Arquivado'],tasks:['A fazer','Em andamento','Concluída'],payments:['Pendente','Pago','Cancelado']};
  const empty=()=>({profile:{},sections:[],records:[],connections:[]});
  let state=empty(),rev='',email='',section='leads',settingsTab='Empresa',searchText='',loading=false,fault='';
  const allSections=()=>({...baseSections,...Object.fromEntries(state.sections.map(s=>[s.id,s.name]))});
  const isPrivatePage=()=>['panel','settings','integrations'].includes(page);
  const btn=(label,op,id='',primary=false)=>'<button type="button" class="btn '+(primary?'':'light')+'" data-wop="'+esc(op)+'" data-wid="'+esc(id)+'">'+esc(label)+'</button>';
  const tabs=(list,active,op)=>'<div class="ws-tabs">'+Object.entries(list).map(([id,label])=>'<button type="button" aria-pressed="'+(id===active)+'" data-wop="'+op+'" data-wid="'+esc(id)+'">'+esc(label)+'</button>').join('')+'</div>';
  const fld=(label,key,value='',type='text',extra='')=>'<label class="field">'+esc(label)+(type==='area'?'<textarea rows="3" maxlength="3000" name="'+key+'" '+extra+'>'+esc(value||'')+'</textarea>':'<input type="'+type+'" maxlength="'+(key==='secret'?4096:250)+'" name="'+key+'" value="'+esc(value||'')+'" '+extra+'>')+'</label>';
  const sel=(label,key,items,current)=>'<label class="field">'+esc(label)+'<select aria-label="'+esc(label)+'" name="'+key+'">'+Object.entries(items).map(([value,name])=>'<option value="'+esc(value)+'" '+(current===value?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
  const choices=arr=>Object.fromEntries(arr.map(s=>[s,s]));
  const out='<output class="ws-message" role="status"></output>';
  const submit=(label)=>'<div class="ws-buttons"><button class="btn" type="submit">'+esc(label)+'</button></div>'+out;
  const moneyBR=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function progress(form,work){const status=form.querySelector('output');if(form.dataset.busy)return;form.dataset.busy='1';if(status)status.textContent='Aguarde…';
    return Promise.resolve().then(work).catch(e=>{if(status)status.textContent=e.message||'Não foi possível concluir.'}).finally(()=>{delete form.dataset.busy})}
  const auth=AtendaAuth.request,access=AtendaAuth.access,takeSession=AtendaAuth.save;
  async function api(action,value){
    const token=await access();
    const r=await fetch('/api/workspace',{method:action?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:action?JSON.stringify({action,value,rev}):undefined,cache:'no-store'});
    const v=await r.json().catch(()=>({}));if(!AtendaAuth.session||AtendaAuth.session.access_token!==token)throw Error('A sessão mudou. Abra novamente a área da empresa.');if(!r.ok){if(r.status===401){AtendaAuth.clear();location.replace('/login')}throw Error(v.error||'Não foi possível acessar o painel.')}
    if(v.state){state=v.state;rev=v.rev;email=v.email;fault=''}return v;
  }
  async function reload(){if(!AtendaAuth.session){location.replace('/login');return}loading=true;fault='';try{await api()}catch(e){fault=e.message}finally{loading=false;render()}}
  function guest(){return '<section class="card ws-gate"><h2>'+ (loading?'Abrindo sua empresa…':fault?'Acesso ao painel':'Sua área privada')+'</h2><p>'+esc(loading?'Carregando os dados da conta.':fault||'Entre com o e-mail da empresa para acessar seus cadastros, arquivos e integrações.')+'</p>'+(loading?'':AtendaAuth.session?btn('Tentar novamente','reload')+' '+btn('Sair','logout'):btn('Entrar','login','',true)+' '+btn('Criar conta','signup'))+'</section>'}
  function accountForm(signup){location.assign(signup?'/cadastro':'/login')}
  function passwordForm(){modal('Alterar senha','<form class="stack" id="ws-password">'+fld('Senha atual','old','','password','required autocomplete="current-password"')+fld('Nova senha','next','','password','required minlength="8" autocomplete="new-password"')+fld('Confirmar nova senha','confirm','','password','required minlength="8" autocomplete="new-password"')+submit('Alterar senha')+'</form>');
    const f=document.getElementById('ws-password');f.onsubmit=e=>{e.preventDefault();progress(f,async()=>{const v=Object.fromEntries(new FormData(f));if(v.next!==v.confirm)throw Error('As novas senhas precisam coincidir.');
      const result=await auth('token?grant_type=password','POST',{email,password:v.old});takeSession(result);await auth('user','PUT',{password:v.next},AtendaAuth.session.access_token);f.reset();f.querySelector('output').textContent='Senha atualizada.';
    })}}
  function settings(){
    const names=['Empresa','Perfil e acesso','Financeiro','Assinatura'],p=state.profile;
    const header = title('Configurações','Gerencie os dados da empresa, seu acesso e a assinatura.') + tabs(choices(names),settingsTab,'settingsTab');
    if (settingsTab === 'Assinatura') return header + subscription();
    let body='';
    if(settingsTab==='Empresa')body=fld('Nome da empresa','company',p.company,'text','required')+fld('Setor de atuação','sector',p.sector)+fld('Telefone comercial','phone',p.phone,'tel')+fld('Site','website',p.website,'url')+fld('Sobre a empresa · informação para o cliente','about',p.about,'area')+fld('Orientações internas para a equipe e os agentes','guidelines',p.guidelines,'area');
    if(settingsTab==='Perfil e acesso')body=fld('Seu nome','contact',p.contact)+fld('Cargo ou função','role',p.role)+fld('Telefone do perfil','profilePhone',p.profilePhone,'tel')+fld('E-mail de acesso','accountEmail',email,'email','disabled')+'<div class="ws-buttons ws-full">'+btn('Alterar senha','password')+btn('Sair da conta','logout')+'</div>';
    if(settingsTab==='Financeiro')body=fld('CPF ou CNPJ de faturamento','taxId',p.taxId)+fld('E-mail financeiro','billingEmail',p.billingEmail,'email')+fld('Faturamento mensal informado (R$)','revenue',p.revenue,'number','min="0" step=".01"')+sel('Meio de pagamento preferido','paymentMethod',choices(['','Pix','Boleto','Cartão','Transferência']),p.paymentMethod)+'<div class="ws-full">'+btn('Ver pagamentos do painel','payments')+'</div>';
    return header+(email?'<form class="card ws-fields" data-wform="profile">'+body+'<div class="ws-full">'+submit('Salvar alterações')+'</div></form>':guest());
  }
  function recordList(){
    const s=section,q=searchText.trim().toLocaleLowerCase('pt-BR');
    const list=state.records.filter(r=>r.section===s&&[r.name,r.contact,r.email,r.status,r.notes].join(' ').toLocaleLowerCase('pt-BR').includes(q));
    return list.map(r=>'<button class="ws-row" data-wop="editRecord" data-wid="'+esc(r.id)+'"><span><b>'+esc(r.name)+'</b><small>'+esc([r.contact,r.date,r.section==='payments'?moneyBR(r.amount):r.file?.name].filter(Boolean).join(' · '))+'</small></span><span class="badge">'+esc(r.status||'Abrir')+'</span></button>').join('')||'<p class="muted">'+(q?'Nenhum resultado para esta busca.':'Nenhum registro nesta seção.')+'</p>';
  }
  function paymentSummary(){const sums={Pendente:0,Pago:0};for(const r of state.records)if(r.section==='payments'&&Object.hasOwn(sums,r.status))sums[r.status]+=Number(r.amount)||0;return '<div class="ws-totals"><span>Pendente <b>'+esc(moneyBR(sums.Pendente))+'</b></span><span>Pago <b>'+esc(moneyBR(sums.Pago))+'</b></span></div>'}
  function panel(){const names=allSections();if(!names[section])section='leads';
    return title('Meu painel','Leads, clientes, documentos e o que sua empresa precisa acompanhar.')+tabs(names,section,'section')+(email?'<section class="card stack"><div class="heading"><h2>'+esc(names[section])+'</h2><div class="ws-buttons">'+btn('Nova seção','addSection')+btn('Adicionar '+(singular[section]||'registro'),'editRecord','',true)+'</div></div>'+(section==='payments'?paymentSummary():'')+'<input data-wsearch aria-label="Buscar nos registros" placeholder="Buscar nesta seção" value="'+esc(searchText)+'"><div id="ws-rows">'+recordList()+'</div></section>':guest());
  }
  function recordForm(id){const r=state.records.find(r=>r.id===id)||{},s=r.section||section;
    const contact=['clients','leads'].includes(s);
    let fields=fld(s==='payments'?'Descrição do pagamento':'Nome ou título','name',r.name,'text','required')+sel('Situação','status',choices(stages[s]||['Aberto','Em andamento','Concluído']),r.status)+fld(s==='payments'?'Vencimento':'Data','date',r.date,'date');
    if(contact)fields+=fld('Telefone','contact',r.contact,'tel')+fld('E-mail','email',r.email,'email');
    else fields+=sel('Contato relacionado','related',{'':'Sem vínculo',...Object.fromEntries(state.records.filter(x=>['clients','leads'].includes(x.section)).map(x=>[x.id,x.name]))},r.related);
    if(s==='payments')fields+=fld('Valor (R$)','amount',r.amount,'number','required min="0" step=".01"');
    if(s==='documents')fields+=r.file?btn('Baixar '+r.file.name,'download',r.file.id):'<label class="field">Arquivo de até 2 MB<input type="file" name="attachment" required></label>';
    fields+=fld('Observações','notes',r.notes,'area');
    modal((id?'Editar ':'Adicionar ')+(singular[s]||'registro'),'<form class="stack" id="ws-record">'+fields+(s==='leads'&&id?btn('Converter em cliente','convert',id):'')+submit('Salvar')+'</form>');
    const f=document.getElementById('ws-record');f.onsubmit=e=>{e.preventDefault();progress(f,async()=>{
      const value=Object.fromEntries(new FormData(f)),file=value.attachment;delete value.attachment;
      if(file?.size){if(file.size>2*1024*1024)throw Error('O limite é de 2 MB por arquivo.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)});value.upload={name:file.name,data}}
      await api('record',{...value,id,section:s});dialog.close();render();
    })}}
  function addSection(){modal('Nova seção','<form class="stack" id="ws-section">'+fld('Nome da seção','name','','text','required')+submit('Criar seção')+'</form>');const f=document.getElementById('ws-section');
    f.onsubmit=e=>{e.preventDefault();progress(f,async()=>{const name=f.elements.name.value.trim();if(Object.values(allSections()).some(v=>v.toLowerCase()===name.toLowerCase()))throw Error('Escolha outro nome.');await api('section',{name});section=state.sections.at(-1).id;searchText='';dialog.close();render()})}}
  function integrations(){return title('Integrações','Conecte portais externos e escolha quais agentes podem consultar ou cadastrar informações.')+(email?'<section class="card stack pane"><div class="heading"><h2>Portais conectados</h2>'+btn('Adicionar integração','editConn','',true)+'</div>'+ (state.connections.map(c=>'<div class="ws-row"><span><b>'+esc(c.name)+'</b><small>'+(c.enabled?'Habilitada':'Pausada')+' · '+c.readers.length+' com consulta · '+c.writers.length+' com cadastro</small></span><div class="ws-buttons">'+(c.enabled&&(c.readers.length||c.writers.length)?btn('Usar','runConn',c.id):'')+btn('Configurar','editConn',c.id)+'</div></div>').join('')||'<p class="muted">Adicione o endpoint de uma API para começar.</p>')+'</section>':guest())}
  function agents(c={}){return {...c.agentNames,...Object.fromEntries(data.team.map(a=>[a.id,a.name]))}}
  function connForm(id){const c=state.connections.find(x=>x.id===id)||{},names=agents(c);
    const perms=Object.entries(names).map(([id,name])=>'<div class="ws-perm"><b>'+esc(name)+'</b><label><input type="checkbox" name="readers" value="'+esc(id)+'" '+(c.readers?.includes(id)?'checked':'')+'> Consultar</label><label><input type="checkbox" name="writers" value="'+esc(id)+'" '+(c.writers?.includes(id)?'checked':'')+'> Cadastrar</label></div>').join('');
    modal(id?'Configurar integração':'Adicionar integração','<form class="stack" id="ws-conn">'+fld('Nome do portal','name',c.name,'text','required')+fld('Endpoint de consulta (GET)','readUrl',c.readUrl,'url','placeholder="https://portal.exemplo.com/api/clientes"')+fld('Parâmetro de busca','queryKey',c.queryKey||'q')+fld('Endpoint de cadastro (POST JSON)','writeUrl',c.writeUrl,'url')+sel('Autenticação','auth',{none:'Sem chave',bearer:'Bearer token',key:'X-API-Key'},c.auth||'none')+fld(c.hasSecret?'Nova chave (opcional)':'Chave da API','secret','','password','autocomplete="new-password"')+'<fieldset class="ws-perms"><legend>Permissões por agente</legend>'+perms+'</fieldset><label><input type="checkbox" name="enabled" '+(c.enabled!==false?'checked':'')+'> Habilitar integração</label>'+submit('Salvar integração')+'</form>');
    const f=document.getElementById('ws-conn');f.onsubmit=e=>{e.preventDefault();progress(f,async()=>{const fd=new FormData(f);await api('connection',{...Object.fromEntries(fd),id,readers:fd.getAll('readers'),writers:fd.getAll('writers'),agentNames:names,enabled:fd.has('enabled')});dialog.close();render()})}}
  function allowed(id){return state.connections.filter(c=>c.enabled&&(c.readers.includes(id)||c.writers.includes(id)))}
  function runForm(connId,fixedAgent='',term='',back,preferredMode){
    const cons=fixedAgent?allowed(fixedAgent).filter(c=>!preferredMode||(preferredMode==='write'?c.writers:c.readers).includes(fixedAgent)):state.connections.filter(c=>c.enabled&&(c.readers.length||c.writers.length));
    if(!cons.length){modal('Permissão do agente','<p>Este agente não tem permissão para esta operação.</p>');return}
    const c=cons.find(x=>x.id===connId)||cons[0],names=agents(c);
    const ids=fixedAgent?[fixedAgent]:[...new Set([...c.readers,...c.writers])];
    modal('Operação do agente','<form class="stack" id="ws-run">'+sel('Portal','connection',Object.fromEntries(cons.map(c=>[c.id,c.name])),c.id)+sel('Agente','agent',Object.fromEntries(ids.map(id=>[id,names[id]||'Agente cadastrado'])),ids[0])+'<div class="stack" data-run-fields></div><pre class="ws-result" aria-live="polite"></pre>'+out+'</form>');
    const f=document.getElementById('ws-run'),fields=f.querySelector('[data-run-fields]'),result=f.querySelector('pre');
    if(fixedAgent)f.elements.agent.disabled=true;
    function drawMode(preferred){const agent=f.elements.agent.value, opts={};if(c.readers.includes(agent))opts.read='Consultar';if(c.writers.includes(agent))opts.write='Cadastrar';
      const mode=opts[preferred]?preferred:Object.keys(opts)[0];result.textContent='';f.querySelector('output').textContent='';
      fields.innerHTML=sel('Operação','mode',opts,mode)+(mode==='read'?fld('Termo de busca','term',term):sel('Preencher com contato do painel','source',{'':'Preencher manualmente',...Object.fromEntries(state.records.filter(r=>['leads','clients'].includes(r.section)).map(r=>[r.id,r.name]))},'')+fld('Dados para cadastrar (JSON)','payload','{}','area','required')+'<label><input name="confirm" type="checkbox" required> Conferi os dados e autorizo o cadastro em '+esc(c.name)+'.</label>')+'<button class="btn" type="submit">'+(mode==='read'?'Buscar no portal':'Enviar cadastro')+'</button>';
      f.elements.mode.onchange=()=>drawMode(f.elements.mode.value);
      if(f.elements.source)f.elements.source.onchange=()=>{const contact=state.records.find(r=>r.id===f.elements.source.value);f.elements.payload.value=JSON.stringify(contact?{nome:contact.name,telefone:contact.contact||'',email:contact.email||''}:{},null,2);f.elements.confirm.checked=false};
      if(f.elements.payload)f.elements.payload.oninput=()=>{f.elements.confirm.checked=false};
    }
    f.elements.connection.onchange=()=>runForm(f.elements.connection.value,fixedAgent,term,back,preferredMode);f.elements.agent.onchange=()=>drawMode();
    drawMode(preferredMode);if(back){const b=document.createElement('button');b.type='button';b.className='btn light';b.textContent='Voltar ao teste';b.onclick=back;f.append(b)}
    let lastPayload='',requestId='';
    f.onsubmit=e=>{e.preventDefault();progress(f,async()=>{const mode=f.elements.mode.value;let payload;
      if(mode==='write'){try{payload=JSON.parse(f.elements.payload.value)}catch{throw Error('O JSON deve ser válido.')}if(!payload||Array.isArray(payload)||typeof payload!=='object'||!Object.keys(payload).length)throw Error('Informe os campos do cadastro.');const signature=JSON.stringify([c.id,f.elements.agent.value,payload]);if(signature!==lastPayload){requestId=crypto.randomUUID();lastPayload=signature}}
      const response=await api('run',{connection:c.id,agent:f.elements.agent.value,mode,term:f.elements.term?.value,payload,confirmed:!!f.elements.confirm?.checked,requestId});
      result.textContent=response.result;f.querySelector('output').textContent=mode==='write'?'Cadastro enviado.':'Consulta concluída.';
      if(mode==='write')f.elements.confirm.checked=false;
    })}
  }
  function agentTools(a){return email&&allowed(a.id).length?btn('Consultar ou cadastrar no portal externo','agentRun',a.id):''}
  let returnToTrial;
  function bindTrial(draw){returnToTrial=draw}
  function fact(msg){const p=state.profile;
    if(/telefone|contato da empresa/i.test(msg))return p.phone?'Telefone da empresa: '+p.phone:'';
    if(/site|website/i.test(msg))return p.website||'';
    if(/sobre a empresa|qual.*empresa|o que.*empresa|qual.*setor/i.test(msg))return [p.company,p.sector,p.about].filter(Boolean).join(' · ');
    return '';}
  document.addEventListener('click',async event=>{const b=event.target.closest('[data-wop]');if(!b)return;const {wop:op,wid:id}=b.dataset;
    try{
      if(op==='login'||op==='signup')return accountForm(op==='signup');
      if(op==='reload')return reload();
      if(op==='logout'){document.body.classList.add('signing-out');try{await AtendaAuth.logout()}finally{location.replace('/login')}return}
      if(op==='settingsTab'){settingsTab=id;return render()}
      if(op==='section'){section=id;searchText='';return render()}
      if(op==='payments'){section='payments';searchText='';return go('panel')}
      if(!email)return accountForm(false);
      if(op==='password')return passwordForm();
      if(op==='editRecord')return recordForm(id);
      if(op==='addSection')return addSection();
      if(op==='editConn')return connForm(id);
      if(op==='runConn')return runForm(id);
      if(op==='agentRun')return runForm('',id,'',returnToTrial);
      if(op==='convert'){const f=b.closest('form');return progress(f,async()=>{if(!f.reportValidity())return;await api('record',{...Object.fromEntries(new FormData(f)),id,section:'clients',status:'Ativo'});section='clients';searchText='';dialog.close();render()})}
      if(op==='download'){b.disabled=true;const r=await fetch('/api/workspace?file='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+await access()}});if(!r.ok)throw Error('Não foi possível baixar o arquivo.');
        const a=document.createElement('a'),url=URL.createObjectURL(await r.blob());a.href=url;a.download=state.records.find(r=>r.file?.id===id)?.file.name||'documento';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
    }catch(e){const output=b.closest('form')?.querySelector('output');if(output)output.textContent=e.message;else alert(e.message)}finally{b.disabled=false}
  });
  document.addEventListener('input',e=>{if(e.target.matches('[data-wsearch]')){searchText=e.target.value;document.getElementById('ws-rows').innerHTML=recordList()}});
  document.addEventListener('submit',e=>{const f=e.target;if(f.dataset.wform!=='profile')return;e.preventDefault();progress(f,async()=>{await api('profile',Object.fromEntries(new FormData(f)));document.querySelector('.bar strong').textContent=state.profile.company||data.workspace;f.querySelector('output').textContent='Alterações salvas.'})});
  return {settings,selectSubscription(){settingsTab='Assinatura'},integrations,panel,agentTools,bindTrial,fact,runForm,allowed,init:reload,get company(){return state.profile.company},get companyFacts(){const p=state.profile;return email?[p.company,p.sector,p.about,p.phone&&'Telefone comercial: '+p.phone,p.website].filter(Boolean).join('\n').slice(0,2000):''},get guidelines(){return email?state.profile.guidelines:''},get privatePage(){return isPrivatePage()},get logged(){return !!email}};
})();
