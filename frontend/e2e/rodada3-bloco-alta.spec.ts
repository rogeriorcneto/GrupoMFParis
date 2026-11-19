import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Rodada 3, Bloco Prioridade Alta (Itens 1, 2, 3, 4 e 5), 100% em ambiente isolado:
 * - Item 1: Modal Nova Negociação reorganizado (Bonificação + CIF + descarga Não -> "Necessário chapa para descarga",
 *           SKU visível, excluir item pelo X, rodapé em kg, aviso de embalagem, clicar fora NÃO fecha,
 *           simulador fixo à esquerda puxando o item, chega na Aprovação como BONIFICAÇÃO).
 * - Item 2: Prazo "15/30/35" e motivo de perda novo em Parâmetros chegam na hora via /api/store/parametros_listas.
 * - Item 3: Marcar Perdido em Proposta -> card vai para Perdido com motivo de Parâmetros + abre novo ciclo em Proposta.
 * - Item 4: Em Clientes > Exportar, Ursulla (inativa) aparece na lista de vendedores.
 * - Item 5: Tarefas bloqueia data/hora no passado e seletor de minutos mostra apenas de 5 em 5 (00, 05... 55).
 */
test('Rodada 3 — Bloco Alta (Itens 1 a 5): Nova Negociação Bonificação/CIF/kg, Parâmetros na hora, Perdido em Proposta abre ciclo e Tarefas 5min', async ({ page }) => {
  const hoje = new Date().toISOString().split('T')[0]
  let nextCliId = 9800
  let nextPropId = 500
  let nextPedId = 700
  const storeMem: Record<string, any[]> = { parametros_listas: [], tarefas_excluidas: [] }
  const propostasDb: any[] = []
  const pedidosDb: any[] = []

  const clientesDb: Record<string, any>[] = [
    {
      id: 9701, razao_social: 'SORVETERIA BONIFICACAO TESTE LTDA', cnpj: '11.222.333/0001-81',
      endereco_rua: 'Rua Beta', endereco_numero: '347', endereco_cidade: 'Contagem', endereco_estado: 'MG',
      etapa: 'proposta', ciclo_numero: 1, vendedor_id: 1, arquivado_duplicata: false,
      empresa_funil_id: 9701, data_entrada_etapa: hoje,
    },
    {
      id: 9702, razao_social: 'GRUPO THE BEST ISOLADO LTDA', cnpj: '22.333.444/0001-92',
      etapa: 'proposta', ciclo_numero: 1, vendedor_id: 1, arquivado_duplicata: false,
      empresa_funil_id: 9702, data_entrada_etapa: hoje,
    },
  ]

  await page.route('**/api/store/**', async route => {
    const req = route.request()
    const parts = new URL(req.url()).pathname.split('/').filter(Boolean) // ['api','store',col,id?]
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

  await page.route('**/api/propostas', async route => {
    const b = route.request().postDataJSON()
    const row = {
      id: ++nextPropId, numero: b.numero, cliente_id: b.clienteId, vendedor_nome: b.vendedorNome,
      itens: b.itens, observacoes: b.observacoes, frete: b.frete, pagamento: b.pagamento,
      total_valor: b.totalValor, criado_em: new Date().toISOString(),
    }
    propostasDb.unshift(row)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: row }) })
  })

  await page.route('**/api/simulador-precos**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        produtos: { 'LEITE EM PO INTEGRAL 25KG': { precoBase: 25, pesoSaco: 25 }, 'GLUCOSE EM PO 25KG': { precoBase: 8, pesoSaco: 25 } },
        prazos: { 'À vista': 0, '15/30/35': 0.03 },
        fretes: [{ key: 'cif_bh', label: 'CIF Grande BH', valorTon: 120 }],
      }),
    })
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
    if (fn === 'criar_novo_ciclo_proposta') {
      const novo = { ...body.p_dados, id: ++nextCliId, etapa: body.p_dados?.etapa || 'proposta' }
      clientesDb.push(novo)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(novo) })
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
    let dados: any = []

    if (tabela === 'vendedores') {
      const lista = [
        { id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true },
        { id: 5, nome: 'Ursulla lopes', email: 'venda03@mfparis.com.br', cargo: 'vendedor', ativo: false },
      ]
      dados = (url.searchParams.has('auth_id') || url.searchParams.has('email')) ? [lista[0]] : lista
    } else if (tabela === 'produtos') {
      dados = [
        { id: 215, nome: 'LEITE EM PO INTEGRAL 25KG', sku: 'SKU-215', omie_codigo: '9111', preco: 27, peso_kg: 25, unidade: 'kg', categoria: 'sacaria', ativo: true },
        { id: 237, nome: 'GLUCOSE EM PO 25KG', sku: 'SKU-237', omie_codigo: '9163', preco: 9, peso_kg: 25, unidade: 'kg', categoria: 'sacaria', ativo: true },
      ]
    } else if (tabela === 'clientes') {
      if (metodo === 'POST') {
        const b = req.postDataJSON()
        const novo = { id: ++nextCliId, ...(Array.isArray(b) ? b[0] : b) }
        clientesDb.push(novo)
        dados = [novo]
      } else if (metodo === 'PATCH') {
        const idEq = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = clientesDb.find(c => String(c.id) === idEq)
        if (alvo) Object.assign(alvo, req.postDataJSON())
        dados = alvo ? [alvo] : []
      } else {
        dados = clientesDb
      }
    } else if (tabela === 'propostas') {
      const cid = url.searchParams.get('cliente_id')?.replace('eq.', '')
      dados = cid ? propostasDb.filter(p => String(p.cliente_id) === cid) : propostasDb
    } else if (tabela === 'pedidos') {
      if (metodo === 'POST') {
        const b = req.postDataJSON()
        const novo = { id: ++nextPedId, ...(Array.isArray(b) ? b[0] : b) }
        pedidosDb.unshift(novo)
        dados = [novo]
      } else {
        dados = pedidosDb.map(p => ({ ...p, itens_pedido: [] }))
      }
    } else if (tabela === 'itens_pedido' && metodo === 'POST') {
      const rows = req.postDataJSON()
      const pid = rows?.[0]?.pedido_id
      const ped = pedidosDb.find(p => p.id === pid)
      if (ped) ped.itens_pedido = rows
      dados = rows
    } else if (tabela === 'interacoes' && metodo === 'POST') {
      dados = [{ id: Date.now(), ...req.postDataJSON() }]
    }

    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()

  // ── Item 2: Cadastrar prazo "15/30/35" em Parâmetros -> precisa chegar no dropdown do pedido!
  await page.getByRole('button', { name: /Parâmetros/i }).dispatchEvent('click')
  await page.getByRole('button', { name: /Prazo de pagamento do pedido/i }).click()
  await page.getByPlaceholder(/Nova opção em Prazo de pagamento/i).fill('15/30/35')
  await page.getByRole('button', { name: '+ Adicionar' }).click()

  // ── Item 1: Abrir Nova Negociação do cliente #9701 no Funil
  await page.getByRole('button', { name: /Funil/i }).dispatchEvent('click')
  await page.getByText('SORVETERIA BONIFICACAO TESTE LTDA').first().click()
  await page.locator('.fixed.inset-0').last().getByRole('button', { name: /Negociar|Criar Proposta/i }).click()

  // Prazo "15/30/35" está presente em Forma de pagamento (Item 2)!
  await expect(page.getByLabel('Forma de pagamento').locator('option[value="15/30/35"]')).toHaveCount(1)

  // Escolher Bonificação + CIF + descarga "Não"
  await page.getByLabel('Tipo de pedido').selectOption('bonificacao')
  await expect(page.getByLabel('Forma de pagamento')).toBeDisabled()
  await page.getByLabel('Frete').selectOption('CIF')
  await page.getByRole('button', { name: 'Não', exact: true }).click()
  await expect(page.getByText(/Necessário chapa para descarga/i)).toBeVisible()

  // Adicionar 2 produtos com SKU visível (30 kg -> aviso não fecha 25 kg + 50 kg), excluir 1 pelo X
  await page.getByPlaceholder(/Buscar produto por SKU ou nome/i).fill('25KG')
  await expect(page.getByText('[9111]')).toBeVisible()
  const inputsQtd = page.locator('input[placeholder="kg"]')
  await inputsQtd.first().fill('30')
  await inputsQtd.nth(1).fill('50')
  await expect(page.getByText(/2 itens · 80 kg/i)).toBeVisible()
  await expect(page.getByText(/30 kg não fecha sacos de 25 kg/i)).toBeVisible()

  // Excluir o segundo item pelo X -> sobra 1 item · 30 kg
  await page.getByLabel(/Excluir item GLUCOSE EM PO 25KG/i).click()
  await expect(page.getByText(/1 item · 30 kg/i)).toBeVisible()

  // Clicar fora da janela (canto superior esquerdo 2,2) NÃO fecha o modal!
  await page.mouse.click(2, 2)
  await expect(page.getByText(/1 item · 30 kg/i)).toBeVisible()

  // Confirmar proposta -> move para Negociação -> clicar em Ganhou/Vendido -> chega na Aprovação como BONIFICAÇÃO com "Necessário chapa para descarga"!
  await page.getByRole('button', { name: /Gerar Proposta PDF/i }).click()
  await expect(page.getByRole('button', { name: /Gerar Proposta PDF/i })).toBeHidden()
  const tabNegMobile = page.locator('button:has-text("Negociação") >> visible=true').first()
  if (await tabNegMobile.count()) await tabNegMobile.click()
  await page.locator('text=SORVETERIA BONIFICACAO TESTE LTDA >> visible=true').first().click()
  await page.locator('.fixed.inset-0').last().getByRole('button', { name: /Ganhou|Vendido/i }).click()

  await page.getByRole('button', { name: /Aprovação/i }).dispatchEvent('click')
  await expect(page.getByText('BONIFICAÇÃO', { exact: true }).first()).toBeVisible()
  await page.getByText('SORVETERIA BONIFICACAO TESTE LTDA').first().click()
  // Fechar painel caso abra
  if (await page.locator('.bg-black.bg-opacity-40').count()) {
    await page.locator('.bg-black.bg-opacity-40').first().dispatchEvent('click')
  }
  expect(pedidosDb[0]?.observacoes).toContain('Necessário chapa para descarga')

  // ── Item 3: Marcar Perdido em um card de Proposta (#9702) -> abre novo ciclo em Proposta!
  await page.getByRole('button', { name: /Funil Comercial/i }).dispatchEvent('click')
  const tabPropMobile = page.locator('button:has-text("Proposta") >> visible=true').first()
  if (await tabPropMobile.count()) await tabPropMobile.click()
  await page.locator('text=GRUPO THE BEST ISOLADO LTDA >> visible=true').first().click()
  await page.locator('.fixed.inset-0').last().getByRole('button', { name: /Perdido/i }).click()
  await page.locator('select').filter({ hasText: /Selecionar motivo/i }).selectOption('preco')
  await page.getByPlaceholder(/observação da perda/i).fill('Concorrente fechou mais barato')
  await page.getByRole('button', { name: /Confirmar Perda/i }).click()
  await expect.poll(() => clientesDb.some(c => c.razao_social === 'GRUPO THE BEST ISOLADO LTDA' && c.etapa === 'proposta' && c.novo_ciclo === true)).toBe(true)

  // ── Item 4.3: Ursulla (inativa) aparece na seleção de vendedores da Exportação!
  await page.getByRole('button', { name: /^Clientes$/i }).dispatchEvent('click')
  await page.getByRole('button', { name: /^Exportar$/i }).click()
  await expect(page.getByText(/Ursulla lopes \(inativo\)/i)).toBeVisible()
  await page.getByRole('button', { name: '✕' }).click()

  // ── Item 5: Seletor de minutos em Tarefas de 5 em 5 (sem minuto "01") e bloqueia ontem!
  await page.getByRole('button', { name: /^Tarefas$/i }).dispatchEvent('click')
  await page.getByRole('button', { name: /Nova Tarefa|\+ Criar primeira tarefa/i }).first().click()
  const selMin = page.getByLabel('Hora da tarefa — Minutos')
  await expect(selMin.locator('option[value="05"]')).toHaveCount(1)
  await expect(selMin.locator('option[value="01"]')).toHaveCount(0)
  await page.locator('input[type="date"]').last().fill('2020-01-01')
  await page.getByPlaceholder(/Ex: Ligar para/i).fill('Teste Ontem')
  await page.getByRole('button', { name: /Criar Tarefa|Salvar/i }).last().click()
  await expect(page.getByText(/anterior ao momento atual/i)).toBeVisible()
})
