class AtendaWhatsApp extends HTMLElement {
  connectedCallback() {
    this.message = document.createElement('p');
    this.message.setAttribute('role', 'status');
    this.message.textContent = 'Consultando sessão…';
    this.image = document.createElement('img');
    this.image.alt = 'QR Code de pareamento do WhatsApp';
    this.image.width = 280;
    this.image.hidden = true;
    this.historyChoice = document.createElement('input');
    this.historyChoice.type = 'checkbox';
    this.historyChoice.checked = false;
    this.historyLabel = document.createElement('label');
    this.historyLabel.append(this.historyChoice, ' Importar o histórico de conversas deste número');
    this.historyLabel.hidden = true;
    this.actions = document.createElement('div');
    this.replaceChildren(this.message, this.image, this.historyLabel, this.actions);
    this.refresh();
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
      const response = await fetch(account ? '/api/inbox?view=status' : '/api/whatsapp', {
        method: connect ? 'POST' : 'GET',
        headers: connect ? {...headers,'Content-Type':'application/json'} : headers,
        body: connect ? JSON.stringify({importHistory:this.historyChoice.checked}) : undefined,
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
        pairing: 'No WhatsApp do celular, abra Aparelhos conectados e escaneie o código.',
        offline: 'O WhatsApp está desconectado no Windows.',
        connected: 'Conectado'
      };
      this.historyLabel.hidden = account || !['missing','stopped'].includes(result.state);
      this.message.textContent = messages[result.state] || 'Estado de sessão desconhecido.';
      this.image.hidden = result.state !== 'pairing';
      if (this.image.hidden) this.image.removeAttribute('src');
      else if (this.image.getAttribute('src') !== result.qr) this.image.src = result.qr;
      if (account && result.state === 'connected') {
        this.button('Abrir conversas', () => go('chat'));
      } else if (['missing','stopped'].includes(result.state)) {
        this.button('Conectar WhatsApp', () => this.refresh(true));
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
      message.textContent=(result.enabled?result.name+' responde às novas mensagens.':'O envio automático está pausado.')+' '+(result.host==='Windows'?'O número está conectado neste Windows e precisa dele ligado.':'O conector roda no servidor.')+(result.issue?' '+result.issue:'');
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
      snapshot = {state:result.state};
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
  paint({state, message}) {
    const info = {
      checking:['Verificando', 'Consultando a conexão do número.'],
      connected:['Ativo', 'Número conectado ao WhatsApp.'],
      offline:['Inativo', 'O número está desconectado do WhatsApp.'],
      unknown:['Indisponível', message || 'Não foi possível confirmar a conexão.']
    };
    if (!Object.hasOwn(info, state)) state = 'unknown';
    const [label, detail] = info[state];
    if (this.dataset.state === state && this.title === detail) return;
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
