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

## Agentes e voz no Windows

O conector usa o Ollama em loopback, com o modelo local definido em `ATENDA_AGENT_MODEL` (padrão `qwen3:8b`). A equipe pode testar um perfil em **Testar IA** ou pedir uma sugestão em **Conversas** e revisar o texto antes do envio. As preferências dos agentes continuam vinculadas ao navegador da conta.

Para transcrição local, instale as dependências de `gateway/requirements-voz.txt` em um ambiente Python 3.12 em `%LOCALAPPDATA%\Atenda\voz-venv`. Em `atendimento.env`, defina `ATENDA_WHISPER_MODEL` com o caminho do modelo multilíngue local no formato faster-whisper. Ao abrir uma conversa cuja última mensagem é uma nota de voz recebida, o conector transcreve o áudio. Para as mensagens anteriores, use **Transcrever**. O áudio original pode ser ouvido em **Ouvir áudio**. O conector consulta o arquivo da sessão e da mensagem no Windows.
