const billingMoney=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const billingStates={creating:'Preparando contratação',pending:'Aguardando autorização',authorized:'Recorrência autorizada',canceled:'Cancelada',expired:'Expirada',rejected:'Recusada',review:'Em conferência'};
const invoiceStates={ATIVA:'Agendada',CRIADA:'Criada',CONCLUIDA:'Paga',REJEITADA:'Recusada',EXPIRADA:'Expirada',CANCELADA:'Cancelada',missed:'Prazo de agendamento encerrado',AUTHORISED:'Autorizada',CAPTURED:'Capturada',CANCELLED:'Cancelada',REFUNDED:'Estornada',REFUSED:'Recusada'};
class AtendaSubscription extends HTMLElement {
  connectedCallback(){
    this.className='card stack pane';
    this.innerHTML='<h2>Mensalidade da Atenda</h2><div class="stack" data-billing></div><output role="status">Consultando assinatura…</output>';
    this.content=this.querySelector('[data-billing]');this.output=this.querySelector('output');
    this.run();
  }
  async run(payload){
    if(this.busy)return;this.busy=true;
    this.content.inert=true;
    try{
      const res=await fetch('/api/billing',{method:payload?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await AtendaAuth.access()},body:payload?JSON.stringify(payload):undefined});
      const result=await res.json();
      if(!res.ok)throw Error(result.error||'Cobrança indisponível.');
      if(!this.isConnected)return;
      this.output.textContent='';this.show(result);
    }catch(e){
      this.output.textContent=e.message;
      if(!this.querySelector('[data-reload]')){
        const retry=document.createElement('button');retry.type='button';retry.className='link';retry.dataset.reload='';retry.textContent='Consultar assinatura';retry.onclick=()=>this.run();this.content.append(retry);
      }
    }finally{this.busy=false;this.content.inert=false}
  }
  show({subscription:s,config,basePrice,extraPrice}){
    this.content.replaceChildren();
    const add=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;this.content.append(el);return el};
    const button=(text,fn)=>{const b=add('button',text);b.type='button';b.className='btn light';b.onclick=fn;return b};
    if(config.environment==='sandbox'&&(config.pix||config.card))add('p','Ambiente de homologação');
    if(s){
      add('strong',billingStates[s.status]||'Em conferência');
      add('p',billingMoney(s.amount)+' por mês · '+s.seats+' agente(s) · '+(s.method==='pix'?'Pix Automático':'Cartão de crédito'));
      if(s.code){
        const img=add('img','');img.src=s.qr;img.width=220;img.alt='QR de autorização do Pix Automático';
        const code=add('textarea',s.code);code.readOnly=true;code.setAttribute('aria-label','Pix Copia e Cola');
        button('Copiar código Pix',async()=>{try{await navigator.clipboard.writeText(s.code);this.output.textContent='Código copiado.'}catch{code.select()}});
      }
      if(s.cardForm)button('Autorizar cartão na PayZen',()=>{
        const form=document.createElement('form');form.method='POST';form.action='https://secure.payzen.com.br/vads-payment/';
        for(const [name,value] of Object.entries(s.cardForm.fields)){const i=document.createElement('input');i.type='hidden';i.name=name;i.value=value;form.append(i)}
        this.append(form);form.submit();
      });
      if(s.invoices.length){
        add('h3','Últimas cobranças');
        for(const bill of s.invoices.slice(-6).reverse())add('p',String(bill.date).slice(0,10).split('-').reverse().join('/')+' · '+(invoiceStates[bill.status]||bill.status));
      }
      if(!['rejected','expired','canceled'].includes(s.status)){
        button('Atualizar situação',()=>this.run(s.method==='pix'?{op:'refresh',id:s.id}:undefined));
        if(s.status==='authorized'||s.method==='pix'&&s.status==='pending')button('Cancelar recorrência',()=>{
          if(confirm('Cancelar as próximas mensalidades desta assinatura?'))this.run({op:'cancel',id:s.id,confirmed:true});
        });
        return;
      }
    }
    add('p','Portal, um número de WhatsApp e um agente por '+billingMoney(basePrice)+'/mês. Cada agente adicional custa '+billingMoney(extraPrice)+'/mês.');
    if(!config.pix&&!config.card){add('p','A contratação por Pix Automático e cartão aguarda habilitação.');return}
    const form=add('form','');form.className='stack';
    form.innerHTML='<label class="field">Quantidade de agentes<input name="seats" type="number" min="1" max="100" step="1" value="1" required></label><label class="field">Forma de pagamento<select name="method"></select></label><div class="stack" data-payer><label class="field">Nome ou razão social<input name="payer" maxlength="100"></label><label class="field">CPF ou CNPJ<input name="document" inputmode="numeric" maxlength="18"></label></div><strong data-total></strong><p data-terms></p><label><input style="width:auto" type="checkbox" name="consent" required> Autorizo a mensalidade no valor e nas condições acima.</label><button class="btn">Continuar contratação</button>';
    const f=form.elements;
    if(config.pix)f.method.add(new Option('Pix Automático · Sicredi','pix'));
    if(config.card)f.method.add(new Option('Cartão de crédito · PayZen','card'));
    const update=()=>{
      const pix=f.method.value==='pix',seats=f.seats.valueAsNumber;
      form.querySelector('[data-payer]').hidden=!pix;
      f.payer.required=pix;f.document.required=pix;f.consent.checked=false;
      form.querySelector('[data-total]').textContent=Number.isInteger(seats)&&seats>=1&&seats<=100?billingMoney(basePrice+extraPrice*(seats-1))+' por mês':'';
      form.querySelector('[data-terms]').textContent=pix?'Autorize no aplicativo do banco. O primeiro vencimento será em oito dias e as próximas cobranças serão mensais, até o cancelamento.':'A primeira cobrança ocorre ao autorizar o cartão na página segura da PayZen. As próximas são mensais, no mesmo dia ou no dia 28 para adesões após essa data, até o cancelamento.';
    };
    f.seats.oninput=update;f.method.onchange=update;update();
    form.onsubmit=e=>{e.preventDefault();this.run({op:'start',method:f.method.value,seats:f.seats.valueAsNumber,amount:basePrice+extraPrice*(f.seats.valueAsNumber-1),accepted:f.consent.checked,name:f.payer.value,document:f.document.value})};
  }
}
customElements.define('atenda-subscription',AtendaSubscription);
