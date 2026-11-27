import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../dist/acesso.html',import.meta.url),'utf8');
const code=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function page(url){
  const elements=new Map(),calls=[];
  function field(name){
    if(!elements.has(name))elements.set(name,{value:'',closest:()=>field('label-'+name),setCustomValidity(){},after(){}});
    return elements.get(name);
  }
  const form=field('account');
  form.elements=Object.fromEntries(['email','password','confirmation','consent','phone'].map(n=>[n,field(n)]));
  const location=new URL(url);let destination;
  location.replace=value=>{destination=value};
  const result={access_token:'test-session',refresh_token:'test-refresh'};
  const auth={request:async(...args)=>{calls.push(args);return result},save:value=>{auth.session=value},clear:()=>{auth.session=null}};
  vm.runInNewContext(code,{location,URLSearchParams,history:{replaceState(){}},sessionStorage:{setItem(){}},
    document:{getElementById:field,createElement:()=>({})},AtendaAuth:auth,fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true,json:async()=>({accepted:true})}}});
  return {field,calls,auth,submit:()=>form.onsubmit({preventDefault(){}}),destination:()=>destination};
}
test('cadastro solicita confirmação, login usa a senha e abre o destino',async()=>{
  for(const signup of [true,false]){
    const p=page('https://atendadot.com/'+(signup?'cadastro':'login')+'?next=checkout');
    p.field('email').value='user@example.test';p.field('password').value=p.field('confirmation').value='exemplo fictício';
    await p.submit();
    if(signup){assert.equal(p.calls[0][0],'/api/admin?action=signup');assert.match(p.field('notice').textContent,/Confirme o cadastro/)}
    else{assert.equal(p.calls[0][0],'token?grant_type=password');assert.equal(p.destination(),'/checkout')}
  }
});
test('recuperação envia link e usa somente a sessão recebida no link para trocar a senha',async()=>{
  const p=page('https://atendadot.com/login?acao=recuperar');
  p.field('email').value='user@example.test';await p.submit();
  assert.equal(p.calls[0][0],'recover?redirect_to=https%3A%2F%2Fatendadot.com%2Flogin');
  assert.equal(p.calls[0][2].email,'user@example.test');assert.match(p.field('notice').textContent,/Se houver uma conta/);
  const r=page('https://atendadot.com/login#type=recovery&access_token=test-link');
  r.field('password').value=r.field('confirmation').value='nova senha fictícia';await r.submit();
  assert.equal(r.calls[0][0],'user');assert.equal(r.calls[0][1],'PUT');assert.equal(r.calls[0][3],'test-link');
  assert.equal(r.field('password').value,'');assert.match(r.field('notice').textContent,/Senha atualizada/);
});
