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

## Produção

Para rodar 24/7, suba o backend em um serviço como:
- **Railway** (~$5/mês) — `railway up`
- **Render** (~$7/mês)
- **DigitalOcean App** (~$6/mês)

Configure `VITE_BOT_URL` no frontend (Netlify) apontando para a URL do serviço.

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
