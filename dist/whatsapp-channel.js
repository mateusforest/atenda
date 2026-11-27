class AtendaWhatsApp extends HTMLElement {
  connectedCallback() {
    this.message = document.createElement('p');
    this.message.setAttribute('role', 'status');
    this.message.textContent = 'Consultando sessão…';
    this.image = document.createElement('img');
    this.image.alt = 'QR Code de pareamento do WhatsApp';
    this.image.width = 280;
    this.image.style.maxWidth = '100%';
    this.image.hidden = true;
    this.historyChoice = document.createElement('input');
    this.historyChoice.type = 'checkbox';
    this.historyChoice.checked = false;
    this.historyLabel = document.createElement('label');
    this.historyLabel.append(this.historyChoice, ' Importar o histórico de conversas deste número');
    this.historyLabel.hidden = true;
    this.actions = document.createElement('div');
    this.replaceChildren(this.message, this.image, this.historyLabel, this.actions);
    this.refresh(this.hasAttribute('start-on-open'));
  }

  disconnectedCallback() {
    clearTimeout(this.timer);
    this.request?.abort();
  }

  button(label, click) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = label;
    button.onclick = click;
    this.actions.append(button);
  }

  async refresh(connect = false) {
    clearTimeout(this.timer);
    this.request?.abort();
    const request = this.request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 45000);
    this.actions.replaceChildren();
    if (connect) this.message.textContent = 'Iniciando sessão…';
    try {
      const account = this.hasAttribute('account');
      const headers = account ? {Authorization:'Bearer '+await AtendaAuth.access()} : {'X-Atenda-Panel':'1'};
      const response = await fetch(account ? '/api/inbox?view=pairing' : '/api/whatsapp', {
        method: connect ? 'POST' : 'GET',
        headers: connect ? {...headers,'Content-Type':'application/json'} : headers,
        body: connect ? JSON.stringify(account?{op:'connect'}:{importHistory:this.historyChoice.checked}) : undefined,
        cache: 'no-store',
        signal: request.signal
      });
      if (!(response.headers.get('content-type') || '').includes('application/json')) {
        throw Error('Não foi possível acessar o canal. Entre novamente no portal.');
      }
      const result = await response.json();
      if (!this.isConnected || this.request !== request) return;
      if (!response.ok) throw Error(result.error || 'Consulta indisponível.');
      const messages = {
        missing: 'A sessão ainda não foi criada.',
        stopped: 'A sessão está parada.',
        waiting: 'Aguardando o QR do WhatsApp…',
        pairing: 'Exiba este código em outra tela. No celular do número, abra WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie o QR.',
        offline: 'O WhatsApp está desconectado no Windows.',
        connected: 'Conectado'
      };
      this.historyLabel.hidden = account || !['missing','stopped'].includes(result.state);
      const detail = messages[result.state] || 'Estado de sessão desconhecido.';
      if (this.message.textContent !== detail) this.message.textContent = detail;
      this.image.hidden = result.state !== 'pairing';
      if (this.image.hidden) this.image.removeAttribute('src');
      else if (this.image.getAttribute('src') !== result.qr) this.image.src = result.qr;
      if (account && result.state === 'connected') {
        accountChannel.refresh();
        this.button('Abrir conversas', () => go('chat'));
        return;
      } else if (['missing','stopped'].includes(result.state)) {
        this.button('Conectar WhatsApp', () => this.refresh(true));
        if (account) return;
      } else if (result.state === 'connected' && this.hasAttribute('replies')) {
        this.button('Configurar resposta automática', () => this.dispatchEvent(new Event('atenda-reply-setup', {bubbles:true})));
      }
      this.timer = setTimeout(() => this.refresh(), 5000);
    } catch (error) {
      if (!this.isConnected || this.request !== request) return;
      this.image.hidden = true;
      this.image.removeAttribute('src');
      this.message.textContent = error.name === 'AbortError' ? 'A consulta ao servidor expirou.' : error.message;
      this.button('Consultar novamente', () => this.refresh());
    } finally {
      clearTimeout(timeout);
    }
  }
}
customElements.define('atenda-whatsapp', AtendaWhatsApp);

