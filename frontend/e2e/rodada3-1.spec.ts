import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Rodada 3.1 (Itens 1, 2, 3 e 4), 100% em ambiente isolado (sem tocar no banco real nem no Omie):
 * - Item 1: Sem coluna "Arquivados"; Vendido move para Follow-up e abre novo ciclo em Proposta;
 *           coleta de satisfação deixa card "Finalizado" e oculto no Follow-up; botão "Finalizados (N)"
 *           no cabeçalho mostra/esconde; card finalizado permanece em "Ver negócios".
 * - Item 2: Prazo "15/30/35" incluído em Parâmetros chega na hora na Forma de pagamento do pedido E no Simulador
 *           (calculando Tabela A e Tabela B).
 * - Item 3: Bloco do pedido no card do Kanban mostra quantidade por item ("125 kg") e total ("225 kg").
 * - Item 4: Produtos de interesse bloqueia salvar 0 kg/mês (exige valor > 0).
 */
test('Rodada 3.1 — Follow-up Finalizados + Novo Ciclo no Vendido, Parâmetros 15/30/35 no Pedido e Simulador, Kanban em kg e Produtos > 0 kg/mês', async ({ page }) => {
  const hoje = new Date().toISOString().split('T')[0]
  let nextCliId = 9900
  let nextPropId = 600
  let nextPedId = 800
  const storeMem: Record<string, any[]> = { parametros_listas: [], tarefas_excluidas: [] }

  const clientesDb: Record<string, any>[] = [
    {
      id: 9850,
      razao_social: 'MTL ISOLADO DISTRIBUIDORA LTDA',
      cnpj: '57.487.294/0001-45',
      endereco_rua: 'Av. Industrial',
      endereco_numero: '500',
      endereco_cidade: 'Contagem',
      endereco_estado: 'MG',
      etapa: 'negociacao',
      ciclo_numero: 1,
      vendedor_id: 1,
      arquivado_duplicata: false,
      empresa_funil_id: 9850,
      data_entrada_etapa: hoje,
      valor_proposta: 4500,
      produtos_interesse: ['OKEY LAC CREAM 25KG'],
      produtos_quantidades_mensais: { 'OKEY LAC CREAM 25KG': { kgMes: 150, atualizadoEm: new Date().toISOString() } },
    },
  ]

  const propostasDb: any[] = [
    {
      id: 601,
      numero: 'PROP-100001',
      cliente_id: 9850,
      vendedor_nome: 'Bernardo Nery',
      itens: [
        { produtoId: 101, nomeProduto: 'OKEY LAC CREAM 25KG', sku: 'OKC-25', unidade: 'KG', preco: 20, quantidade: 125 },
        { produtoId: 102, nomeProduto: 'CD - MANIMALTO - MALTODEXTRINA 25KG', sku: 'MLT-25', unidade: 'KG', preco: 10, quantidade: 100 },
      ],
      observacoes: 'Entrega CIF',
      frete: 'FOB',
      pagamento: '28',
      total_valor: 3500,
      criado_em: new Date().toISOString(),
    },
  ]

  const pedidosDb: any[] = [
    {
      id: 801,
      numero: 'PED-800001',
      cliente_id: 9850,
      vendedor_id: 1,
      tipo: 'venda',
      status: 'confirmado',
      forma_pagamento: '28',
      tipo_frete: 'FOB',
      total_valor: 3500,
      data_criacao: new Date().toISOString(),
      itens_pedido: [
        { produto_id: 101, nome_produto: 'OKEY LAC CREAM 25KG', sku: 'OKC-25', unidade: 'KG', preco: 20, quantidade: 125 },
        { produto_id: 102, nome_produto: 'CD - MANIMALTO - MALTODEXTRINA 25KG', sku: 'MLT-25', unidade: 'KG', preco: 10, quantidade: 100 },
      ],
    },
  ]

  await page.route('**/api/store/**', async route => {
    const req = route.request()
    const parts = new URL(req.url()).pathname.split('/').filter(Boolean)
    const col = parts[2]
    const id = parts[3]
    const m = req.method()
    storeMem[col] = storeMem[col] || []
    if (m === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storeMem[col]) })
    } else if (m === 'POST') {
      const body = req.postDataJSON()
      const item = { id: storeMem[col].length + 1, criadoEm: new Date().toISOString(), ...body }
      storeMem[col].unshift(item)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) })
    } else if (m === 'PATCH') {
      const alvo = storeMem[col].find(x => String(x.id) === String(id))
      if (alvo) Object.assign(alvo, req.postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alvo || {}) })
    }
  })

  await page.route('**/api/simulador/params**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false }) })
  })

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

  await page.route('**/api/missoes**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })
  await page.route('**/api/tempo-tela/relatorio**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relatorio: [] }) })
  })

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

    if (tabela === 'vendedores') {
      const lista = [{ id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true }]
      const isSingle = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? lista[0] : lista) })
      return
    }
    if (tabela === 'produtos') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 101, nome: 'OKEY LAC CREAM 25KG', sku: 'OKC-25', categoria: 'Lácteos', preco: 20, unidade: 'KG', peso_kg: 25, ativo: true },
          { id: 102, nome: 'CD - MANIMALTO - MALTODEXTRINA 25KG', sku: 'MLT-25', categoria: 'Insumos', preco: 10, unidade: 'KG', peso_kg: 25, ativo: true },
        ]),
      })
      return
    }
    if (tabela === 'clientes') {
      if (metodo === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clientesDb) })
        return
      }
      if (metodo === 'POST') {
        const body = req.postDataJSON()
        const row = { ...(Array.isArray(body) ? body[0] : body), id: ++nextCliId }
        row.ciclo_numero = row.ciclo_numero || 2
        clientesDb.push(row)
        const isSingle = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        return
      }
      if (metodo === 'PATCH') {
        const patch = req.postDataJSON()
        const idEq = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = clientesDb.find(c => String(c.id) === idEq)
        if (alvo) Object.assign(alvo, patch)
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alvo ? [alvo] : []) })
        return
      }
    }
    if (tabela === 'propostas') {
      const cid = url.searchParams.get('cliente_id')?.replace('eq.', '')
      const res = cid ? propostasDb.filter(p => String(p.cliente_id) === cid) : propostasDb
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) })
      return
    }
    if (tabela === 'pedidos') {
      if (metodo === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pedidosDb) })
        return
      }
      if (metodo === 'POST') {
        const body = req.postDataJSON()
        const row = { ...(Array.isArray(body) ? body[0] : body), id: ++nextPedId, itens_pedido: [] }
        pedidosDb.unshift(row)
        const isSingle = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? row : [row]) })
        return
      }
    }
    if (tabela === 'itens_pedido') {
      if (metodo === 'POST') {
        const body = req.postDataJSON()
        const arr = Array.isArray(body) ? body : [body]
        const pid = arr[0]?.pedido_id
        const ped = pedidosDb.find(p => p.id === pid)
        if (ped) ped.itens_pedido = arr
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(arr) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      return
    }
    if (metodo === 'POST') {
      const body = req.postDataJSON()
      const row = { id: Date.now(), ...(Array.isArray(body) ? body[0] : body) }
      const isSingle = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
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
  // 1) ITEM 2: Cadastrar "15/30/35" em Parâmetros
  // =========================================================================
  await abrirMenu(/^Parâmetros$/i)
  await page.getByRole('button', { name: /Prazo de pagamento do pedido/i }).click()
  await page.getByPlaceholder(/Nova opção em Prazo/i).fill('15/30/35')
  await page.getByRole('button', { name: /\+ Adicionar/i }).click()
  await expect(page.getByText('15/30/35').first()).toBeVisible()

  // =========================================================================
  // 2) ITEM 3 + ITEM 1: No Kanban, sem coluna "Arquivados", pedido mostra kg ("125 kg" / "225 kg")
  // =========================================================================
  await abrirMenu(/^Funil Comercial$/i)
  await expect(page.locator('h3', { hasText: 'Arquivados' })).toHaveCount(0)

  // Em mobile, rolar até a coluna Negociação se necessário
  const chipNeg = page.locator('button', { hasText: 'Negociação' }).first()
  if (await chipNeg.isVisible().catch(() => false)) await chipNeg.click()

  await expect(page.getByText('MTL ISOLADO DISTRIBUIDORA LTDA').first()).toBeVisible()
  // Item 3: "125 kg" e total "225 kg" (sem "125x" nem "225 un")
  await expect(page.getByText('125 kg').first()).toBeVisible()
  await expect(page.getByText('225 kg').first()).toBeVisible()
  await expect(page.getByText('125x')).toHaveCount(0)
  await expect(page.getByText('225 un')).toHaveCount(0)

  // =========================================================================
  // 3) ITEM 4: Abrir card -> Produtos de interesse bloqueia 0 kg/mês
  // =========================================================================
  await page.getByText('MTL ISOLADO DISTRIBUIDORA LTDA').first().click()
  await page.getByPlaceholder(/Buscar e adicionar produto/i).fill('MANIMALTO')
  await page.getByRole('button', { name: /CD - MANIMALTO - MALTODEXTRINA 25KG/i }).click()

  const inputNovoKg = page.getByLabel('Consumo mensal (kg/mês) do novo produto')
  await expect(inputNovoKg).toBeVisible()
  const btnSalvarProd = page.getByRole('button', { name: /^Salvar$/ }).first()
  await expect(btnSalvarProd).toBeDisabled()
  await inputNovoKg.fill('0')
  await expect(btnSalvarProd).toBeDisabled()
  await inputNovoKg.fill('200')
  await expect(btnSalvarProd).toBeEnabled()
  await btnSalvarProd.click()
  await expect(page.getByLabel('Consumo mensal (kg) — CD - MANIMALTO - MALTODEXTRINA 25KG')).toHaveValue('200')

  // Tentar zerar produto existente -> bloqueia e restaura 200
  const inputExistente = page.getByLabel('Consumo mensal (kg) — CD - MANIMALTO - MALTODEXTRINA 25KG')
  await inputExistente.fill('0')
  await inputExistente.blur()
  await expect(inputExistente).toHaveValue('200')

  // =========================================================================
  // 4) ITEM 1a: Clicar em "Vendido" -> card vai para Follow-up + abre novo ciclo em Proposta
  // =========================================================================
  await page.getByRole('button', { name: /^Vendido$/ }).click()

  // Agora existe Ciclo 2 em Proposta E Ciclo 1 em Follow-up
  const chipFollow = page.locator('button', { hasText: 'Follow-up' }).first()
  if (await chipFollow.isVisible().catch(() => false)) await chipFollow.click()
  await expect(page.getByRole('button', { name: /Finalizados \(0\)/ })).toBeVisible()

  // Abrir card em Follow-up e coletar satisfação (Item 1b e 1c)
  const colFollowUp = page.locator('div.rounded-xl').filter({ has: page.locator('h3', { hasText: 'Follow-up' }) }).first()
  await colFollowUp.getByText('MTL ISOLADO DISTRIBUIDORA LTDA').first().click()
  await page.getByRole('button', { name: /Coletar Satisfação/i }).click()
  await page.getByPlaceholder(/Descreva o retorno do cliente/i).fill('Entrega excelente, produto aprovado!')
  await page.getByRole('button', { name: /Salvar e Finalizar/i }).click()

  // Card foi finalizado e ocultado da coluna Follow-up -> botão passa a mostrar "Finalizados (1)"
  const btnFinalizados = page.getByRole('button', { name: /Finalizados \(1\)/ })
  await expect(btnFinalizados).toBeVisible()

  // Ao clicar em "Finalizados (1)", o card oculto aparece com "Finalizado"; ao clicar de novo, esconde
  await btnFinalizados.click()
  await expect(colFollowUp.getByText('Finalizado').first()).toBeVisible()
  await btnFinalizados.click()

  // O cliente continua com card ativo em Proposta (Ciclo 2)!
  const chipProp = page.locator('button', { hasText: 'Proposta' }).first()
  if (await chipProp.isVisible().catch(() => false)) await chipProp.click()
  const colProposta = page.locator('div.rounded-xl').filter({ has: page.locator('h3', { hasText: 'Proposta' }) }).first()
  await expect(colProposta.getByText('MTL ISOLADO DISTRIBUIDORA LTDA').first()).toBeVisible()
  await expect(colProposta.getByText('Ciclo 2').first()).toBeVisible()

  // Abrir o card ativo em Proposta -> verificar "Ver negócios" mostra o anterior como "Follow-up · Finalizado"
  await colProposta.getByText('MTL ISOLADO DISTRIBUIDORA LTDA').first().click()
  await page.getByRole('button', { name: /Negócios/i }).click()
  await expect(page.getByText('Follow-up · Finalizado').first()).toBeVisible()

  // =========================================================================
  // 5) ITEM 2: Abrir "Criar Proposta" (Nova Negociação) e confirmar "15/30/35" na Forma de pagamento E no Simulador!
  // =========================================================================
  await page.getByRole('button', { name: /^Criar Proposta$/ }).click()
  const selectPagPedido = page.getByLabel('Forma de pagamento')
  await expect(selectPagPedido.locator('option[value="15/30/35"]')).toHaveCount(1)
  await selectPagPedido.selectOption('15/30/35')

  const selectPrazoSimulador = page.getByLabel('Prazo do simulador')
  await expect(selectPrazoSimulador.locator('option[value="15/30/35"]')).toHaveCount(1)
  await expect(selectPrazoSimulador).toHaveValue('15/30/35')
  // Simulador calculou Tabela A e Tabela B para 15/30/35!
  await expect(page.getByText('Tabela A')).toBeVisible()
  await expect(page.getByText('Tabela B')).toBeVisible()
})
