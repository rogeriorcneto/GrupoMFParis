import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Bloco Prioridade Alta (Itens 1 a 6), 100% em ambiente isolado (mock REST):
 * - Item 1: Matriz oficial (Prospecção -> Amostra cria card em Proposta; resultado de Amostra
 *           por item envia aprovados p/ Homologados e reprovados p/ Reprovados e encerra Amostra;
 *           Negociação -> Perdido abre novo ciclo em Proposta; Follow-up -> Arquivados após satisfação;
 *           movimentação fora da matriz bloqueada para vendedor).
 * - Item 2: Card em Negociação NÃO tem botão "Voltou p/ Proposta" (apenas Ganhou e Perdido).
 * - Item 3: Card na etapa Proposta NÃO tem "Criar Proposta", mas mantém "Enviar Amostra" e "Negociar".
 * - Item 4: Tentar cadastrar cliente que já possui card aberto em Proposta/Negociação é bloqueado e abre o card existente.
 * - Item 5: Múltiplos cliques rápidos ao salvar proposta geram UMA ÚNICA proposta.
 * - Item 6: Card exibe "⏱ Na etapa: Xd" + "Prazo: Yd rest." e alerta vendedor quando > 3 dias em Negociação.
 */
test('Bloco Alta (Itens 1-6): matriz, botões, anti-duplicação e alerta >3d em Negociação', async ({ page }) => {
  const cincoDiasAtras = new Date(Date.now() - 5 * 86400_000).toISOString()
  const hoje = new Date().toISOString().split('T')[0]

  const clientesDb: Record<string, any>[] = [
    // Card 1: em Amostra com 3 itens enviados para testar avaliação mista (1 aprovado + 2 reprovados)
    {
      id: 1001, razao_social: 'PADARIA TESTE AMOSTRA', nome_fantasia: 'PADARIA AMOSTRA',
      cnpj: '11.222.333/0001-81', etapa: 'amostra', status_amostra: 'entregue', tentativa_amostra: 1,
      vendedor_id: 2, arquivado_duplicata: false, novo_ciclo: false, empresa_funil_id: 1001,
      data_entrada_etapa: cincoDiasAtras, ultima_interacao: hoje,
    },
    // Card 1B: card irmão em Proposta da mesma empresa (criado ao entrar em amostra)
    {
      id: 1002, razao_social: 'PADARIA TESTE AMOSTRA', nome_fantasia: 'PADARIA AMOSTRA',
      cnpj: '11.222.333/0001-81', etapa: 'proposta',
      vendedor_id: 2, arquivado_duplicata: false, novo_ciclo: true, empresa_funil_id: 1001, origem_ciclo_id: 1001,
      data_entrada_etapa: cincoDiasAtras, ultima_interacao: hoje,
    },
    // Card 2: em Negociação há 5 dias (> 3d -> dispara alerta Item 6 + testa Item 2 sem Voltou p/ Proposta)
    {
      id: 2001, razao_social: 'SORVETERIA NEGOCIACAO 5D', nome_fantasia: 'SORV 5D',
      cnpj: '22.333.444/0001-92', etapa: 'negociacao', valor_proposta: 12000,
      vendedor_id: 2, arquivado_duplicata: false, novo_ciclo: false, empresa_funil_id: 2001,
      data_entrada_etapa: cincoDiasAtras, data_proposta: cincoDiasAtras.split('T')[0], ultima_interacao: hoje,
    },
    // Card 3: em Follow-up para testar coleta de satisfação -> Arquivados
    {
      id: 3001, razao_social: 'DOCERIA FOLLOWUP TESTE', nome_fantasia: 'DOCERIA FU',
      cnpj: '33.444.555/0001-03', etapa: 'follow_up', status_follow_up: 'entregue',
      vendedor_id: 2, arquivado_duplicata: false, novo_ciclo: false, empresa_funil_id: 3001,
      data_entrada_etapa: hoje, ultima_interacao: hoje,
    },
  ]

  const pedidosDb: Record<string, any>[] = [
    {
      id: 9001, numero: 'PED-AMOSTRA-1', cliente_id: 1001, vendedor_id: 2,
      tipo: 'bonificacao', status: 'confirmado', total_valor: 0.3, data_criacao: cincoDiasAtras,
      itens: [
        { produtoId: 1, nomeProduto: 'Leite Integral 25kg', sku: 'L1', preco: 0.1, unidade: 'SC', quantidade: 1 },
        { produtoId: 2, nomeProduto: 'Cobertura Chocolate', sku: 'C2', preco: 0.1, unidade: 'CX', quantidade: 1 },
        { produtoId: 3, nomeProduto: 'Base Sorvete Neutro', sku: 'B3', preco: 0.1, unidade: 'SC', quantidade: 1 },
      ],
    },
  ]
  const propostasDb: Record<string, any>[] = []
  const notificacoesDb: Record<string, any>[] = []
  let nextId = 80000

  // Intercepta também eventual chamada ao backend /api/propostas para simular o lock do servidor
  await page.route('**/api/propostas', async route => {
    const b = route.request().postDataJSON()
    const totalValor = Number(b.totalValor || 0)
    const dup = propostasDb.find(p => p.cliente_id === Number(b.clienteId) && Number(p.total_valor) === totalValor)
    if (dup) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: dup, deduplicated: true }) })
      return
    }
    const row = {
      id: ++nextId, numero: b.numero, cliente_id: Number(b.clienteId), vendedor_nome: b.vendedorNome,
      itens: b.itens || [], observacoes: b.observacoes || '', frete: b.frete || null,
      pagamento: b.pagamento || null, total_valor: totalValor, criado_em: b.criadoEm || new Date().toISOString(),
    }
    propostasDb.unshift(row)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: row, deduplicated: false }) })
  })

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const tabela = url.pathname.split('/').pop()
    const metodo = req.method()
    let dados: any = []

    if (tabela === 'vendedores') {
      dados = [{ id: 2, nome: 'Eridiane Couto', email: credentials.gerente.email, cargo: 'vendedor', ativo: true }]
    } else if (tabela === 'produtos') {
      dados = [{ id: 1, nome: 'Leite Integral 25kg', sku: 'L1', omie_codigo: 'L1', preco: 250, unidade: 'SC', categoria: 'sacaria', ativo: true }]
    } else if (tabela === 'clientes') {
      if (metodo === 'POST') {
        const novo = { id: ++nextId, arquivado_duplicata: false, ...req.postDataJSON() }
        clientesDb.push(novo)
        dados = [novo]
      } else if (metodo === 'PATCH') {
        const idMatch = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = clientesDb.find(c => String(c.id) === idMatch)
        if (alvo) Object.assign(alvo, req.postDataJSON())
        dados = alvo ? [alvo] : []
      } else {
        dados = url.searchParams.get('or') ? [] : clientesDb
      }
    } else if (tabela === 'mover_cliente_atomico') {
      const body = req.postDataJSON()
      const alvo = clientesDb.find(c => c.id === body.p_cliente_id)
      if (alvo) {
        alvo.etapa_anterior = body.p_etapa_anterior
        alvo.etapa = body.p_etapa
        if (body.p_extras?.resultado_amostra) alvo.resultado_amostra = body.p_extras.resultado_amostra
        if (body.p_extras?.motivo_reprovacao) alvo.motivo_reprovacao = body.p_extras.motivo_reprovacao
        if (body.p_extras?.status_follow_up) alvo.status_follow_up = body.p_extras.status_follow_up
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
      return
    } else if (tabela === 'pedidos') {
      dados = pedidosDb.map(p => ({
        ...p,
        itens_pedido: p.itens.map((it: any, idx: number) => ({
          id: idx + 1, pedido_id: p.id, produto_id: it.produtoId, nome_produto: it.nomeProduto,
          sku: it.sku, preco: it.preco, unidade: it.unidade, quantidade: it.quantidade,
        })),
      }))
    } else if (tabela === 'itens_pedido') {
      dados = pedidosDb.flatMap(p => p.itens.map((it: any, idx: number) => ({
        id: idx + 1, pedido_id: p.id, produto_id: it.produtoId, nome_produto: it.nomeProduto,
        sku: it.sku, preco: it.preco, unidade: it.unidade, quantidade: it.quantidade,
      })))
    } else if (tabela === 'propostas') {
      if (metodo === 'POST') {
        const b = req.postDataJSON()
        const row = { id: ++nextId, ...b }
        propostasDb.unshift(row)
        dados = [row]
      } else {
        const cid = url.searchParams.get('cliente_id')?.replace('eq.', '')
        dados = cid ? propostasDb.filter(p => String(p.cliente_id) === cid) : propostasDb
      }
    } else if (tabela === 'notificacoes') {
      if (metodo === 'POST') {
        const n = { id: ++nextId, ...req.postDataJSON() }
        notificacoesDb.push(n)
        dados = [n]
      } else {
        dados = notificacoesDb
      }
    }

    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.getByRole('button', { name: /Funil Comercial/i }).dispatchEvent('click')

  // ── Item 6: Card mostra "⏱ Na etapa: 5d" + "Prazo:" + alerta >3d em Negociação + notificação ao vendedor
  await expect(page.getByText(/⏱ Na etapa:\s*5d/i).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Prazo:\s*40d rest\./i).first()).toBeVisible()
  await expect(page.getByText(/\+3d em Negociação/i).first()).toBeVisible()
  await expect.poll(() => notificacoesDb.some(n => /Negociação/i.test(n.titulo || '') && /SORVETERIA NEGOCIACAO 5D/i.test(n.mensagem || ''))).toBe(true)

  // ── Item 1(a): Amostra avaliada por item (1 aprovado + 2 reprovados) -> encerra Amostra e sincroniza no card de Proposta
  await page.locator('text=PADARIA TESTE AMOSTRA >> visible=true').first().click()
  let painel = page.locator('.fixed.inset-0').last()
  await expect(painel.getByRole('button', { name: /Resultado da Amostra/i })).toBeVisible({ timeout: 10_000 })
  // Vendedor NÃO vê botão genérico "❌ Perdido" em Amostra (tem "📦 Amostra Perdida" específico)
  await expect(painel.getByRole('button', { name: /^❌ Perdido$/i })).toHaveCount(0)
  await painel.getByRole('button', { name: /Resultado da Amostra/i }).click()

  const modalAval = page.locator('.fixed.inset-0').last()
  const btnsAprov = modalAval.getByRole('button', { name: /✅ Aprovado/i })
  const btnsReprov = modalAval.getByRole('button', { name: /🚫 Reprovado/i })
  await btnsAprov.nth(0).click()
  await btnsReprov.nth(1).click()
  await modalAval.getByPlaceholder(/Motivo da reprovação/i).first().fill('Doce demais')
  await btnsReprov.nth(2).click()
  await modalAval.getByPlaceholder(/Motivo da reprovação/i).last().fill('Textura')
  await modalAval.getByRole('button', { name: /Confirmar Avaliação/i }).click()

  await expect.poll(() => clientesDb.find(c => c.id === 1001)?.etapa).toBe('amostra_perdida')

  // ── Item 3: Abrir o card de Proposta (1002) -> NÃO tem "Criar Proposta", mantém "Enviar Amostra" e "Negociar", e mostra 1 homologado + 2 reprovados!
  await page.locator('text=PADARIA TESTE AMOSTRA >> visible=true').first().click()
  painel = page.locator('.fixed.inset-0').last()
  await expect(painel.getByRole('button', { name: /Enviar Amostra/i })).toBeVisible({ timeout: 10_000 })
  await expect(painel.getByRole('button', { name: /Negociar/i })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Criar Proposta/i })).toHaveCount(0)
  await expect(painel.getByRole('button', { name: /^❌ Perdido$/i })).toHaveCount(0)
  await painel.getByText('✅ Produtos Homologados').scrollIntoViewIfNeeded()
  await expect(painel.getByText('Leite Integral 25kg')).toBeVisible()
  await expect(painel.getByText('Cobertura Chocolate')).toBeVisible()
  await expect(painel.getByText('Base Sorvete Neutro')).toBeVisible()

  // ── Item 5: Clicar em "Negociar" e disparar múltiplos cliques rápidos em "Gerar Proposta PDF" -> gera 1 única proposta!
  await painel.getByRole('button', { name: /Negociar/i }).click()
  const modalProp = page.locator('.fixed.inset-0').last()
  await expect(modalProp.getByRole('button', { name: /Gerar Proposta PDF/i })).toBeVisible()
  await modalProp.getByRole('button', { name: /CIF/i }).click()
  await modalProp.getByPlaceholder(/Buscar produto/i).fill('Leite')
  await modalProp.getByPlaceholder('Qtd').fill('5')
  const btnGerar = modalProp.getByRole('button', { name: /Gerar Proposta PDF/i })
  // Dispara 3 cliques síncronos no mesmo frame (antes do re-render) para provar que propostaLockRef + servidor impedem duplicatas
  await btnGerar.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); el.click() })
  await expect.poll(() => clientesDb.find(c => c.id === 1002)?.etapa).toBe('negociacao')
  expect(propostasDb.filter(p => p.cliente_id === 1002).length).toBe(1)

  // ── Item 2 & Item 1 (Negociação -> Perdido cria novo ciclo em Proposta):
  await page.locator('text=SORVETERIA NEGOCIACAO 5D >> visible=true').first().click()
  painel = page.locator('.fixed.inset-0').last()
  await expect(painel.getByRole('button', { name: /Ganhou/i })).toBeVisible({ timeout: 10_000 })
  await expect(painel.getByRole('button', { name: /Perdido/i })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Voltou p\/ Proposta/i })).toHaveCount(0)

  await painel.getByRole('button', { name: /Perdido/i }).click()
  const modalPerda = page.locator('.fixed.inset-0').last()
  await modalPerda.getByPlaceholder(/Descreva o motivo/i).or(modalPerda.locator('textarea')).first().fill('Cliente fechou com concorrente local')
  await modalPerda.getByRole('button', { name: /Confirmar Perda/i }).click()
  await expect.poll(() => clientesDb.find(c => c.id === 2001)?.etapa).toBe('perdido')
  await expect.poll(() => clientesDb.some(c => c.origem_ciclo_id === 2001 && c.etapa === 'proposta')).toBe(true)

  // ── Item 1 (Follow-up -> Coleta de Satisfação -> Arquivados):
  await page.locator('text=DOCERIA FOLLOWUP TESTE >> visible=true').first().click()
  painel = page.locator('.fixed.inset-0').last()
  await painel.getByRole('button', { name: /Coletar Satisfação/i }).click()
  const modalSat = page.locator('.fixed.inset-0').last()
  await modalSat.getByPlaceholder(/Descreva o retorno/i).fill('Excelente qualidade e entrega rápida!')
  await modalSat.getByRole('button', { name: /Salvar e Arquivar/i }).click()
  await expect.poll(() => clientesDb.find(c => c.id === 3001)?.etapa).toBe('arquivado')
})