class AutomaticReplies extends HTMLElement {
  async connectedCallback(){
    this.innerHTML='<h2>Respostas automáticas com Luna</h2><p role="status">Consultando o agente do número…</p><label class="field">Agente do WhatsApp<select></select></label><div class="actions"><button class="btn" data-enable disabled>Ativar respostas automáticas</button><button class="btn light" data-pause hidden>Pausar respostas</button></div>';
    const select=this.querySelector('select'),enable=this.querySelector('[data-enable]'),pause=this.querySelector('[data-pause]'),message=this.querySelector('p');
    for(const a of data.team.filter(a=>a.licensed&&!a.paused))select.add(new Option(a.name,a.id));
    const paint=result=>{
      this.status=result;
      if(Array.from(select.options).some(o=>o.value===result.agent))select.value=result.agent;
      data.publishedAgent=result.agent;save();
      enable.textContent=result.enabled?'Publicar configuração do agente':'Ativar respostas automáticas';
      pause.hidden=!result.enabled;enable.disabled=!select.value;
      message.textContent=(result.enabled?result.name+' responde às novas mensagens.':'O envio automático está pausado.')+' '+(result.host==='Windows'?'O número está conectado neste Windows e precisa dele ligado.':(result.host==='Meta / Vercel'?'O atendimento usa a API da Meta na Vercel. Você pode desligar o computador.':'O conector roda no servidor.'))+(result.issue?' '+result.issue:'');
    };
    const change=async mode=>{
      enable.disabled=pause.disabled=true;
      try{
        const member=findMember(select.value);
        const result=await agentRequest('automatic',{mode,revision:this.status?.revision||'',...(mode==='enable'?{agent:member.id,profile:agentProfile(member)}:{})});
        if(this.isConnected)paint(result);
      }catch(e){message.textContent=e.message;if(this.status)enable.disabled=!select.value}
      finally{pause.disabled=false}
    };
    enable.onclick=()=>change('enable');pause.onclick=()=>change('pause');
    await change('status');
  }
}
customElements.define('wa-automatic-replies',AutomaticReplies);

async function syncPublishedAgent(agent){
  if(data.publishedAgent!==agent.id)return;
  const state=await agentRequest('automatic',{mode:'status'});
  if(state.agent!==agent.id){data.publishedAgent=state.agent;save();return}
  const enabled=agent.licensed&&!agent.paused;
  const result=await agentRequest('automatic',{mode:enabled?'enable':'pause',revision:state.revision,agent:agent.id,profile:agentProfile(agent)});
  data.publishedAgent=result.agent;save();
}

// A navegação e o cartão do canal compartilham a consulta autenticada.
const accountChannel = (() => {
  const subscribers = new Set();
  let snapshot = {state:'checking'}, timer, pending, checkedAt = 0;
  async function refresh() {
    clearTimeout(timer);
    if (pending || document.hidden || !subscribers.size) return;
    pending = true;
    try {
      const result = await whatsappInboxRequest('?view=status', {signal:AbortSignal.timeout(30000)});
      snapshot = {state:result.state,canPair:result.canPair===true};
    } catch (error) {
      snapshot = {state:'unknown', message:error.message};
    } finally {
      pending = false;
      checkedAt = Date.now();
      for (const subscriber of subscribers) subscriber.paint(snapshot);
      if (subscribers.size && !document.hidden) timer = setTimeout(refresh, 30000);
    }
  }
  document.addEventListener('visibilitychange', () => document.hidden ? clearTimeout(timer) : refresh());
  return {
    subscribe(view) {
      const first = !subscribers.size;
      subscribers.add(view);
      view.paint(snapshot);
      if (first && !pending) timer = setTimeout(refresh, Math.max(0, checkedAt + 30000 - Date.now()));
    },
    remove(view) {
      subscribers.delete(view);
      if (!subscribers.size) {clearTimeout(timer); timer = null;}
    },
    refresh
  };
})();
class WhatsAppSessionIndicator extends HTMLElement {
  connectedCallback() {accountChannel.subscribe(this);}
  disconnectedCallback() {accountChannel.remove(this);}
  paint({state, message, canPair}) {
    const info = {
      checking:['Verificando', 'Consultando a conexão do número.'],
      connected:['Ativo', 'Número conectado ao WhatsApp.'],
      offline:['Inativo', 'O número está desconectado do WhatsApp.'],
      unknown:['Indisponível', message || 'Não foi possível confirmar a conexão.']
    };
    if (!Object.hasOwn(info, state)) state = 'unknown';
    const [label, detail] = info[state];
    if (this.dataset.state === state && this.title === detail && this.canPair === canPair) return;
    this.canPair = canPair;
    this.dataset.state = state;
    this.title = detail;
    const badge = document.createElement('span');
    badge.className = 'session-badge';
    const mark = document.createElement('span');
    mark.className = 'session-mark';
    mark.setAttribute('aria-hidden','true');
    mark.textContent = {connected:'✓',offline:'−',checking:'·',unknown:'?'}[state];
    const name = document.createElement('span');
    name.textContent = label;
    if (this.hasAttribute('compact')) name.className = 'visually-hidden';
    badge.append(mark, name);
    this.replaceChildren(badge);
    if (this.hasAttribute('compact')) return;
    const description = document.createElement('p');
    description.className = 'muted';
    description.textContent = detail;
    this.append(description);
    if (state === 'offline' && canPair) {
      const reconnect = document.createElement('button');
      reconnect.className = 'btn';
      reconnect.type = 'button';
      reconnect.textContent = 'Reconectar por QR Code';
      reconnect.onclick = () => {
        const pairing = document.createElement('atenda-whatsapp');
        pairing.setAttribute('account','');
        pairing.setAttribute('start-on-open','');
        this.replaceChildren(pairing);
      };
      this.append(reconnect);
    }
    if (state !== 'checking') {
      const button = document.createElement('button');
      button.className = state === 'connected' ? 'btn' : 'btn light';
      button.textContent = state === 'connected' ? 'Abrir conversas' : 'Consultar novamente';
      button.onclick = state === 'connected' ? () => go('chat') : accountChannel.refresh;
      this.append(button);
    }
  }
}
customElements.define('wa-session-indicator', WhatsAppSessionIndicator);

