async function whatsappInboxRequest(query, options={}) {
  const response = await fetch('/api/inbox'+query, {
    ...options,cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+await AtendaAuth.access()}
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(Error(result.error||'Consulta ao WhatsApp indisponível.'),{status:response.status});
  return result;
}

const clockFormat = new Intl.DateTimeFormat('pt-BR', {hour:'2-digit', minute:'2-digit'});
const dateFormat = new Intl.DateTimeFormat('pt-BR', {day:'2-digit', month:'2-digit', year:'2-digit'});
function messageDate(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const date = new Date(Number.isFinite(numeric) ? numeric * (numeric < 1e11 ? 1000 : 1) : value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function timestamp(date, full = false) {
  const el = document.createElement('time');
  el.dateTime = date.toISOString();
  el.title = date.toLocaleString('pt-BR');
  const today = date.toDateString() === new Date().toDateString();
  el.textContent = full ? dateFormat.format(date)+' · '+clockFormat.format(date)
    : (today ? clockFormat : dateFormat).format(date);
  return el;
}
const foldContact = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
function contactAvatar(item) {
  const name = item.name || item.jid.split('@')[0];
  const avatar = document.createElement('span');
  avatar.className = 'avatar a'+(name.codePointAt(0) % 3);
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = /^\+?\d+$/.test(name) ? '#' : name.trim().split(/\s+/).slice(0,2).map(w=>Array.from(w)[0]).join('').toLocaleUpperCase('pt-BR');
  if (item.photo) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    img.src = item.photo;
    avatar.append(img);
  }
  return avatar;
}
function conversationRow(item, open) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wa-conversation';
  button.dataset.jid = item.jid;
  const name = item.name || item.jid.split('@')[0];
  const copy = document.createElement('span'), heading = document.createElement('strong'), preview = document.createElement('span');
  copy.className = 'wa-copy';
  heading.textContent = name;
  preview.textContent = item.preview === '[Mensagem de mídia]' ? 'Mensagem de mídia' : item.preview;
  copy.append(heading, preview);
  button.append(contactAvatar(item), copy);
  const date = messageDate(item.time);
  if (date) button.append(timestamp(date));
  button.onclick = open;
  return button;
}

class WhatsAppOverview extends HTMLElement {
  connectedCallback() {
    this.request=new AbortController();
    this.previous=null;
    this.refresh();
  }
  disconnectedCallback() {
    this.request.abort();
    clearTimeout(this.timer);
  }
  async refresh() {
    const signal=this.request.signal;
    const output=this.querySelector('[role=status]');
    const list=this.querySelector('.wa-recent');
    try {
      const {counts,chats}=await whatsappInboxRequest('?view=chats',{signal});
      if(signal.aborted)return;
      for(const number of this.querySelectorAll('[data-count]')) {
        number.textContent=String(counts[number.dataset.count]).padStart(2,'0');
      }
      const recent=chats.slice(0,4), fingerprint=JSON.stringify(recent);
      if(this.previous!==fingerprint){
        list.replaceChildren(...recent.map(chat=>conversationRow(chat,()=>openWhatsAppInbox('all',chat))));
        this.previous=fingerprint;
      }
      output.textContent=recent.length?'':'Nenhuma conversa no WhatsApp ainda.';
    }catch(error){
      if(signal.aborted)return;
      this.previous=null;
      list.replaceChildren();
      for(const number of this.querySelectorAll('[data-count]'))number.textContent='—';
      output.textContent=error.message;
      if([401,403].includes(error.status))return;
    }
    this.timer=setTimeout(()=>this.refresh(),6000);
  }
}
customElements.define('whatsapp-overview', WhatsAppOverview);

class WhatsAppInbox extends HTMLElement {
  connectedCallback(){
    this.selected=null;
    this.innerHTML = `
      <div class="wa-toolbar"><h2>WhatsApp</h2><select aria-label="Filtrar conversas do WhatsApp">
        <option value="all">Todas as conversas</option><option value="waiting">Aguardando resposta</option><option value="answered">Respondidas</option></select><label class="wa-search">
        <svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
        <input type="search" aria-label="Buscar conversa no WhatsApp" placeholder="Buscar nome ou número">
      </label></div>
      <p class="wa-feedback" role="status"></p><div class="wa-list"></div>
      <div class="wa-paging" hidden><button type="button" class="link">Anterior</button><button type="button" class="link">Próxima</button></div>
      <section class="wa-history" hidden><button type="button" class="link">‹ Voltar às conversas</button>
        <h3 tabindex="-1"></h3><div class="bubbles" aria-label="Histórico" tabindex="0"></div>
        <form class="compose"><input aria-label="Sua resposta no WhatsApp" placeholder="Escreva uma resposta…" maxlength="4000" required autocomplete="off"><button class="btn">Enviar</button></form>
        <output role="status"></output></section>`;
    this.search = this.querySelector('[type=search]');
    this.scope = this.querySelector('select');
    this.page = 1;
    this.scope.onchange = ()=>this.changePage(1);
    this.paging=this.querySelector('.wa-paging');
    const [prev,next]=this.paging.children;
    prev.onclick=()=>this.changePage(this.page-1);
    next.onclick=()=>this.changePage(this.page+1);
    this.search.oninput = () => this.showList();
    this.rows = [];
    this.list=this.querySelector('.wa-list');
    this.pane=this.querySelector('.wa-history');
    this.status=this.querySelector('p');
    this.form=this.querySelector('form');
    this.input=this.form.querySelector('input');
    this.pane.querySelector('button').onclick=()=>this.select(null);
    this.form.onsubmit=e=>{e.preventDefault();this.reply()};
    this.drafts=new Map();
    this.pending=new Map();
    this.select(null);
  }
  disconnectedCallback(){clearTimeout(this.timer);this.request?.abort()}
  changePage(page){
    this.page=page;
    this.rows=[];this.list.replaceChildren();this.paging.hidden=true;
    this.previous=null;this.status.textContent='Carregando…';
    this.refresh();
  }
  select(chat){
    this.restoreJid=this.selected?.jid;
    if(this.selected)this.drafts.set(this.selected.jid,this.input.value);
    this.selected=chat;
    this.search.parentElement.hidden = !!chat;
    this.scope.hidden=!!chat;
    this.paging.hidden=true;
    this.list.hidden=!!chat;
    this.pane.hidden=!chat;
    this.previous=null;
    this.status.textContent='Carregando…';
    if(chat){
      this.pane.querySelector('h3').replaceChildren(contactAvatar(chat),document.createTextNode(chat.name));
      this.pane.querySelector('h3').focus({preventScroll:true});
      this.pane.querySelector('.bubbles').replaceChildren();
      this.input.value=this.drafts.get(chat.jid)||'';
      this.pane.querySelector('output').textContent='';
      this.form.querySelector('button').disabled=false;
    }
    this.refresh();
  }
  showList() {
    if (this.selected) return;
    const query = foldContact(this.search.value.trim());
    const matches = this.rows.filter(row => foldContact(row.name).includes(query) || row.jid.split('@')[0].includes(query));
    const focusJid = this.restoreJid || document.activeElement?.dataset.jid;
    this.list.replaceChildren(...matches.map(row => conversationRow(row, () => this.select(row))));
    if (focusJid) {
      const button = Array.from(this.list.children).find(row => row.dataset.jid === focusJid);
      (button || this.search).focus({preventScroll:true});
      this.restoreJid = null;
    }
    this.status.textContent = matches.length ? '' : query ? 'Nenhuma conversa encontrada.' : 'Aguardando a primeira conversa no WhatsApp.';
  }
  async refresh(){
    clearTimeout(this.timer);
    this.request?.abort();
    const request=this.request=new AbortController(), chat=this.selected;
    try{
      const query=chat?'?view=history&jid='+encodeURIComponent(chat.jid):'?view=chats&scope='+this.scope.value+'&page='+this.page;
      const result=await whatsappInboxRequest(query,{signal:request.signal});
      if(request!==this.request||!this.isConnected)return;
      const rows=chat?result.messages:result.chats;
      if(!chat){
        this.paging.hidden=this.page===1&&!result.more;
        this.paging.children[0].disabled=this.page<=1;
        this.paging.children[1].disabled=!result.more;
      }else if(result.photo!==undefined && chat.photo!==result.photo){
        chat.photo=result.photo;
        this.pane.querySelector('h3').replaceChildren(contactAvatar(chat),document.createTextNode(chat.name));
      }
      if(chat) this.status.textContent=rows.length?'':'Nenhuma mensagem neste histórico.';
      const fingerprint=JSON.stringify(rows);
      if(fingerprint!==this.previous){
        this.previous=fingerprint;
        if(chat){
          const bubbles=this.pane.querySelector('.bubbles');
          const atEnd=!bubbles.children.length||bubbles.scrollHeight-bubbles.clientHeight-bubbles.scrollTop<40;
          bubbles.replaceChildren(...rows.map(message=>{
            const line=document.createElement('div');line.className='bubble '+(message.fromMe?'out':'');
            line.textContent=message.text;
            const date = messageDate(message.time);
            if (date) line.append(timestamp(date, true));
            return line;
          }));
          if(atEnd)bubbles.scrollTop=bubbles.scrollHeight;
        }else{
          this.rows = rows;
          this.showList();
        }
      }
    }catch(error){
      if(request.signal.aborted||request!==this.request||!this.isConnected)return;
      this.previous = null;
      this.status.textContent=error.message;
      if([401,403].includes(error.status)){this.rows=[];this.list.replaceChildren();this.pane.hidden=true;this.search.disabled=true;return}
    }
    if(this.isConnected&&request===this.request)this.timer=setTimeout(()=>this.refresh(),6000);
  }
  async reply(){
    const chat=this.selected,text=this.input.value.trim(),button=this.form.querySelector('button');
    if(!chat||!text||button.disabled)return;
    let attempt=this.pending.get(chat.jid);
    if(attempt?.text!==text){attempt={requestId:crypto.randomUUID(),text};this.pending.set(chat.jid,attempt)}
    button.disabled=true;
    const output=this.pane.querySelector('output');
    output.textContent='Enviando…';
    try{
      await whatsappInboxRequest('',{method:'POST',body:JSON.stringify({jid:chat.jid,...attempt})});
      this.pending.delete(chat.jid);this.drafts.delete(chat.jid);
      if(this.selected!==chat||!this.isConnected)return;
      if(this.input.value.trim()===text)this.input.value='';
      output.textContent='Resposta enviada pelo WhatsApp.';
      this.refresh();
    }catch(error){
      if(this.selected===chat&&this.isConnected)output.textContent=error.message;
    }finally{if(this.selected===chat&&this.isConnected)button.disabled=false}
  }
}
customElements.define('whatsapp-inbox',WhatsAppInbox);
