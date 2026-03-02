# Runbook de Deploy — CRM MF Paris

## Checklist pré-deploy

```bash
# 1. TypeScript
cd frontend && npx tsc --noEmit
cd ../backend && npm run typecheck

# 2. Testes
cd ../frontend && npm test        # deve ser 294/294
cd ../backend && npm test          # deve ser 83/83

# 3. Build de produção
cd ../frontend && npm run build    # deve terminar sem erros
```

Se qualquer etapa falhar, **não faça deploy**.

---

## Deploy Frontend (Netlify)

1. Push para `main` → Netlify faz deploy automático
2. Acompanhar em https://app.netlify.com → "Deploys"
3. Verificar preview URL antes de promover para produção

**Variáveis de ambiente obrigatórias no Netlify:**
| Variável | Valor |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://zeaeppmnetdhzwwdydmq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `<chave anon do Supabase>` |
| `VITE_BOT_URL` | `https://<seu-app>.railway.app` |

---

## Deploy Backend (Railway)

### Primeiro deploy
```bash
# Instalar Railway CLI (uma vez)
npm install -g @railway/cli

# Login
railway login

# Dentro da pasta backend
cd backend
railway init          # cria novo projeto
railway up            # faz deploy
```

### Persistir sessão WhatsApp entre redeploys (obrigatório)

Por padrão o Railway usa filesystem efêmero — a sessão WhatsApp (`auth_info/`) é perdida a cada deploy, exigindo novo scan do QR.

**Solução: Volume Railway**

1. Acesse o painel Railway → seu projeto → "Volumes"
2. Clique **"Add Volume"**
3. Configure:
   - **Mount path**: `/app/backend/auth_info`
   - **Name**: `whatsapp-session`
4. Clique **"Deploy"** para aplicar

A partir daí, o WhatsApp se reconecta automaticamente após redeployments sem precisar escanear o QR novamente.

> **Nota**: Certifique-se que o `Dockerfile` (ou o start command) do Railway aponta para a pasta correta. Se usar `railway up` direto, o mount path deve ser relativo ao `WORKDIR` do container.

### Redeploy
```bash
cd backend
railway up
```

**Variáveis de ambiente obrigatórias no Railway:**
| Variável | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://zeaeppmnetdhzwwdydmq.supabase.co` |
| `SUPABASE_ANON_KEY` | `<mesma chave anon do frontend>` |
| `CORS_ORIGINS` | `https://<seu-app>.netlify.app` |
| `PORT` | `3001` (Railway define automaticamente) |
| `EMAIL_HOST` | `smtp.gmail.com` (opcional) |
| `EMAIL_USER` | `seu@email.com` (opcional) |
| `EMAIL_PASS` | `xxxx xxxx xxxx xxxx` (opcional) |

---

## Validação pós-deploy

### Frontend
- [ ] Abre sem erro de console
- [ ] Login funciona (`rafael@mfparis.com.br`)
- [ ] Funil carrega clientes
- [ ] Criar cliente → aparece no funil

### Backend
```bash
curl https://<seu-app>.railway.app/api/health
# Deve retornar: {"status":"ok","whatsapp":{...},"email":{...},"uptime":...}
```

- [ ] `/api/health` retorna `status: ok`
- [ ] Integrações no CRM → status WhatsApp visível

---

## Rollback

### Frontend
- Netlify → Deploys → clicar no deploy anterior → "Publish deploy"

### Backend
```bash
# Railway mantém histórico de deployments
railway rollback
```

---

## Monitoramento

- **Frontend uptime**: Netlify status page
- **Backend uptime**: configurar UptimeRobot em `https://<seu-app>.railway.app/api/health` (check a cada 5min)
- **Erros**: pino logs no Railway → "Logs" tab