class WhatsAppProfile extends HTMLElement {
  connectedCallback(){
    this.innerHTML='<div class="wa-profile"><img alt="Foto do número conectado" hidden referrerpolicy="no-referrer"><div><h2>Perfil do WhatsApp</h2><strong data-name></strong><p data-number></p><p data-about></p></div></div><div class="actions"><button class="btn light" data-edit disabled>Editar perfil</button><button class="link" data-refresh>Atualizar</button></div><output role="status"></output>';
    this.querySelector('[data-edit]').onclick=()=>this.edit();
    this.querySelector('[data-refresh]').onclick=()=>this.load();
    this.channelState=null;
    accountChannel.subscribe(this);
  }
  disconnectedCallback(){accountChannel.remove(this);this.profileRequest?.abort();}
  paint({state,message}){
    if(this.channelState===state && state!=='unknown')return;
    this.channelState=state;
    this.querySelector('[data-refresh]').disabled=state!=='connected';
    if(state==='connected'){this.load();return}
    this.profileRequest?.abort();
    this.profile=null;
    const img=this.querySelector('img');img.hidden=true;img.removeAttribute('src');
    for(const field of ['name','number','about'])this.querySelector('[data-'+field+']').textContent='';
    this.querySelector('[data-edit]').disabled=true;
    this.querySelector('output').textContent=state==='offline'?'Conecte o número para carregar o perfil.':message||'Verificando a conexão…';
  }
  async load(){
    this.profileRequest?.abort();
    const request=this.profileRequest=new AbortController();
    const output=this.querySelector('output');output.textContent='Consultando o perfil…';
    try{
      const p=await whatsappInboxRequest('?view=profile',{signal:request.signal});if(!this.isConnected||request.signal.aborted)return;this.profile=p;
      const img=this.querySelector('img');img.hidden=!p.photo;if(p.photo)img.src=p.photo;else img.removeAttribute('src');
      this.querySelector('[data-name]').textContent=p.name||'Nome indisponível';
      this.querySelector('[data-number]').textContent=p.number||'Número indisponível';
      this.querySelector('[data-about]').textContent=p.about||'Sem recado disponível.';
      output.textContent=p.crmIssue||'';this.querySelector('[data-edit]').disabled=p.editable===false;
    }catch(e){if(!request.signal.aborted){output.textContent=e.message;accountChannel.refresh()}}
  }
  edit(){
    modal('Editar perfil do WhatsApp','<form id="wa-profile-form" class="stack"><label class="field">Nome no WhatsApp<input name="name" maxlength="25"></label><label class="field">Recado<textarea name="about" maxlength="139"></textarea></label><label class="field">Nova foto<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><button class="btn">Salvar no WhatsApp</button><output role="status"></output></form>');
    const f=document.getElementById('wa-profile-form');f.elements.name.value=this.profile.name;f.elements.about.value=this.profile.about;
    f.onsubmit=async event=>{
      event.preventDefault();const save=f.querySelector('button');if(save.disabled)return;save.disabled=true;
      try{
        const name=f.elements.name.value.trim(),about=f.elements.about.value.trim(),file=f.elements.photo.files[0];
        if((name!==this.profile.name&&!name)||(about!==this.profile.about&&!about))throw Error('O WA-AKG exige texto para alterar nome ou recado.');
        const photo=file?await profileJpeg(file):null;
        for(const [field,value,previous] of [['name',name,this.profile.name],['status',about,this.profile.about],['picture',photo,null]]){
          if(value===previous)continue;
          await agentRequest('editProfile',{field,value});if(field==='status')this.profile.about=value;else if(field==='name')this.profile.name=value;
        }
        dialog.close();await this.load();
      }catch(e){f.querySelector('output').textContent=e.message}finally{save.disabled=false}
    };
  }
}
async function profileJpeg(file){
  if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Escolha uma imagem JPG, PNG ou WebP de até 8 MB.');
  const image=await createImageBitmap(file);
  try{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d'),side=Math.min(image.width,image.height);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
    ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,512,512);
    for(const quality of [.82,.65,.48]){
      const value=canvas.toDataURL('image/jpeg',quality).split(',')[1];if(value.length<=190000)return value;
    }
    throw Error('A imagem ficou muito grande. Escolha outra foto.');
  }finally{image.close()}
}
customElements.define('wa-account-profile',WhatsAppProfile);
