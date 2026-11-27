const el = (id) => document.getElementById(id);
const contacts = [
  {
    name: 'Júlia',
    initial: 'J',
    message: 'Tem alguém aí?',
    wait: 12,
    suggestion: 'Oi, Júlia! Estou por aqui. Como posso ajudar?',
  },
  {
    name: 'Caio',
    initial: 'C',
    message: 'Queria continuar nossa conversa.',
    wait: 7,
    suggestion: 'Oi, Caio! Claro. Em que ponto você gostaria de retomar?',
  },
  {
    name: 'Bia',
    initial: 'B',
    message: 'Pode tirar uma dúvida?',
    wait: 2,
    suggestion: 'Oi, Bia! Pode mandar sua pergunta.',
  },
].map((c) => ({ ...c, replies: [], draft: '', suggested: false }));
let active = 0,
  inWorkspace = false;
const waiting = () => contacts.filter((c) => !c.replies.length);
function rowList(id) {
  const list = el(id);
  list.replaceChildren();
  for (const c of [...contacts].sort(
    (a, b) =>
      Number(!!a.replies.length) - Number(!!b.replies.length) ||
      b.wait - a.wait,
  )) {
    const i = contacts.indexOf(c),
      b = document.createElement('button');
    b.className =
      'contact' + (id === 'workRows' && active === i ? ' active' : '');
    b.innerHTML =
      '<span class="avatar"></span><span class="summary"><strong></strong><small></small></span><span class="wait"></span><span class="arrow" aria-hidden="true">↗</span>';
    b.children[0].textContent = c.initial;
    b.querySelector('strong').textContent = c.name;
    b.querySelector('small').textContent = c.replies.at(-1) || c.message;
    b.querySelector('.wait').textContent = c.replies.length
      ? 'Respondida'
      : c.wait
        ? c.wait + ' min'
        : 'Agora';
    b.onclick = () => goDesk(i, true);
    list.append(b);
  }
}
function paint() {
  const c = contacts[active],
    q = waiting();
  el('count').textContent = q.length + ' na fila';
  el('report').textContent = q.length
    ? 'Quem espera há mais tempo é ' +
      q[0].name +
      '. A mensagem chegou há ' +
      q[0].wait +
      ' minutos.'
    : 'A fila está em dia. Todas as conversas receberam resposta.';
  el('who').textContent = c.name;
  el('state').textContent = c.replies.length ? 'Respondida' : 'Aguardando';
  el('history').replaceChildren();
  [c.message, ...c.replies].forEach((t, i) => {
    const d = document.createElement('p');
    d.className = i ? 'bubble mine' : 'bubble';
    d.textContent = t;
    el('history').append(d);
  });
  el('draft').value = c.draft;
  el('draftLabel').textContent = c.suggested
    ? 'Rascunho da Luna · revise antes de enviar'
    : 'Sua resposta';
  el('feedback').textContent = '';
  rowList('workRows');
  document
    .querySelector('[data-home]')
    .setAttribute('aria-current', inWorkspace ? 'false' : 'page');
  document
    .querySelector('[data-queue]')
    .setAttribute('aria-current', inWorkspace ? 'page' : 'false');
}
function goDesk(i, chat) {
  active = i;
  inWorkspace = true;
  el('home').hidden = true;
  el('workspace').hidden = false;
  el('desk').classList.toggle('viewChat', chat);
  paint();
  window.scrollTo(0, 0);
  (chat ? el('who') : el('return')).focus({ preventScroll: true });
}
function home() {
  inWorkspace = false;
  el('workspace').hidden = true;
  el('home').hidden = false;
  paint();
  window.scrollTo(0, 0);
  el('call').focus({ preventScroll: true });
}
function first() {
  return Math.max(0, contacts.indexOf(waiting()[0]));
}
function openDot() {
  const q = waiting(),
    next = q[0];
  el('brief').textContent =
    q.length === 1
      ? 'Uma pessoa espera pela primeira resposta.'
      : q.length
        ? q.length + ' pessoas esperam pela primeira resposta.'
        : 'Todas as conversas receberam uma resposta.';
  el('nextName').textContent = next
    ? next.name + ' · há ' + next.wait + ' min'
    : 'Fila em dia';
  el('quote').textContent = next
    ? '“' + next.message + '”'
    : 'Você pode rever o histórico na central.';
  el('take').textContent = next
    ? 'Atender ' + next.name + ' →'
    : 'Ver conversas →';
  el('drawer').showModal();
}
el('call').onclick = () => {
  document.querySelector('[data-q="0"]').focus({ preventScroll: true });
  el('perguntas').scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
  });
};

