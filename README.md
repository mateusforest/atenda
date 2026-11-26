# Atenda
Portal de agentes com pareamento WhatsApp via WA-AKG. Backend de piloto com uma sessão e um operador por instalação. As demais áreas continuam em demonstração local.
## Iniciar
Com Node 22+, copie .env.example para .env. Configure a URL de origem da sua instalação WA-AKG, sua chave de API, um identificador de sessão exclusivo e uma senha forte do painel. Rode:
```
node --env-file=.env server.mjs
```
Abra http://127.0.0.1:8140 com o usuário atenda e a senha definida. Em WhatsApp, consulte a sessão e clique em Gerar QR Code. Escaneie pelo menu Aparelhos conectados do telefone. O painel verifica a sessão a cada cinco segundos enquanto aguarda o pareamento. Para acesso remoto, use proxy reverso com HTTPS. Abrir apenas o HTML mantém a demonstração offline.
