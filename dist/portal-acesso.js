(async()=>{
  const gate=document.getElementById('account-gate');
  const text=gate.querySelector('p');
  const legacySession=!!AtendaAuth.session && !sessionStorage.getItem('atenda.auth.v2');
  if(!AtendaAuth.session){location.replace('/login'+location.hash);return}
  try{
    const user=await AtendaAuth.verify();
    const key='atenda.v1.'+user.id;
    // Preserve an existing operator's local demo when upgrading an already active session.
    if(legacySession&&!localStorage.getItem(key)&&!localStorage.getItem('atenda.legacy.owner')){
      const old=localStorage.getItem('atenda.v1');
      if(old){localStorage.setItem(key,old);localStorage.setItem('atenda.legacy.owner',user.id)}
    }
    sessionStorage.setItem('atenda.auth.v2','1');
    const script=document.createElement('script');script.src='/central.js';
    script.onerror=()=>{text.textContent='Não foi possível carregar o portal.';gate.querySelector('div').hidden=false};
    script.onload=()=>{document.body.classList.remove('validating');gate.remove();const motion=document.createElement('script');motion.src='/dot-motion.js';document.body.append(motion)};
    document.body.append(script);
  }catch(e){
    if(!AtendaAuth.session||[401,403].includes(e.status)){location.replace('/login');return}
    text.textContent='Não foi possível verificar sua sessão. Confira sua conexão e tente novamente.';
    gate.querySelector('div').hidden=false;
  }
  addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
})();
