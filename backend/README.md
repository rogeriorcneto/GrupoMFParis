# CRM MF Paris — Bot WhatsApp + Email

Backend Node.js que conecta WhatsApp e Email ao CRM Grupo MF Paris.

## Requisitos

- **Node.js** 18+ (já instalado no seu PC)
- **Supabase** (mesmo projeto do frontend)

## Instalação

```bash
cd backend
npm install
```

## Configuração

1. Copie o arquivo de exemplo:
```bash
copy env.example .env
```

2. Preencha o `.env`:
```env
SUPABASE_URL=https://zeaeppmnetdhzwwdydmq.supabase.co
SUPABASE_ANON_KEY=<mesma chave do frontend/.env (VITE_SUPABASE_ANON_KEY)>
BOT_PORT=3001
CORS_ORIGINS=http://localhost:5173,http://localhost:4173
```

### Email (opcional)

Para habilitar envio de emails, adicione ao `.env`:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu@email.com
EMAIL_PASS=xxxx xxxx xxxx xxxx
EMAIL_FROM=Grupo MF Paris <seu@email.com>
```

**Como gerar a Senha de App do Gmail:**
1. Acesse https://myaccount.google.com/security
2. Ative a **Verificação em 2 etapas** (se não tiver)
3. Volte em Segurança → **Senhas de app**
4. Crie uma senha para "Outro (nome personalizado)" → "CRM MF Paris"
5. Copie a senha de 16 caracteres para `EMAIL_PASS`

## Executar

```bash
npm run dev
```

O bot inicia e:
1. Sobe o servidor Express na porta 3001
2. Tenta conectar ao WhatsApp (se já tiver sessão salva)
3. Se não tiver sessão, aguarda o frontend pedir conexão

## Conectar WhatsApp

1. Abra o CRM no navegador (http://localhost:5173)
2. Vá em **Integrações**
3. Clique em **Conectar WhatsApp**
4. Escaneie o QR Code com o celular:
   - WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo
5. Pronto! O bot está ativo.

## Comandos do Bot

Os vendedores enviam mensagens para o número conectado:

| Comando | Ação |
|---------|------|
| `login email senha` | Fazer login no CRM |
| `1` ou `clientes` | Listar meus clientes |
| `2` ou `novo` | Cadastrar novo cliente |
| `3` ou `venda` | Registrar uma venda |
| `4` ou `tarefas` | Ver minhas tarefas |
| `5` ou `pipeline` | Resumo do pipeline |
| `6` ou `buscar` | Buscar cliente |
| `menu` | Voltar ao menu |
| `0` ou `sair` | Deslogar |

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status geral do bot |
| GET | `/api/whatsapp/status` | Status da conexão WhatsApp |
| GET | `/api/whatsapp/qr` | QR Code (base64) |
| POST | `/api/whatsapp/connect` | Iniciar conexão |
| POST | `/api/whatsapp/disconnect` | Desconectar |
| GET | `/api/email/status` | Status do email |
| POST | `/api/email/test` | Testar conexão SMTP |
| POST | `/api/email/send` | Enviar email |
| POST | `/api/email/send-template` | Enviar com template |

## Produção — Railway (recomendado)

Railway é a forma mais simples de rodar o backend 24/7 (~$5/mês).

### Primeiro deploy

```bash
# 1. Instalar Railway CLI (uma vez)
npm install -g @railway/cli

# 2. Login
railway login

# 3. Dentro da pasta backend
cd backend

# 4. Criar projeto
railway init
# Escolha "Empty Project", dê um nome (ex: crm-mfparis-backend)

# 5. Deploy
railway up
```

### Variáveis de ambiente no Railway

Acesse o painel Railway → seu projeto → "Variables" e adicione:

| Variável | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://zeaeppmnetdhzwwdydmq.supabase.co` |
| `SUPABASE_ANON_KEY` | `<chave anon do Supabase>` |
| `CORS_ORIGINS` | `https://<seu-app>.netlify.app` |
| `EMAIL_HOST` | `smtp.gmail.com` (opcional) |
| `EMAIL_USER` | `seu@gmail.com` (opcional) |
| `EMAIL_PASS` | `xxxx xxxx xxxx xxxx` (App Password do Gmail) |

> **Nota**: `PORT` é definido automaticamente pelo Railway.

### Configurar o frontend (Netlify)

No painel Netlify → Site → "Environment variables":
```
VITE_BOT_URL = https://seu-app.railway.app
```

Após adicionar, faça um novo deploy no Netlify para a variável ter efeito.

### Redeploy

```bash
cd backend
railway up
```

### Conectar WhatsApp em produção

1. Acesse `https://seu-app.railway.app/api/health` para confirmar que o serviço está rodando
2. Vá em **Integrações** no CRM → seção WhatsApp → clique "Conectar"
3. Escaneie o QR Code que aparece com o WhatsApp do celular
4. A sessão fica salva no Railway — reconecta automaticamente

### Verificar logs

```bash
railway logs
# ou no painel Railway → seu projeto → "Deployments" → "View Logs"
```

### Outras opções
- **Render** (~$7/mês) — similar ao Railway
- **DigitalOcean App** (~$6/mês) — mais configuração necessária

## Estrutura

```
backend/
├── src/
│   ├── index.ts           ← Servidor Express + rotas API
│   ├── config.ts          ← Variáveis de ambiente
│   ├── supabase.ts        ← Cliente Supabase
│   ├── database.ts        ← Funções CRUD (mesmo banco do frontend)
│   ├── whatsapp.ts        ← Conexão Baileys, QR, reconexão
│   ├── email.ts           ← Nodemailer SMTP
│   ├── session.ts         ← Sessões dos vendedores por nº WhatsApp
│   ├── bot.ts             ← Router central de mensagens
│   └── handlers/
│       ├── auth.ts        ← Login/logout
│       ├── menu.ts        ← Menu principal
│       ├── clientes.ts    ← CRUD de clientes
│       ├── vendas.ts      ← Registrar pedidos
│       ├── tarefas.ts     ← Tarefas do dia
│       └── pipeline.ts    ← Resumo do funil
├── auth_info/             ← Sessão WhatsApp (gitignored)
├── package.json
├── tsconfig.json
└── env.example            ← Template do .env
```
