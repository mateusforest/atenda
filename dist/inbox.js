async function whatsappInboxRequest(query, options={}) {
  const response = await fetch('/api/inbox'+query, {
    ...options,cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+await AtendaAuth.access()}
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(Error(result.error||'Consulta ao WhatsApp indisponível.'),{status:response.status});
  return result;
}

class WhatsAppInbox extends HTMLElement {
  connectedCallback(){
    this.selected=null;
    this.innerHTML='<h2>WhatsApp</h2><p role="status">Carregando conversas…</p><div class="wa-list"></div><section class="wa-history" hidden><button type="button" class="link">Voltar às conversas</button><h3></h3><div class="bubbles" aria-label="Histórico"></div><form class="compose"><input aria-label="Sua resposta no WhatsApp" maxlength="4000" required autocomplete="off"><button class="btn">Enviar pelo WhatsApp</button></form><output role="status"></output></section>';
    this.list=this.querySelector('.wa-list');
    this.pane=this.querySelector('.wa-history');
    this.status=this.querySelector('p');
    this.form=this.querySelector('form');
    this.input=this.querySelector('input');
    this.pane.querySelector('button').onclick=()=>this.select(null);
    this.form.onsubmit=e=>{e.preventDefault();this.reply()};
    this.drafts=new Map();
    this.pending=new Map();
    this.select(null);
  }
  disconnectedCallback(){clearTimeout(this.timer);this.request?.abort()}
  select(chat){
    if(this.selected)this.drafts.set(this.selected.jid,this.input.value);
    this.selected=chat;
    this.list.hidden=!!chat;
    this.pane.hidden=!chat;
    this.previous=null;
    this.status.textContent='Carregando…';
    if(chat){
      this.pane.querySelector('h3').textContent=chat.name;
      this.pane.querySelector('.bubbles').replaceChildren();
      this.input.value=this.drafts.get(chat.jid)||'';
      this.pane.querySelector('output').textContent='';
      this.form.querySelector('button').disabled=false;
    }
    this.refresh();
  }
  async refresh(){
    clearTimeout(this.timer);
    this.request?.abort();
    const request=this.request=new AbortController(), chat=this.selected;
    try{
      const query=chat?'?view=history&jid='+encodeURIComponent(chat.jid):'?view=chats';
      const result=await whatsappInboxRequest(query,{signal:request.signal});
      if(request!==this.request||!this.isConnected)return;
      const rows=chat?result.messages:result.chats;
      this.status.textContent=rows.length?'':chat?'Nenhuma mensagem neste histórico.':'Aguardando a primeira conversa no WhatsApp.';
      const fingerprint=JSON.stringify(rows);
      if(fingerprint!==this.previous){
        this.previous=fingerprint;
        if(chat){
          const bubbles=this.pane.querySelector('.bubbles');
          const atEnd=!bubbles.children.length||bubbles.scrollHeight-bubbles.clientHeight-bubbles.scrollTop<40;
          bubbles.replaceChildren(...rows.map(message=>{
            const line=document.createElement('div');line.className='bubble '+(message.fromMe?'out':'');
            line.textContent=message.text;line.title=new Date(message.time).toLocaleString('pt-BR');return line;
          }));
          if(atEnd)bubbles.scrollTop=bubbles.scrollHeight;
        }else{
          this.list.replaceChildren(...rows.map(item=>{
            const b=document.createElement('button');b.type='button';b.className='listrow';
            const name=document.createElement('strong'),preview=document.createElement('span');
            name.textContent=item.name;preview.textContent=item.preview;
            b.append(name,preview);b.onclick=()=>this.select(item);return b;
          }));
        }
      }
    }catch(error){
      if(request.signal.aborted||request!==this.request||!this.isConnected)return;
      this.status.textContent=error.message;
      if([401,403].includes(error.status)){this.list.replaceChildren();this.pane.hidden=true;return}
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
