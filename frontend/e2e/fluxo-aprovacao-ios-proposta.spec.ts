import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Fluxo de Aprovação (Parte 1) + Gerar Proposta iOS iPhone/iPad (Parte 2)', () => {
  test('Gerar Proposta avança p/ Negociação e abre visualizador no iOS; Vendido mantém em Negociação; Recusa permite editar/reenviar mesmo pedido; Aprovação move p/ Follow-up + Ciclo 2', async ({ page }, testInfo) => {
    const hoje = new Date().toISOString().split('T')[0]
    let nextCliId = 31000
    let nextPropId = 900
    let nextPedId = 1200
    let nextInterId = 4000

    const clientesDb: any[] = [
      {
        id: 30500,
        razao_social: 'SORVETERIA TESTE FLUXO LTDA',
        cnpj: '45.111.222/0001-33',
        endereco_rua: 'Rua Alfa',
        endereco_numero: '100',
        endereco_cidade: 'Belo Horizonte',
        endereco_estado: 'MG',
        etapa: 'proposta',
        ciclo_numero: 1,
        vendedor_id: 1,
        arquivado_duplicata: false,
        empresa_funil_id: 30500,
        data_entrada_etapa: hoje,
      },
    ]
    const propostasDb: any[] = []
    const pedidosDb: any[] = []
    const interacoesDb: any[] = []
    const tarefasDb: any[] = []

    await page.route('**/api/store/**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.route('**/api/simulador/params**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false }) }))
    await page.route('**/api/missoes**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }))
    await page.route('**/api/tempo-tela/relatorio**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relatorio: [] }) }))
    await page.route('**/api/roleplay/historico/gerente**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessoes: [] }) }))

    await page.route('**/api/propostas', async route => {
      const b = route.request().postDataJSON()
      const row = {
        id: ++nextPropId,
        numero: b.numero,
        cliente_id: b.clienteId,
        vendedor_nome: b.vendedorNome,
        itens: b.itens,
        observacoes: b.observacoes,
        frete: b.frete,
        pagamento: b.pagamento,
        total_valor: b.totalValor,
        criado_em: new Date().toISOString(),
      }
      propostasDb.unshift(row)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: row }) })
    })

    await page.route('**/api/pedidos/*/aprovar', async route => {
      const urlParts = new URL(route.request().url()).pathname.split('/')
      const pedId = Number(urlParts[urlParts.indexOf('pedidos') + 1])
      const ped = pedidosDb.find(p => p.id === pedId)
      if (ped) {
        ped.status = 'confirmado'
        ped.omie_codigo = '999888777'
        ped.omie_numero = '000000000013999'
        ped.omie_status = 'em_producao'
        ped.data_aprovacao = new Date().toISOString()
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, pedido_aprovado: true, omie: { success: true, omie_codigo: 999888777 } }),
      })
    })

    await page.route('**/rest/v1/rpc/**', async route => {
      const fn = new URL(route.request().url()).pathname.split('/').pop()
      const body = route.request().postDataJSON()
      if (fn === 'mover_cliente_atomico') {
        const alvo = clientesDb.find(c => c.id === body.p_cliente_id)
        if (alvo) {
          alvo.etapa = body.p_etapa || body.p_etapa_destino || alvo.etapa
          alvo.etapa_anterior = body.p_etapa_anterior || body.p_etapa_origem || alvo.etapa_anterior
          if (body.p_extras) Object.assign(alvo, body.p_extras)
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alvo || {}) })
      }
      if (fn === 'insert_pedido_atomico') {
        const row = {
          id: ++nextPedId,
          numero: body.p_numero,
          cliente_id: body.p_cliente_id,
          vendedor_id: body.p_vendedor_id,
          observacoes: body.p_observacoes,
          status: body.p_status || 'enviado',
          total_valor: body.p_total_valor,
          tipo: body.p_tipo || 'venda',
          forma_pagamento: body.p_forma_pagamento,
          tipo_frete: body.p_tipo_frete,
          data_criacao: new Date().toISOString(),
          data_envio: new Date().toISOString(),
          itens_pedido: (body.p_itens || []).map((it: any, idx: number) => ({ id: idx + 1, ...it })),
        }
        pedidosDb.push(row)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
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
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? lista[0] : lista) })
      }
      if (tabela === 'produtos') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 7, nome: 'OKEY LAC PRO 25KG', sku: '1230013', omie_codigo: '2071041102', categoria: 'Lácteos', preco: 16, unidade: 'kg', peso_kg: 25, ativo: true },
          ]),
        })
      }
      if (tabela === 'clientes') {
        if (metodo === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clientesDb) })
        if (metodo === 'POST') {
          const b = req.postDataJSON()
          const novo = { id: ++nextCliId, arquivado_duplicata: false, created_at: new Date().toISOString(), ...b }
          clientesDb.push(novo)
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? novo : [novo]) })
        }
        if (metodo === 'PATCH') {
          const idMatch = url.search.match(/id=eq\.(\d+)/)
          const alvo = idMatch ? clientesDb.find(c => c.id === Number(idMatch[1])) : null
          if (alvo) Object.assign(alvo, req.postDataJSON())
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? (alvo || {}) : [alvo || {}]) })
        }
      }
      if (tabela === 'propostas') {
        const cidMatch = url.search.match(/cliente_id=eq\.(\d+)/)
        const list = cidMatch ? propostasDb.filter(p => p.cliente_id === Number(cidMatch[1])) : propostasDb
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) })
      }
      if (tabela === 'pedidos') {
        if (metodo === 'GET') {
          const idMatch = url.search.match(/id=eq\.(\d+)/)
          if (idMatch && isSingle) {
            const found = pedidosDb.find(p => p.id === Number(idMatch[1]))
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found || {}) })
          }
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pedidosDb) })
        }
        if (metodo === 'POST') {
          const b = req.postDataJSON()
          const row = { id: ++nextPedId, data_criacao: new Date().toISOString(), itens_pedido: [], ...b }
          pedidosDb.push(row)
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        }
        if (metodo === 'PATCH') {
          const idMatch = url.search.match(/id=eq\.(\d+)/)
          const alvo = idMatch ? pedidosDb.find(p => p.id === Number(idMatch[1])) : null
          if (alvo) Object.assign(alvo, req.postDataJSON())
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? (alvo || {}) : [alvo || {}]) })
        }
      }
      if (tabela === 'itens_pedido') {
        if (metodo === 'POST') {
          const rows = Array.isArray(req.postDataJSON()) ? req.postDataJSON() : [req.postDataJSON()]
          const pid = rows[0]?.pedido_id
          const ped = pedidosDb.find(p => p.id === pid)
          if (ped) ped.itens_pedido = rows.map((r: any, i: number) => ({ id: i + 1, ...r }))
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(rows) })
        }
        if (metodo === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        const pidMatch = url.search.match(/pedido_id=eq\.(\d+)/)
        const ped = pidMatch ? pedidosDb.find(p => p.id === Number(pidMatch[1])) : null
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ped?.itens_pedido || []) })
      }
      if (tabela === 'interacoes') {
        if (metodo === 'POST') {
          const row = { id: ++nextInterId, created_at: new Date().toISOString(), ...req.postDataJSON() }
          interacoesDb.unshift(row)
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(interacoesDb) })
      }
      if (tabela === 'tarefas') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tarefasDb) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /CRM MF Paris/i }).click()
    await page.getByRole('button', { name: /Funil Comercial/i }).first().dispatchEvent('click')

    // =========================================================================
    // PARTE 2: Gerar Proposta -> salva proposta, avança p/ Negociação e abre visualizador no iOS (iPhone e iPad)
    // =========================================================================
    const chipProp = page.locator('main button', { hasText: /^Proposta/ }).first()
    if (await chipProp.isVisible().catch(() => false)) await chipProp.click()

    await page.getByText('SORVETERIA TESTE FLUXO LTDA').first().click()
    await page.getByRole('button', { name: /Criar Proposta/i }).click()

    await page.getByLabel('Frete', { exact: true }).selectOption('FOB')
    await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('14/21/28')
    await page.getByPlaceholder(/Buscar produto por SKU ou nome/i).fill('OKEY LAC PRO')
    await page.getByPlaceholder('kg').first().fill('100')

    await page.getByRole('button', { name: /Gerar Proposta/i }).click()

    // Proposta foi salva e card avançou imediatamente para Negociação!
    await expect.poll(() => propostasDb.length).toBe(1)
    await expect.poll(() => clientesDb[0].etapa).toBe('negociacao')

    // Em iPhone (mobile-safari) e iPad (ipad-safari), o visualizador nativo #crm-ios-pdf-viewer abre na tela!
    const isIOSProject = testInfo.project.name === 'mobile-safari' || testInfo.project.name === 'ipad-safari'
    if (isIOSProject) {
      const viewer = page.locator('#crm-ios-pdf-viewer')
      await expect(viewer).toBeVisible()
      await expect(viewer.getByText('Abrir PDF em tela cheia')).toBeVisible()
      await viewer.getByRole('button', { name: 'Fechar' }).click()
      await expect(viewer).toHaveCount(0)
    }

    // =========================================================================
    // PARTE 1 ITEM 1: Vendedor clica em Vendido -> card PERMANECE em Negociação ("Aguardando aprovação") e NÃO cria Ciclo 2!
    // =========================================================================
    const chipNeg = page.locator('main button', { hasText: /^Negociação/ }).first()
    if (await chipNeg.isVisible().catch(() => false)) await chipNeg.click()

    await page.getByText('SORVETERIA TESTE FLUXO LTDA').first().click()
    await page.getByRole('button', { name: /^Vendido$/i }).click()

    await expect.poll(() => pedidosDb.length).toBe(1)
    expect(pedidosDb[0].status).toBe('enviado')
    // Card permanece em Negociação e nenhum ciclo extra foi aberto!
    expect(clientesDb.length).toBe(1)
    expect(clientesDb[0].etapa).toBe('negociacao')
    await expect(page.getByText(/Aguardando aprovação/i).first()).toBeVisible()

    // =========================================================================
    // PARTE 1 ITEM 3: Gerente RECUSA -> card continua em Negociação, motivo visível e vendedor edita e reenvia o MESMO pedido!
    // =========================================================================
    await page.getByRole('button', { name: /Aprovação/i }).first().dispatchEvent('click')
    await page.getByRole('button', { name: /^Recusar$/i }).first().click()
    await page.locator('textarea').first().fill('Incluir glucose e revisar prazo')
    await page.getByRole('button', { name: /Confirmar Recusa|Confirmar/i }).first().click()

    await expect.poll(() => pedidosDb[0].status).toBe('cancelado')
    expect(clientesDb.length).toBe(1)
    expect(clientesDb[0].etapa).toBe('negociacao')

    // Voltar ao Funil -> abrir card em Negociação -> mostra SÓ o aviso vermelho (sem botão redundante "Editar e Reenviar Pedido")!
    await page.getByRole('button', { name: /Funil Comercial/i }).first().dispatchEvent('click')
    if (await chipNeg.isVisible().catch(() => false)) await chipNeg.click()
    await expect(page.getByText(/Incluir glucose e revisar prazo/i).first()).toBeVisible()

    await page.getByText('SORVETERIA TESTE FLUXO LTDA').first().click()
    await expect(page.getByText(/recusado na aprovação — Motivo: Incluir glucose e revisar prazo/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Editar e Reenviar Pedido/i })).toHaveCount(0)

    // Vendedor corrige pela proposta ("Editar Proposta") e clica em "Vendido" -> o MESMO pedido volta para Aguardando aprovação e o aviso some!
    await page.getByRole('button', { name: /Editar Proposta/i }).click()
    await page.locator('textarea').last().fill('Proposta ajustada com glucose')
    await page.getByRole('button', { name: /Gerar Nova Versão PDF/i }).click()
    if (isIOSProject) {
      const viewer2 = page.locator('#crm-ios-pdf-viewer')
      await expect(viewer2).toBeVisible()
      await viewer2.getByRole('button', { name: 'Fechar' }).click()
      await expect(viewer2).toHaveCount(0)
    }
    await page.getByRole('button', { name: /^Vendido$/i }).click()

    // Continua existindo APENAS 1 pedido (o mesmo!) agora novamente com status 'enviado', aviso vermelho sumiu e 1 card em Negociação!
    await expect.poll(() => pedidosDb[0].status).toBe('enviado')
    expect(pedidosDb[0].motivo_recusa).toBeNull()
    expect(pedidosDb.length).toBe(1)
    expect(clientesDb.length).toBe(1)
    expect(clientesDb[0].etapa).toBe('negociacao')

    // =========================================================================
    // PARTE 1 ITEM 2: Gerente APROVA -> card vai para Follow-up (Vendido) e abre novo ciclo (Ciclo 2) em Proposta!
    // =========================================================================
    await page.getByRole('button', { name: /Aprovação/i }).first().dispatchEvent('click')
    await page.getByRole('button', { name: /Aprovar Pedido/i }).first().click()

    await expect.poll(() => pedidosDb[0].status).toBe('confirmado')
    await expect.poll(() => clientesDb[0].etapa).toBe('follow_up')
    await expect.poll(() => clientesDb.length).toBe(2)
    expect(clientesDb[1].etapa).toBe('proposta')
    expect(clientesDb[1].ciclo_numero).toBe(2)
  })
})