document.querySelector('.dockDot').onclick = openDot;
el('closeDot').onclick = () => el('drawer').close();
el('take').onclick = () => {
  el('drawer').close();
  goDesk(first(), !!waiting().length);
};
document.querySelector('[data-home]').onclick = home;
document.querySelector('[data-queue]').onclick = () => goDesk(first(), false);
el('return').onclick = home;
el('toList').onclick = () => {
  el('desk').classList.remove('viewChat');
  el('workRows').querySelector('.active')?.focus();
};
el('draft').oninput = () => (contacts[active].draft = el('draft').value);
el('suggest').onclick = () => {
  const c = contacts[active];
  if (c.draft.trim())
    el('feedback').textContent =
      'Seu rascunho já tem texto. Você pode editá-lo antes de enviar.';
  else {
    c.draft = c.suggestion;
    c.suggested = true;
    paint();
  }
  el('draft').focus();
};
el('composer').onsubmit = (e) => {
  e.preventDefault();
  const c = contacts[active],
    t = c.draft.trim();
  if (!t) {
    el('draft').focus();
    return;
  }
  c.replies.push(t);
  c.draft = '';
  c.suggested = false;
  paint();
  el('feedback').textContent = 'Resposta enviada na demonstração.';
};
paint();

// Skin deformation is local to the face. Posture and the interface use independent timelines.
function createFace(img, canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  const vertex =
    'attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const fragment = `precision mediump float;
 varying vec2 uv;uniform sampler2D skin;uniform float gaze,blink,smile;
 vec2 eye(vec2 p,vec2 center){
  vec2 d=p-center;float w=exp(-dot(d/vec2(.072,.065),d/vec2(.072,.065))*1.7);
  return vec2(-gaze*.016*w,d.y*blink*4.5*w);
 }
 void main(){vec2 q=uv+eye(uv,vec2(.327,.545))+eye(uv,vec2(.64,.545));
 vec2 m=(uv-vec2(.49,.70))/vec2(.095,.06);
 q.y+=.015*smile*exp(-dot(m,m))*min(1.,abs(m.x)*2.);
 gl_FragColor=texture2D(skin,q);}`;
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const a = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, axis, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const params = ['gaze', 'blink', 'smile'].map((n) =>
    gl.getUniformLocation(prog, n),
  );
  canvas.hidden = false;
  img.style.visibility = 'hidden';
  canvas.addEventListener('webglcontextlost', () => {
    img.style.visibility = '';
    canvas.hidden = true;
  });
  return (g, b, s) => {
    gl.uniform1f(params[0], g);
    gl.uniform1f(params[1], b);
    gl.uniform1f(params[2], s);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

function createCanvasFace(img, original) {
  const canvas = document.createElement('canvas');
  canvas.className = original.className;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = canvas.height = 400;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  original.after(canvas);
  ctx.drawImage(img, 0, 0, 400, 400);
  const patches = [0.327, 0.64].map((x) => {
    const left = Math.round(x * 400) - 25,
      top = Math.round(0.545 * 400) - 22;
    return {
      left,
      top,
      src: ctx.getImageData(left, top, 50, 44),
      out: ctx.createImageData(50, 44),
    };
  });
  img.style.visibility = 'hidden';
  return (gaze, blink) => {
    for (const { left, top, src, out } of patches) {
      for (let y = 0; y < 44; y++)
        for (let x = 0; x < 50; x++) {
          const dx = x - 25,
            dy = y - 22;
          const radius = (dx / 25) ** 2 + (dy / 22) ** 2;
          const weight = Math.max(0, 1 - radius) ** 2;
          const sx = Math.max(
            0,
            Math.min(49, Math.round(x - gaze * 6 * weight)),
          );
          const sy = Math.max(
            0,
            Math.min(43, Math.round(y + blink * 4.5 * dy * weight)),
          );
          const dest = (y * 50 + x) * 4,
            sample = (sy * 50 + sx) * 4;
          for (let channel = 0; channel < 4; channel++)
            out.data[dest + channel] = src.data[sample + channel];
        }
      ctx.putImageData(out, left, top);
    }
  };
}
const portrait = document.querySelector('.portrait'),
  puppet = portrait.querySelector('.puppet'),
  ping = el('ping');
const motionPref = matchMedia('(prefers-reduced-motion: reduce)');
let drawFace,
  faceFrame = 0,
  posture,
  hideNote,
  autoMessage,
  inSight = false,
  arrivals = 0;
const skin = puppet.querySelector('img');
skin.decode().then(() => {
  const canvas = el('dotSkin');
  try {
    drawFace = createFace(skin, canvas);
  } catch {
    drawFace = null;
  }
  if (!drawFace) drawFace = createCanvasFace(skin, canvas);
  const render = drawFace;
  if (render) {
    let lastGaze, lastBlink, lastSmile;
    drawFace = (g, b, s) => {
      if (g === lastGaze && b === lastBlink && s === lastSmile) return;
      render(g, b, s);
      lastGaze = g;
      lastBlink = b;
      lastSmile = s;
    };
  }
  drawFace?.(0, 0, 0);
});

let idleFrame = 0,
  previousPaint = 0,
  idleTime = 0,
  idleLast = 0;
let nextBlink = 1.8,
  blinkStart = -1,
  gazeFrom = 0,
  gazeTarget = 0,
  glanceStart = 0,
  nextGlance = 0.75;
let reactionActive = false;
function idleAllowed() {
  return (
    inSight &&
    !document.hidden &&
    !el('drawer').open &&
    !inWorkspace &&
    !motionPref.matches &&
    !reactionActive
  );
}
function stopIdle() {
  cancelAnimationFrame(idleFrame);
  idleFrame = 0;
  idleLast = 0;
  puppet.style.transform = '';
}
function syncIdle() {
  if (!idleAllowed()) {
    stopIdle();
    if (!reactionActive) drawFace?.(0, 0, 0);
    return;
  }
  if (!idleFrame) idleFrame = requestAnimationFrame(waitingPose);
}
function waitingPose(now) {
  if (!idleAllowed()) {
    stopIdle();
    return;
  }
  idleTime += idleLast ? Math.min((now - idleLast) / 1000, 0.25) : 0;
  idleLast = now;
  if (now - previousPaint >= 25) {
    previousPaint = now;
    const breath = (1 - Math.cos((idleTime * 2 * Math.PI) / 4.3)) / 2;
    // The feet stay planted as the torso opens and the head lifts on the inhale.
    puppet.style.transform =
      'translateY(' +
      -0.6 * breath +
      '%) scale(' +
      (1 + 0.02 * breath) +
      ',' +
      (1 + 0.03 * breath) +
      ')';
    if (idleTime >= nextGlance) {
      gazeFrom = gazeTarget;
      gazeTarget = gazeTarget > 0.15 ? -0.7 : gazeTarget < -0.15 ? 0 : 0.76;
      glanceStart = idleTime;
      nextGlance = idleTime + 1.35 + Math.random() * 1.2;
    }
    const t = Math.min(1, (idleTime - glanceStart) / 0.24),
      ease = t * t * (3 - 2 * t);
    const gaze = gazeFrom + (gazeTarget - gazeFrom) * ease;
    if (idleTime >= nextBlink) {
      blinkStart = idleTime;
      nextBlink = idleTime + 3.1 + Math.random() * 2.1;
    }
    const dt = idleTime - blinkStart;
    const shut =
      dt < 0.09
        ? dt / 0.09
        : dt < 0.13
          ? 1
          : Math.max(0, 1 - (dt - 0.13) / 0.14);
    drawFace?.(gaze, shut, 0);
  }
  idleFrame = requestAnimationFrame(waitingPose);
}

const poses = {
  touch: [
    'scale(1)',
    'translateY(3%) scale(1.08,.90)',
    'translateY(-8%) rotate(-7deg) scale(1.07,1.12)',
    'translateY(-1%) rotate(4deg) scale(1.03,.98)',
    'translateY(-2%) rotate(-1deg) scale(1.025)',
    'scale(1)',
  ],
  message: [
    'scale(1)',
    'translate(-3%,3%) rotate(-7deg) scale(1.06,.94)',
    'translate(8%,-10%) rotate(13deg) rotateY(16deg) scale(.96,1.08)',
    'translate(6%,-4%) rotate(7deg) rotateY(12deg)',
    'translate(4%,-3%) rotate(5deg)',
    'scale(1)',
  ],
};
function react(event, notice) {
  const startPose = getComputedStyle(puppet).transform;
  reactionActive = !motionPref.matches;
  stopIdle();
  clearTimeout(hideNote);
  cancelAnimationFrame(faceFrame);
  posture?.cancel();
  portrait.dataset.event = event;
  ping.textContent = notice;
  ping.hidden = false;
  const duration = event === 'touch' ? 930 : 1300;
  if (!motionPref.matches) {
    posture = puppet.animate(
      poses[event].map((transform, i) => ({
        transform: i === 0 ? startPose : transform,
        offset: [0, 0.12, 0.35, 0.55, 0.76, 1][i],
        easing: 'cubic-bezier(.22,.72,.33,1)',
      })),
      duration,
    );
    ping.animate(
      [
        { opacity: 0, transform: 'translateY(7px) scale(.92)' },
        { opacity: 1, transform: 'translateY(-2px) scale(1.04)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 350 },
    );
    const start = performance.now();
    function expression(now) {
      const t = Math.min(1, (now - start) / duration);
      drawFace?.(
        (event === 'message' ? 1 : -0.45) * Math.sin(t * Math.PI),
        Math.max(0, 1 - Math.abs(t - 0.15) / 0.1),
        Math.sin(t * Math.PI),
      );
      if (t < 1) faceFrame = requestAnimationFrame(expression);
      else {
        reactionActive = false;
        syncIdle();
      }
    }
    faceFrame = requestAnimationFrame(expression);
  }
  hideNote = setTimeout(() => {
    ping.hidden = true;
    delete portrait.dataset.event;
  }, 2400);
}
const samples = [
  { name: 'Nina', message: 'Oi! Tem alguém disponível?', reply: 'Oi, Nina! Estou aqui. Como posso ajudar?', clip: 'nina' },
  { name: 'Davi', message: 'Posso tirar uma dúvida rápida?', reply: 'Oi, Davi! Claro, pode mandar sua pergunta.', clip: 'davi' },
  { name: 'Lia', message: 'Quero falar com a equipe.', reply: 'Oi, Lia! Vou chamar alguém da equipe pra continuar com você.', clip: 'lia' },
];
const voicePlayer = new Audio();
voicePlayer.preload = 'none';
let voiceEnabled = false;
let voiceRequest = 0;
let replyTimer;

function setVoice(enabled) {
  voiceEnabled = enabled;
  el('voiceToggle').setAttribute('aria-pressed', String(enabled));
  el('voiceToggle').textContent = enabled ? 'Desligar voz' : 'Ouvir o Dot';
  el('voiceStatus').textContent = '';
  if (!enabled) {
    voiceRequest++;
    voicePlayer.pause();
  }
}

function speak(clip) {
  if (!voiceEnabled || document.hidden) return;
  const request = ++voiceRequest;
  voicePlayer.src = '/dot-voz/' + clip + '.mp3';
  voicePlayer.play().catch(() => {
    if (request !== voiceRequest) return;
    setVoice(false);
    el('voiceStatus').textContent = 'Áudio indisponível. Toque em Ouvir o Dot para tentar de novo.';
  });
}

el('voiceToggle').onclick = () => {
  setVoice(!voiceEnabled);
  if (voiceEnabled) speak('ola');
};
function silenceWhenHidden() {
  if (document.hidden) setVoice(false);
}
document.addEventListener('visibilitychange', silenceWhenHidden);
window.addEventListener('pagehide', () => setVoice(false));

function receiveMessage() {
  clearTimeout(autoMessage);
  clearTimeout(replyTimer);
  const sample = samples[arrivals % samples.length];
  arrivals++;
  react('message', sample.name + ' mandou uma mensagem');
  el('sender').textContent = sample.name;
  el('incomingText').textContent = sample.message;
  el('dotResponse').hidden = true;
  el('heroExchange').hidden = false;
  replyTimer = setTimeout(() => {
    el('replyText').textContent = sample.reply;
    el('dotResponse').hidden = false;
    speak(sample.clip);
  }, 750);
}
portrait.onclick = () => {
  react('touch', 'Tô aqui!');
  speak('toque');
  if (!arrivals) scheduleMessage();
};
el('simulate').onclick = receiveMessage;
function scheduleMessage() {
  syncIdle();
  clearTimeout(autoMessage);
  if (
    !arrivals &&
    inSight &&
    !inWorkspace &&
    !document.hidden &&
    !el('drawer').open
  )
    autoMessage = setTimeout(receiveMessage, 5500);
}
new IntersectionObserver(
  ([entry]) => {
    inSight = entry.isIntersecting;
    scheduleMessage();
  },
  { threshold: 0.55 },
).observe(portrait);
document.addEventListener('visibilitychange', scheduleMessage);
el('drawer').addEventListener('close', scheduleMessage);
new MutationObserver(scheduleMessage).observe(el('drawer'), {
  attributes: true,
  attributeFilter: ['open'],
});
motionPref.addEventListener('change', () => {
  if (motionPref.matches) {
    posture?.cancel();
    cancelAnimationFrame(faceFrame);
    reactionActive = false;
    drawFace?.(0, 0, 0);
  }
  syncIdle();
});

const questions = [
  [
    'Quem precisa de mim agora?',
    () => {
      const next = waiting()[0];
      return next
        ? 'A conversa de ' +
            next.name +
            ' é a mais antiga sem resposta. Comece por ela.'
        : 'Sua equipe já respondeu a todas as conversas.';
    },
  ],
  [
    'Quando a equipe entra?',
    () =>
      'Quando o cliente precisa de uma pessoa, você abre a conversa na central e responde pelo mesmo número.',
  ],
  [
    'Como conecto meu WhatsApp?',
    () =>
      'Abra o QR na central e escaneie com o WhatsApp do celular. Veja o passo a passo logo abaixo.',
  ],
];
function chooseQuestion(i) {
  el('question').textContent = questions[i][0];
  el('answer').textContent = questions[i][1]();
  document
    .querySelectorAll('[data-q]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.q) === i)),
    );
}
for (const b of document.querySelectorAll('[data-q]'))
  b.onclick = () => chooseQuestion(Number(b.dataset.q));
const headDot = new Image();
headDot.alt = '';
headDot.src = skin.src;
document.querySelector('.dialogDemo header strong').prepend(headDot);
chooseQuestion(0);

const ctx = el('pattern').getContext('2d');
ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, 100, 100);
ctx.fillStyle = '#36203c';
for (let y = 0; y < 25; y++)
  for (let x = 0; x < 25; x++) {
    if ((x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16)) continue;
    if ((x * 13 + y * 7 + x * y * 5) % 17 < 8) ctx.fillRect(x * 4, y * 4, 4, 4);
  }
for (const [x, y] of [
  [0, 0],
  [72, 0],
  [0, 72],
]) {
  ctx.fillStyle = '#36203c';
  ctx.fillRect(x, y, 28, 28);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 4, y + 4, 20, 20);
  ctx.fillStyle = '#36203c';
  ctx.fillRect(x + 8, y + 8, 12, 12);
}
const activationSteps = [
  { caption: 'O código aparece na central.', duration: 1100 },
  { caption: 'O celular lê o QR Code.', duration: 1750 },
  { caption: 'Número conectado ao WhatsApp.', duration: 1300 },
  { caption: 'Dani enviou a primeira mensagem.', duration: 2100 },
  { caption: 'A equipe respondeu pelo WhatsApp.' },
];

function showPhase(phase) {
  const step = activationSteps[phase];
  el('theater').dataset.phase = phase;
  el('phaseText').textContent = step.caption;
  if (step.duration) {
    setTimeout(() => showPhase(phase + 1), step.duration);
    return;
  }
  el('playQR').disabled = false;
  el('playQR').textContent = 'Ver de novo ↻';
}

el('playQR').onclick = () => {
  el('playQR').disabled = true;
  el('playQR').textContent = 'Demonstração em andamento';
  if (matchMedia('(max-width: 700px)').matches) {
    el('theater').scrollIntoView({
      block: 'nearest',
      behavior: motionPref.matches ? 'instant' : 'smooth',
    });
  }
  showPhase(0);
};
