# Atenda
Portal de agentes com pareamento WhatsApp via WA-AKG. Backend de piloto com uma sessão e um operador por instalação. O atendimento de teste usa dados do navegador. Configurações, integrações e Meu painel usam contas autenticadas e armazenamento privado.
## Iniciar
Com Node 22+, execute npm ci e copie .env.example para .env. Configure a URL de origem da sua instalação WA-AKG, sua chave de API, um identificador de sessão exclusivo e uma senha forte do painel. Rode:
```
node --env-file=.env server.mjs
```
Abra http://127.0.0.1:8140 com o usuário atenda e a senha definida. Em WhatsApp, consulte a sessão e clique em Gerar QR Code. Escaneie pelo menu Aparelhos conectados do telefone. O painel verifica a sessão a cada cinco segundos enquanto aguarda o pareamento. Para acesso remoto, use proxy reverso com HTTPS. Abrir apenas o HTML mantém a demonstração offline.

## Área da empresa
As telas Configurações, Integrações e Meu painel usam Supabase Auth (SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY) e um Vercel Blob privado (BLOB_READ_WRITE_TOKEN). Cada conta tem seu próprio espaço. Cadastros e alterações de senha seguem a configuração de e-mail do projeto Supabase. Pagamentos são lançamentos manuais. Arquivos de até 2 MB são baixados mediante autenticação.

Para integrar uma API HTTPS, configure a busca GET, o parâmetro de consulta e/ou o cadastro POST com JSON. Defina a autenticação e conceda as operações por agente. Na tela Integrações use o agente selecionado ou abra Testar no cartão do agente. O comando buscar abre a consulta e cadastrar abre o formulário para revisão. Cadastros utilizam Idempotency-Key quando o destino oferece suporte.
