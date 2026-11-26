/* Animate the photographed plush from a cached face and two feathered eye layers. */
(()=>{
 const source=document.querySelector('#pet img,.dot-toggle img');
 if(!source)return;
 const quiet=matchMedia('(prefers-reduced-motion: reduce)');
 function setup(){
  if(quiet.matches||!source.naturalWidth)return;
  const size=source.closest('#pet')?600:94;
  function surface(width){const c=document.createElement('canvas');c.width=c.height=width;return c}
  const original=surface(size), base=surface(size), face=surface(size);
  const bg=base.getContext('2d'), display=face.getContext('2d');
  if(!bg||!display)return;
  original.getContext('2d').drawImage(source,0,0,size,size);bg.drawImage(original,0,0);
  const radius=Math.ceil(size*.055);
  function patch(cx,cy){
   const d=2*radius,layer=surface(d),g=layer.getContext('2d');
   g.drawImage(original,cx-radius,cy-radius,d,d,0,0,d,d);
   const edge=g.createRadialGradient(radius,radius,radius*.70,radius,radius,radius);
   edge.addColorStop(0,'white');edge.addColorStop(1,'transparent');g.globalCompositeOperation='destination-in';g.fillStyle=edge;g.fillRect(0,0,d,d);return layer;
  }
  const eyes=[.339,.630].map(u=>{const cx=Math.round(size*u),cy=Math.round(size*.461);const bead=patch(cx,cy);bg.drawImage(patch(cx,cy-radius*2),cx-radius,cy-radius);return {cx,cy,bead}});
  face.style.cssText=source.closest('#pet')?'display:block;width:100%;height:auto;animation:breathe 3.8s ease-in-out infinite;transform-origin:50% 86%':'width:44px;height:44px;flex:none;animation:dot-breath 4s ease-in-out infinite';
  face.setAttribute('aria-hidden','true'); display.drawImage(original,0,0);source.replaceWith(face);
  let aimX=0,aimY=0,x=0,y=0,next=0,blink=-1000,last=0,visible=true;
  document.addEventListener('pointermove',event=>{const r=face.getBoundingClientRect();if(!visible)return;aimX=Math.max(-1,Math.min(1,(event.clientX-r.left-r.width/2)/Math.max(r.width*.7,100)));aimY=Math.max(-1,Math.min(1,(event.clientY-r.top-r.height/2)/Math.max(r.height*.7,100)))},{passive:true});
  new IntersectionObserver(([entry])=>visible=entry.isIntersecting).observe(face);
  function draw(time){requestAnimationFrame(draw);if(!visible||document.hidden||time-last<40)return;last=time;
   if(quiet.matches){display.clearRect(0,0,size,size);display.drawImage(original,0,0);return}
   if(time>next){blink=time;next=time+2700+Math.random()*2400}
   x+=(aimX-x)*.32;y+=(aimY-y)*.32;
   const t=time-blink, closure=t<180?Math.sin(Math.PI*t/180):0;
   display.clearRect(0,0,size,size);display.drawImage(base,0,0);
   for(const {cx,cy,bead} of eyes){const h=radius*(1-.89*closure);display.drawImage(bead,cx-radius+x*size*.009,cy-h+y*size*.007,radius*2,h*2)}
  }
  requestAnimationFrame(draw);
 }
 if(source.complete)setup();else source.addEventListener('load',setup,{once:true});
})();