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

Com `OPENAI_API_KEY` no servidor do portal, as sugestões passam ao `gpt-6-luna`, via Responses API. O teste do agente roda na nuvem; nas conversas a IA recebe contexto do canal vinculado. O dono do canal e os assinantes com uma mensalidade vigente podem testar perfis; o piloto de WhatsApp ainda vincula uma conta a um canal. No conector, a mesma variável habilita a transcrição `gpt-transcribe`. Sem chave, o piloto existente identifica o motor local na tela. Em um host Linux com o gateway exposto apenas em loopback na porta 38741, configure `ATENDA_STATE_DIR` (persistente) e `ATENDA_MEDIA_DIR` (mídia do WA-AKG) para o conector.

O conector usa o Ollama em loopback, com o modelo local definido em `ATENDA_AGENT_MODEL` (padrão `qwen3:8b`). A equipe pode testar um perfil em **Testar IA** ou pedir uma sugestão em **Conversas** e revisar o texto antes do envio. As preferências dos agentes continuam vinculadas ao navegador da conta.

Para transcrição local, instale as dependências de `gateway/requirements-voz.txt` em um ambiente Python 3.12 em `%LOCALAPPDATA%\Atenda\voz-venv`. Em `atendimento.env`, defina `ATENDA_WHISPER_MODEL` com o caminho do modelo multilíngue local no formato faster-whisper. Ao abrir uma conversa cuja última mensagem é uma nota de voz recebida, o conector transcreve o áudio. Para as mensagens anteriores, use **Transcrever**. O áudio original pode ser ouvido em **Ouvir áudio**. O conector consulta o arquivo da sessão e da mensagem no Windows.

## Atendimento automático com o portal fechado

Em Administração → Luna na nuvem, o proprietário pode validar e salvar a chave do projeto OpenAI. A validação usa uma mensagem sintética. A chave fica cifrada em Blob privado e a API administrativa devolve somente o estado. Preserve o segredo do conector ao migrar a instalação.

Em WhatsApp → Respostas automáticas com Luna, publique o agente responsável pelo número. O conector grava o perfil em seu volume persistente e atende as novas mensagens privadas a partir da ativação. Pedidos de atendimento humano e os termos do perfil passam a conversa à equipe. Em Conversas, “retome com o agente” libera as próximas mensagens. Um envio com confirmação incerta fica para conferência no histórico. A tela WhatsApp informa o host em uso e o último erro do ciclo.

Para hospedar o número em uma VPS Linux com Docker Compose, use `gateway/compose.yaml`. O portal continua na Vercel. O banco, as credenciais de pareamento, as mídias e o estado do atendimento têm volumes próprios. Configure as variáveis do Compose em um arquivo privado fora do repositório. Para as senhas MySQL, use valores aleatórios em hexadecimal, adequados para a URL do banco. Em uma instalação nova, inicie primeiro `db gateway`; o painel do WA-AKG escuta apenas no loopback da VPS na porta 38741 e pode ser acessado por túnel SSH. Crie a sessão e a chave do WA-AKG, configure `WA_AKG_API_KEY` e inicie `atendimento`. O painel do portal e o conector usam o mesmo `WA_BRIDGE_SECRET`, projeto Supabase e conta proprietária. A imagem do conector inclui o conversor para transcrever notas de voz com a chave do portal.

Para migrar uma sessão existente, faça backup do MySQL, de `data/auth`, das mídias e de `atendimento.sqlite`. Durante o corte, pare o supervisor do Windows e o gateway antes da cópia final consistente. Restaure esses dados na VPS com a mesma sessão, as mesmas credenciais e permissões de leitura e escrita para os serviços. Mantenha apenas um conector ativo por instalação. Confirme a conexão e teste uma conversa pelo número migrado antes de desativar definitivamente a instalação anterior.

## Assinaturas da Atenda

O checkout em **Assinatura** usa Supabase Auth e Vercel Blob privado. O servidor calcula R$ 490 por mês, mais R$ 190 por agente adicional contratado. A escolha no simulador de equipe é independente da assinatura cobrada. Use as variáveis de `.env.example` apenas no servidor. O modo padrão é `sandbox`; produção exige `BILLING_ENV=production` e credenciais de produção. A conta PJ recebedora e os contratos do estabelecimento precisam estar habilitados.

**Pix Automático Sicredi.** Use os endereços de token e de API Pix do ambiente e da versão informados pela cooperativa. O cliente OAuth usa certificado e chave PEM em Base64, conta e agência recebedoras. Os escopos são `rec.read rec.write cobr.read cobr.write payloadlocationrec.read payloadlocationrec.write` (ajustáveis por `SICREDI_PIX_SCOPES`). A autorização utiliza a jornada 2. O primeiro vencimento ocorre oito dias após a adesão. O cron diário protegido por `CRON_SECRET` consulta a autorização, agenda cada competência por um txid determinístico e consulta a liquidação. A resposta do banco é a fonte do estado. Monitore falhas do cron e reprocesse com GET autenticado em `/api/billing-cron`; cobranças fora da janela ficam registradas para conferência.

**Cartão.** A opção Lyra/PayZen para associados Sicredi requer credenciamento e recorrência com token. Configure o identificador da loja, chave de assinatura HMAC-SHA-256, senha REST do mesmo ambiente e origem pública HTTPS. No Back Office, habilite notificações de autorização, cancelamento, atualização de transações e parcelas recorrentes para `/api/billing?action=card-notification`. A Atenda assina a ordem; o cliente autoriza o cartão na página segura do processador. Somente notificações assinadas atualizam as parcelas. O retorno do navegador abre o portal. A primeira parcela é imediata, e a data das seguintes é limitada ao dia 28 para cobrir meses curtos.

Antes de disponibilizar cobranças reais, valide os dois fluxos no ambiente de homologação do estabelecimento: autorização, recebimento da primeira e da segunda parcelas, recusa, reentrega de notificações e cancelamento.
