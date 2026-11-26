const AtendaAuth = (() => {
  const storageKey = 'atenda.conta';
  let session = null;
  let config, refreshing, user;
  try { session = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
  function clear(){
    session = null;
    user = null;
    sessionStorage.removeItem(storageKey);
  }
  function save(result){
    if(!result.access_token || !result.refresh_token) throw Error('O serviço de conta não retornou uma sessão válida.');
    session = {access_token:result.access_token, refresh_token:result.refresh_token,
      expires_at:Number(result.expires_at)||Math.floor(Date.now()/1000)+Number(result.expires_in||3600)};
    sessionStorage.setItem(storageKey,JSON.stringify(session));
  }
  const messages={
    invalid_credentials:'E-mail ou senha incorretos.',
    email_not_confirmed:'Confirme seu e-mail antes de entrar.',
    user_already_exists:'Já existe uma conta com este e-mail.',
    signup_disabled:'O cadastro de novas contas está desativado.',
    weak_password:'Escolha uma senha mais forte.',
    over_email_send_rate_limit:'Aguarde um pouco antes de solicitar outro e-mail.',
    over_request_rate_limit:'Muitas tentativas. Aguarde um pouco e tente novamente.',
    same_password:'Escolha uma senha diferente da atual.'
  };
  async function request(path,method,body,token){
    if(!config){
      const response=await fetch('/api/workspace?action=config',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('O serviço de conta está indisponível. Tente novamente.');
      config=await response.json();
    }
    const res=await fetch(config.url+'/auth/v1/'+path,{method,cache:'no-store',signal:AbortSignal.timeout(12000),
      headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      body:body?JSON.stringify(body):undefined});
    const value=await res.json().catch(()=>({}));
    if(!res.ok)throw Object.assign(Error(messages[value.error_code]||'Não foi possível concluir. Confira seus dados e tente novamente.'),{status:res.status,code:value.error_code});
    return value;
  }
  async function access(){
    if(!session?.access_token)throw Object.assign(Error('Entre para acessar o portal.'),{status:401});
    if(session.expires_at<Date.now()/1000+60){
      const old=session;
      refreshing??=request('token?grant_type=refresh_token','POST',{refresh_token:old.refresh_token}).then(result=>{
        if(session!==old)throw Error('A sessão mudou. Entre novamente.');
        save(result);
      }).catch(e=>{if(session===old&&[400,401,403].includes(e.status))clear();throw e}).finally(()=>refreshing=null);
      await refreshing;
    }
    return session.access_token;
  }
  async function verify(){
    const token=await access();
    try {
      const identity=await request('user','GET',undefined,token);
      if(!identity.id)throw Object.assign(Error('Sessão inválida.'),{status:401});
      user=identity;
      return identity;
    } catch(e){if([401,403].includes(e.status))clear();throw e}
  }
  async function logout(){
    const token=session?.access_token;
    clear();
    if(token)await request('logout?scope=local','POST',undefined,token).catch(()=>{});
  }
  return {request,access,verify,save,clear,logout,get session(){return session}, get user(){return user}};
})();
