# Grupo MF Paris — CRM de Vendas

Sistema CRM completo para gestão de vendas B2B da MF Paris, com funil de vendas, automações, bot WhatsApp e integração por email.

## Arquitetura

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│    Frontend      │────▶│     Backend      │────▶│   Supabase   │
│  React + Vite    │     │  Express + Bot   │     │  PostgreSQL  │
│   (Netlify)      │     │   (Railway)      │     │  Auth + RLS  │
└─────────────────┘     └──────────────────┘     └──────────────┘
                               │
                         ┌─────┴──────┐
                         │  WhatsApp  │
                         │ (Baileys)  │
                         └────────────┘
```

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, TypeScript, Vite 4, TailwindCSS 3, Recharts |
| Backend | Node.js, Express 4, TypeScript |
| Bot WhatsApp | @whiskeysockets/baileys |
| Email | Nodemailer (SMTP) |
| Banco de dados | Supabase (PostgreSQL + Auth + RLS) |
| Logger | pino (backend), logger condicional (frontend) |
| Testes | Vitest |
| Deploy | Netlify (frontend), Railway/Render (backend) |

## Quick Start

### 1. Clone e instale

```bash
git clone <repo-url>

# Frontend
cd frontend
npm install
cp .env.example .env
# Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# Backend
cd ../backend
npm install
copy env.example .env
# Preencha SUPABASE_ANON_KEY
```

### 2. Rode

```bash
# Terminal 1 — Frontend
cd frontend
npm run dev          # http://localhost:5173

# Terminal 2 — Backend
cd backend
npm run dev          # http://localhost:3001
```

### 3. Acesse

- Abra http://localhost:5173
- Login: `rafael@mfparis.com.br` (gerente)
- Para conectar WhatsApp: Integrações → Conectar WhatsApp → Escanear QR

## Banco de Dados (Supabase)

| Tabela | Descrição |
|--------|-----------|
| `vendedores` | Equipe de vendas (gerente, vendedor, SDR) |
| `clientes` | Leads e clientes B2B |
| `historico_etapas` | Jornada do cliente no funil |
| `interacoes` | Emails, ligações, WhatsApp, reuniões |
| `tarefas` | Follow-ups e agenda de atividades |
| `produtos` | Catálogo de produtos MF Paris |
| `pedidos` | Pedidos de venda |
| `itens_pedido` | Itens dos pedidos |
| `templates` | Templates de email por etapa do funil |
| `templates_msgs` | Templates de mensagens (prospecção) |
| `cadencias` | Cadências de automação |
| `cadencia_steps` | Passos de cada cadência |
| `campanhas` | Campanhas de automação ativas |
| `jobs_automacao` | Jobs agendados de envio automático |
| `atividades` | Log de atividades da equipe |
| `notificacoes` | Notificações do sistema |
| `bot_config` | Configurações do bot (email SMTP, etc.) |

## Testes

```bash
# Frontend (Vitest)
cd frontend
npm test

# Backend (Vitest)
cd backend
npm test
```

## Estrutura

```
gm-paris/
├── frontend/               # React + Vite
│   ├── src/
│   │   ├── App.tsx         # Orquestrador principal
│   │   ├── components/     # Views: Dashboard, Funil, Clientes, etc.
│   │   ├── hooks/          # useNotificacoes, useRealtimeSubscription, etc.
│   │   ├── lib/            # database.ts, supabase.ts, botApi.ts
│   │   ├── utils/          # logger.ts, constants.ts
│   │   ├── types/          # Interfaces TypeScript
│   │   └── __tests__/      # Testes unitários
│   ├── .env.example
│   └── package.json
├── backend/                # Express + Bot WhatsApp
│   ├── src/
│   │   ├── index.ts        # Servidor Express + rotas API
│   │   ├── bot.ts          # Router central de mensagens
│   │   ├── whatsapp.ts     # Conexão Baileys
│   │   ├── email.ts        # Nodemailer SMTP
│   │   ├── logger.ts       # pino structured logging
│   │   ├── session.ts      # Sessões WhatsApp
│   │   ├── handlers/       # auth, clientes, vendas, tarefas, pipeline
│   │   ├── middleware/      # auth, rate-limit
│   │   └── __tests__/      # Testes unitários
│   ├── env.example
│   ├── README.md           # Docs detalhadas do bot
│   └── package.json
└── README.md               # Este arquivo
```

> Para documentação detalhada do bot WhatsApp e API endpoints, veja [`backend/README.md`](backend/README.md).

## Licença

© 2026 Grupo MF Paris — Uso interno.
