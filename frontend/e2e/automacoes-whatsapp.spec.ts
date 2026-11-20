import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

const FAKE_QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * E2E completo — Todas as Automações (criando do zero e disparando) + WhatsApp (Integrações + Vendedor + Persistência no Reload)
 * 100% em ambiente isolado: nenhum cliente real nem o Omie recebem disparos.
 */
test('Automações (Criar do zero, Automação Tarefas, Mensagens Auto, Disparo em Massa) + WhatsApp (QR, Chat e Persistência no F5)', async ({ page }) => {
  const hoje = new Date().toISOString().split('T')[0]
  let disconnectCalls = 0
  let bulkCalls = 0
  let execManualCalls = 0
  let waSentMessages: Array<{ number: string; text: string }> = []

  const automacoesDb: any[] = []
  const regrasTarefasDb: any[] = []
  const mensagensAutoDb: any[] = [
    {
      id: 1,
      nome: 'Aviso de amostra liberada',
      ativa: true,
      gatilho: 'substatus',
      condicoes: { subStatus: 'liberada' },
      config: { canal: 'whatsapp', usarIA: false, mensagemFixa: 'Sua amostra foi liberada!' },
    },
  ]
  const tarefasDb: any[] = []

  const clientesDb: Record<string, any>[] = [
    {
      id: 9501,
      razao_social: 'CLIENTE AUTOMACAO ATIVO LTDA',
      cnpj: '12.345.678/0001-99',
      contato_nome: 'Marcos Compras',
      contato_celular: '31998887766',
      contato_telefone: '31998887766',
      whatsapp: '5531998887766',
      contato_email: 'marcos@automacao.com.br',
      etapa: 'prospecção',
      ciclo_numero: 1,
      vendedor_id: 1,
      arquivado_duplicata: false,
      empresa_funil_id: 9501,
      data_entrada_etapa: hoje,
    },
    {
      id: 9502,
      razao_social: 'FICHA DUPLICADA ARQUIVADA LTDA',
      cnpj: '12.345.678/0001-99',
      whatsapp: '5531998887766',
      contato_email: 'dup@automacao.com.br',
      etapa: 'proposta',
      ciclo_numero: 1,
      vendedor_id: 1,
      arquivado_duplicata: true,
      card_principal_id: 9501,
      data_entrada_etapa: hoje,
    },
  ]

  // Aceitar alerts/confirms nativos automaticamente
  page.on('dialog', async d => {
    await d.accept('')
  })

  // ── Mocks de WhatsApp (Global + Vendedor) ──
  await page.route('**/api/whatsapp/status', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false, status: 'qr', number: null, uptime: 0 }) })
  })
  await page.route('**/api/whatsapp/qr', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ qr: FAKE_QR, status: 'qr' }) })
  })
  await page.route('**/api/whatsapp/user/sessions', async r => {
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ connected: true, status: 'connected', number: '5531999990000', uptime: 120, vendedorId: 1 }]),
    })
  })
  await page.route('**/api/whatsapp/user/status', async r => {
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: true, status: 'connected', number: '5531999990000', uptime: 120, vendedorId: 1 }),
    })
  })
  await page.route('**/api/whatsapp/user/disconnect', async r => {
    disconnectCalls++
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
  await page.route('**/api/whatsapp/user/contacts', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/whatsapp/user/chat-messages**', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/whatsapp/messages**', async r => {
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        waSentMessages.map((m, idx) => ({
          id: idx + 1,
          numero: m.number,
          cliente_id: 9501,
          vendedor_id: 1,
          direcao: 'enviada',
          mensagem: m.text,
          tipo: 'text',
          created_at: new Date().toISOString(),
        }))
      ),
    })
  })
  await page.route('**/api/whatsapp/user/send', async r => {
    const b = r.request().postDataJSON()
    waSentMessages.push({ number: b.number, text: b.text })
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })

  // ── Mocks de Email, Config, Bulk e Execução Manual de Automação ──
  await page.route('**/api/email/status', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, from: 'comercial@mfparis.com.br' }) })
  })
  await page.route('**/api/config', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ emailHost: 'smtp.mfparis.com.br', emailPort: 587 }) })
  })
  await page.route('**/api/automacoes/*/executar', async r => {
    execManualCalls++
    const id = new URL(r.request().url()).pathname.split('/')[3]
    const aut = automacoesDb.find(a => String(a.id) === String(id))
    if (aut) {
      aut.execucoes = (aut.execucoes || 0) + 1
      aut.ultima_execucao = new Date().toISOString()
    }
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
  await page.route('**/api/bulk/send', async r => {
    bulkCalls++
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, batchId: 'batch_test_1' }) })
  })
  await page.route('**/api/bulk/status/**', async r => {
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        batchId: 'batch_test_1',
        canal: 'whatsapp',
        total: 1,
        sent: 1,
        failed: 0,
        errors: [],
        status: 'done',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      }),
    })
  })
  await page.route('**/api/bulk/batches', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/store/**', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/missoes**', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })
  await page.route('**/api/tempo-tela/relatorio**', async r => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relatorio: [] }) })
  })

  // ── Mocks Supabase REST + RPC ──
  await page.route('**/rest/v1/rpc/**', async route => {
    const fn = new URL(route.request().url()).pathname.split('/').pop()
    const body = route.request().postDataJSON()
    if (fn === 'mover_cliente_atomico') {
      const alvo = clientesDb.find(c => c.id === body.p_cliente_id)
      if (alvo) {
        alvo.etapa = body.p_etapa_destino
        alvo.etapa_anterior = body.p_etapa_origem
        if (body.p_extras) Object.assign(alvo, body.p_extras)
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alvo || {}) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.pathname.includes('/rpc/')) { await route.fallback(); return }
    const tabela = url.pathname.split('/').pop()
    const metodo = req.method()
    const isSingle = (req.headers()['accept'] || '').includes('vnd.pgrst.object')

    if (tabela === 'vendedores') {
      const lista = [{ id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true }]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? lista[0] : lista) })
      return
    }
    if (tabela === 'clientes') {
      if (metodo === 'PATCH') {
        const idEq = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = clientesDb.find(c => String(c.id) === idEq)
        if (alvo) Object.assign(alvo, req.postDataJSON())
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? alvo : [alvo]) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clientesDb) })
      return
    }
    if (tabela === 'automacoes') {
      if (metodo === 'POST') {
        const b = req.postDataJSON()
        const row = {
          id: `aut-${automacoesDb.length + 1}`,
          execucoes: 0,
          ultima_execucao: null,
          proxima_execucao: null,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
          ...b,
        }
        automacoesDb.unshift(row)
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        return
      }
      if (metodo === 'PATCH') {
        const idEq = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = automacoesDb.find(a => String(a.id) === idEq)
        if (alvo) Object.assign(alvo, req.postDataJSON())
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? alvo : [alvo]) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(automacoesDb) })
      return
    }
    if (tabela === 'regras_automacao') {
      if (metodo === 'POST') {
        const b = req.postDataJSON()
        const row = { id: regrasTarefasDb.length + 1, created_at: new Date().toISOString(), ...b }
        regrasTarefasDb.unshift(row)
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        return
      }
      if (metodo === 'GET') {
        const gatilhoEq = url.searchParams.get('gatilho')?.replace('eq.', '')
        const ativaEq = url.searchParams.get('ativa')?.replace('eq.', '')
        let list = [...regrasTarefasDb]
        if (gatilhoEq) list = list.filter(r => r.gatilho === gatilhoEq)
        if (ativaEq === 'true') list = list.filter(r => r.ativa === true)
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) })
        return
      }
    }
    if (tabela === 'mensagens_automacao') {
      if (metodo === 'POST') {
        const b = req.postDataJSON()
        const row = { id: mensagensAutoDb.length + 10, created_at: new Date().toISOString(), ...b }
        mensagensAutoDb.unshift(row)
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mensagensAutoDb) })
      return
    }
    if (tabela === 'tarefas') {
      if (metodo === 'POST') {
        const b = req.postDataJSON()
        const row = { id: tarefasDb.length + 500, criado_em: new Date().toISOString(), ...(Array.isArray(b) ? b[0] : b) }
        tarefasDb.unshift(row)
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tarefasDb) })
      return
    }
    if (metodo === 'POST') {
      const b = req.postDataJSON()
      const row = { id: Date.now(), ...(Array.isArray(b) ? b[0] : b) }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()

  const abrirMenu = async (label: RegExp) => {
    await page.getByRole('button', { name: label }).first().dispatchEvent('click')
  }

  // =========================================================================
  // 1) CRIAR AUTOMAÇÃO DO ZERO (CriarAutomacaoView) + ATIVAR/PAUSAR + EXECUTAR AGORA
  // =========================================================================
  await abrirMenu(/^Criar Automação$/i)
  await page.getByRole('button', { name: /Criação de Tarefas/i }).first().click()

  await page.getByPlaceholder(/Boas-vindas Novos Clientes/i).fill('Automação Pós-Negociação Zero')
  await page.getByRole('button', { name: /Baseado em Evento/i }).click()
  await page.getByLabel('Evento do gatilho').selectOption('mudanca_etapa')
  await page.getByLabel('Etapa do gatilho').selectOption('negociacao')

  // Ação 1: Criar Tarefa (agora com campos completos!)
  await page.getByRole('button', { name: /Adicionar Ação/i }).click()
  const selectsTipoAcao = page.locator('select').filter({ hasText: /Selecione\.\.\./i })
  await selectsTipoAcao.first().selectOption('criar_tarefa')
  await page.getByLabel('Título da tarefa automática').fill('Ligar urgente — {cliente}')

  // Ação 2: Enviar WhatsApp
  await page.getByRole('button', { name: /Adicionar Ação/i }).click()
  await page.locator('select').filter({ hasText: /Selecione\.\.\./i }).last().selectOption('enviar_whatsapp')
  await page.getByPlaceholder(/Digite a mensagem/i).fill('Olá {{nome}}, proposta enviada!')

  await page.getByRole('button', { name: /SALVAR AUTOMAÇÃO/i }).click()

  // Verificar na aba Gerenciar que nasceu como "ativa" (e não "rascunho"!) + Executar agora!
  await page.getByRole('button', { name: /Gerenciar/i }).click()
  await expect(page.getByText('Automação Pós-Negociação Zero')).toBeVisible()
  await expect(page.getByText('ativa', { exact: true }).first()).toBeVisible()

  await page.locator('button[title="Executar agora"]').first().click()
  await expect.poll(() => execManualCalls).toBe(1)

  // =========================================================================
  // 2) AUTOMAÇÃO DE TAREFAS DO ZERO + DISPARO REAL AO MOVER CARD NO FUNIL!
  // =========================================================================
  await abrirMenu(/^Automação Tarefas$/i)
  await page.getByRole('button', { name: /Nova Regra/i }).click()
  await page.getByPlaceholder(/Ex: Follow-up após amostra/i).fill('Regra Catálogo na Proposta')
  // Selecionar Etapa Destino = Proposta
  const selectsRegra = page.locator('select')
  await selectsRegra.nth(3).selectOption('proposta')
  await page.getByPlaceholder(/Ex: Follow-up — \{cliente\}/i).fill('Apresentar catálogo — {cliente}')
  await page.getByRole('button', { name: /Salvar|Criar Regra/i }).first().click()
  await expect(page.getByText('Regra Catálogo na Proposta')).toBeVisible()

  // Mover card #9501 de Prospecção -> Proposta e confirmar que a tarefa automática nasceu!
  await abrirMenu(/^Funil Comercial$/i)
  const chipProsp = page.locator('button', { hasText: '🔎' }).first()
  if (await chipProsp.isVisible().catch(() => false)) await chipProsp.click()
  await page.getByText('CLIENTE AUTOMACAO ATIVO LTDA').first().click()

  // Mover de Prospecção para Proposta -> dispara processarRegrasAutomacao e cria a tarefa!
  await page.getByRole('button', { name: /Ir para Proposta/i }).click()
  await expect.poll(() => tarefasDb.some(t => t.titulo === 'Apresentar catálogo — CLIENTE AUTOMACAO ATIVO LTDA')).toBe(true)

  // =========================================================================
  // 3) MENSAGENS AUTOMÁTICAS DO ZERO
  // =========================================================================
  await abrirMenu(/^Mensagens Auto$/i)
  await page.getByRole('button', { name: /Nova Mensagem/i }).click()
  await page.getByPlaceholder(/Ex: Pesquisa de satisfação/i).fill('Aviso Produção Iniciada')
  await page.getByPlaceholder(/Crie uma mensagem amigável/i).fill('Avise o cliente de forma cordial que o pedido entrou em produção.')
  await page.getByRole('button', { name: /^Salvar/i }).first().click()
  await expect(page.getByText('Aviso Produção Iniciada')).toBeVisible()

  // =========================================================================
  // 4) AUTOMAÇÕES (DISPARO EM MASSA) — ignora duplicatas arquivadas e dispara lote!
  // =========================================================================
  await abrirMenu(/^Automações$/i)
  await page.getByRole('button', { name: /WhatsApp/i }).first().click()
  await expect(page.getByText('CLIENTE AUTOMACAO ATIVO LTDA').first()).toBeVisible()
  await expect(page.getByText('FICHA DUPLICADA ARQUIVADA LTDA')).toHaveCount(0)

  // =========================================================================
  // 5) WHATSAPP — Integrações (QR Code) + Chat do Vendedor no Card + Persistência no Reload (F5)!
  // =========================================================================
  await abrirMenu(/^Integrações$/i)
  await expect(page.getByText(/\+?5531999990000/).first()).toBeVisible()

  // Abrir card do cliente -> aba "Ver WhatsApp" -> enviar mensagem!
  await abrirMenu(/^Funil Comercial$/i)
  const chipProp = page.locator('button', { hasText: '📋' }).first()
  if (await chipProp.isVisible().catch(() => false)) await chipProp.click()
  await page.getByText('CLIENTE AUTOMACAO ATIVO LTDA').first().click()
  await page.getByRole('button', { name: /Ver WhatsApp/i }).click()
  await page.getByRole('button', { name: /Abrir chat WhatsApp/i }).click()
  await page.getByPlaceholder('Mensagem...').fill('Olá Marcos, confirmando seu pedido!')
  await page.getByPlaceholder('Mensagem...').press('Enter')
  await expect.poll(() => waSentMessages.length).toBe(1)
  expect(waSentMessages[0].text).toBe('Olá Marcos, confirmando seu pedido!')

  // PROVA CRÍTICA: dar F5 (reload) na página NÃO dispara /api/whatsapp/user/disconnect!
  await page.reload()
  expect(disconnectCalls).toBe(0)
})
