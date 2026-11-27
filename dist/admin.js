(() => {
  const el=id=>document.getElementById(id);
  const states={missing:'Sem número',offline:'Desconectado',waiting:'Preparando QR',pairing:'Aguardando leitura',connected:'Conectado'};
  const contracts={authorized:'Autorizada',pending:'Aguardando autorização',canceled:'Cancelada',rejected:'Recusada',expired:'Expirada',creating:'Em contratação',review:'Em análise'};
  const events={support:'Resposta de suporte',welcome:'Boas-vindas',billing:'Aviso de mensalidade'};
  let offset=0,channel={},timer,busy=false;
  async function api(action,body){
    const res=await fetch('/api/admin?action='+action,{method:body?'POST':'GET',cache:'no-store',
      headers:{Authorization:'Bearer '+await AtendaAuth.access(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error||'Falha ao consultar a administração.'),{status:res.status});return data;
  }
  function denial(e){
    if(e.status===401){location.replace('/login?next=admin');return true}
    if(e.status===403){clearTimeout(timer);el('workspace').hidden=true;el('access').textContent=e.message;return true}return false;
  }
  async function accounts(position){
    try{
      const d=await api('overview&offset='+position);offset=d.offset;
      el('workspace').hidden=false;el('access').textContent='';el('account-message').textContent='';
      el('count').textContent=d.total+' '+(d.total===1?'conta':'contas');
      el('billing-env').textContent=d.environment==='sandbox'?'Assinaturas em homologação.':'Assinaturas em produção.';
      const rows=el('accounts');rows.replaceChildren();
      for(const a of d.accounts){
        const r=rows.insertRow(),s=a.contract;
        const identity=r.insertCell();identity.textContent=a.company||a.email||a.id;
        if(a.company&&a.email){identity.append(document.createElement('br'),document.createTextNode(a.email))}
        r.insertCell().textContent=a.confirmed==null?'Conta do portal':a.confirmed?'Confirmado':'Aguardando confirmação';
        r.insertCell().textContent=s?(contracts[s.status]||s.status)+' · '+s.seats+' agente(s)':'Sem assinatura';
        r.insertCell().textContent=s?(s.amount/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
      }
      el('previous').hidden=!offset;el('next').hidden=!d.more;return true;
    }catch(e){if(!denial(e))(el('workspace').hidden?el('access'):el('account-message')).textContent=e.message;return false}
  }
  async function sync(op){
    if(busy)return;busy=true;clearTimeout(timer);
    for(const id of ['connect','toggle','refresh'])el(id).disabled=true;
    try{
      channel=await api('channel',op?{op}:undefined);
      el('state').textContent=(states[channel.state]||'Indisponível')+(channel.state==='connected'&&!channel.enabled?' · Pausado':'');
      el('connect').hidden=channel.state==='connected'||channel.state==='pairing';
      el('toggle').hidden=channel.state!=='connected';el('toggle').textContent=channel.enabled?'Pausar automação':'Retomar automação';
      el('number').textContent=channel.number?'Número conectado: +'+channel.number.replace(/^\+/,''):'';
      const qr=channel.state==='pairing'&&/^data:image\/png;base64,/.test(channel.qr);
      el('pair').hidden=!qr;if(qr)el('qr').src=channel.qr;else el('qr').removeAttribute('src');
      el('activity').replaceChildren(...(channel.activity||[]).map(ev=>{
        const li=document.createElement('li');li.textContent=new Date(ev.created).toLocaleString('pt-BR')+' · '+(events[ev.kind]||'Mensagem')+' · '+(ev.state==='sent'?'Enviada':'Envio sem confirmação');return li;
      }));
      if(!channel.activity?.length){const li=document.createElement('li');li.textContent='Nenhum envio registrado.';el('activity').append(li)}
      el('channel-message').textContent=channel.issue||'';
    }catch(e){if(denial(e))return;el('state').textContent='Conector indisponível';el('pair').hidden=true;el('channel-message').textContent=e.message}
    finally{busy=false;for(const id of ['connect','toggle','refresh'])el(id).disabled=false;
      if(!el('workspace').hidden)timer=setTimeout(()=>sync(),['pairing','waiting'].includes(channel.state)?4000:45000)}
  }
  el('connect').onclick=()=>sync('connect');el('toggle').onclick=()=>sync(channel.enabled?'pause':'resume');el('refresh').onclick=()=>sync();
  el('previous').onclick=()=>accounts(Math.max(0,offset-25));el('next').onclick=()=>accounts(offset+25);el('reload').onclick=()=>accounts(offset);
  const keyState=d=>{el('key-state').textContent=d.configured?'Chave configurada':'Aguardando chave'};
  el('key-form').onsubmit=async event=>{
    event.preventDefault();
    const field=el('luna-key'),button=event.submitter||el('key-form').querySelector('button');
    if(button.disabled)return;
    button.disabled=true;el('key-message').textContent='Testando o Luna…';
    try{const request=api('luna',{key:field.value.trim()});field.value='';keyState(await request);el('key-message').textContent='O Luna respondeu. Chave salva.'}
    catch(e){if(!denial(e))el('key-message').textContent=e.message}
    finally{button.disabled=false}
  };
  if(!AtendaAuth.session){location.replace('/login?next=admin');return}
  api('luna').then(d=>{keyState(d);el('workspace').hidden=false;el('access').textContent='';if(location.hash==='#luna')el('luna-key').focus()})
    .catch(e=>{if(!denial(e)){el('key-state').textContent='Indisponível';el('key-message').textContent=e.message}});
  accounts(0).then(ok=>{if(ok)sync()});
})();
