# Relatório de Gastos - CRM MF Paris

## 📊 Resumo Mensal Estimado

| Categoria | Serviço | Custo Mensal (USD) | Custo Mensal (BRL) |
|-----------|---------|-------------------|-------------------|
| **Hospedagem** | Railway (Backend) | $5-20 | R$ 25-100 |
| **Banco de Dados** | Supabase (Plano Pro) | $25 | R$ 125 |
| **Comunicação** | Twilio (WhatsApp) | $5-15 | R$ 25-75 |
| **Domínio** | (se houver) | $10-15 | R$ 50-75 |
| **TOTAL ESTIMADO** | | **$45-75** | **R$ 225-375** |

---

## 💾 Serviços e Dependências

### Frontend (React/Vite)
**Custo: Gratuito** (desenvolvimento e hospedagem estática)

Dependências principais:
- React 18.2.0 (gratuito)
- Vite 4.1.0 (gratuito)
- TypeScript 5.6.0 (gratuito)
- TailwindCSS 3.2.7 (gratuito)
- Recharts 3.7.0 (gratuito)
- jsPDF 4.2.1 (gratuito)

### Backend (Node.js/Express)
**Custo: Railway $5-20/mês** (dependendo do plano)

Dependências principais:
- Express 4.21.0 (gratuito)
- Baileys 6.7.16 (gratuito - WhatsApp)
- Twilio 5.13.0 (gratuito - SDK, cobrança por uso)
- Supabase 2.97.0 (gratuito - SDK)
- Nodemailer 6.9.16 (gratuito)

---

## 🗄️ Supabase (Banco de Dados)

### Plano Pro - $25/mês
- **Armazenamento**: 100GB
- **Transferência**: 500GB/mês
- **Conexões**: Ilimitadas
- **Backup**: Automático diário
- **Funções Edge**: 500k execuções/mês

### Uso estimado:
- Clientes: ~1.000 registros
- Pedidos: ~5.000 registros
- Propostas: ~10.000 registros
- Armazenamento utilizado: ~50MB (< 1% do limite)

---

## 📱 Twilio (WhatsApp)

### Custos por uso:
- **Conversas iniciadas**: $0.005 por mensagem
- **Conversas ongoing**: $0.003 por mensagem (24h)
- **Número de telefone**: $1.15/mês

### Estimativa mensal:
- 500 mensagens iniciadas: $2.50
- 2.000 mensagens ongoing: $6.00
- Número WhatsApp: $1.15
- **Total**: ~$9.65/mês

---

## 🚂 Railway (Hospedagem Backend)

### Plano escolhido:
- **Hobby**: $5/mês (512MB RAM, 1 CPU)
- **Starter**: $10/mês (1GB RAM, 1 CPU)
- **Pro**: $20/mês (2GB RAM, 2 CPUs)

### Recursos necessários:
- Node.js runtime
- Integração Omie API
- WhatsApp bot
- Email service
- Logs e monitoramento

---

## 💰 Custos Anuais Estimados

| Serviço | Mensal | Anual |
|---------|--------|-------|
| Railway | $10 | $120 |
| Supabase | $25 | $300 |
| Twilio | $10 | $120 |
| Domínio | $12 | $144 |
| **TOTAL** | **$57** | **$684** |

---

## 📈 Possíveis Otimizações

### Redução de Custos:
1. **Twilio**: Usar webhook mais eficiente para reduzir mensagens
2. **Railway**: Migrar para plano Hobby se o desempenho for suficiente
3. **Supabase**: Monitorar uso real e considerar plano Starter ($20/mês)

### Custos Variáveis:
- **Twilio**: Aumenta com volume de mensagens WhatsApp
- **Railway**: Aumenta se precisar de mais CPU/RAM
- **Supabase**: Aumenta se ultrapassar limites de armazenamento

---

## 🎯 Recomendações

### Para manter custos baixos:
1. Monitorar uso do Twilio mensalmente
2. Otimizar queries no Supabase
3. Limpar logs antigos no Railway
4. Considerar plano anual para descontos

### Custos não inclusos:
- Desenvolvimento/manutenção (se terceirizado)
- Licenças de software adicional
- Integrações pagas (ex: Omie - se houver)
- Marketing e aquisição de clientes

---

## 📅 Data do Relatório
Gerado em: 14 de abril de 2026
Próxima atualização recomendada: 14 de maio de 2026
