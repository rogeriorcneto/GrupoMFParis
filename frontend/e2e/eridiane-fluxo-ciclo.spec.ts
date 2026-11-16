import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Regressão dos problemas reportados pela vendedora Eridiane:
 * 1) Cliente cujo card raiz foi arquivado (arquivado_duplicata=true) e que só
 *    possui card com novo_ciclo=true (ex.: SORVEMAX) deve aparecer normalmente
 *    na aba "Clientes".
 * 2) Cliente em follow_up clicado em "novos ciclos" gera um novo card em
 *    "Negociação" (preservando o follow_up anterior), aparece no Kanban e
 *    permite clicar em "🎉 Ganhou" para enviar o pedido de aprovação.
 */
test('vendedora vê cliente de novo ciclo na lista Clientes e consegue gerar proposta -> Negociação -> Ganhou', async ({ page }) => {
  const hoje = new Date().toISOString().split('T')[0]
  const clientesDb: Record<string, any>[] = [
    // Caso SORVEMAX: card raiz arquivado + único card ativo com novo_ciclo=true
    {
      id: 22575, razao_social: 'SORVEMAX TESTE LTDA', nome_fantasia: 'SORVEMAX',
      cnpj: '42.130.639/0001-31', etapa: 'follow_up', vendedor_id: 2,
      arquivado_duplicata: true, novo_ciclo: false, empresa_funil_id: 22575,
      ultima_interacao: hoje, data_entrada_etapa: hoje,
    },
    {
      id: 24119, razao_social: 'SORVEMAX TESTE LTDA', nome_fantasia: 'SORVEMAX',
      cnpj: '42.130.639/0001-31', etapa: 'proposta', vendedor_id: 2,
      arquivado_duplicata: false, novo_ciclo: true, empresa_funil_id: 22575, origem_ciclo_id: 22575,
      ultima_interacao: hoje, data_entrada_etapa: hoje,
    },
    // Caso OBA OBA ICE: cliente em follow_up iniciando recompra -> deve virar card em Negociação e liberar Ganhou
    {
      id: 22715, razao_social: 'SORVETERIA OBA OBA ICE TESTE', nome_fantasia: 'OBA OBA ICE',
      cnpj: '30.109.328/0001-01', etapa: 'follow_up', status_follow_up: 'entregue',
      vendedor_id: 2, arquivado_duplicata: false, novo_ciclo: false, empresa_funil_id: 22715,
      ultima_interacao: hoje, data_entrada_etapa: hoje,
    },
  ]

  const propostasDb: Record<string, any>[] = []
  const pedidosDb: Record<string, any>[] = []
  let nextId = 50000

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const tabela = url.pathname.split('/').pop()
    const metodo = req.method()
    let dados: any = []

    if (tabela === 'vendedores') {
      dados = [{ id: 2, nome: 'Eridiane Couto', email: credentials.gerente.email, cargo: 'vendedor', ativo: true }]
    } else if (tabela === 'produtos') {
      dados = [{ id: 101, nome: 'Leite em Pó Integral 25kg', sku: 'LPI-25', omie_codigo: 'LPI-25', preco: 250, unidade: 'SC', categoria: 'sacaria', ativo: true }]
    } else if (tabela === 'clientes') {
      if (metodo === 'POST') {
        const body = req.postDataJSON()
        const novo = { id: ++nextId, arquivado_duplicata: false, ...body }
        clientesDb.push(novo)
        dados = [novo]
      } else if (metodo === 'PATCH') {
        const idMatch = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = clientesDb.find(c => String(c.id) === idMatch)
        if (alvo) Object.assign(alvo, req.postDataJSON())
        dados = alvo ? [alvo] : []
      } else {
        const orParam = url.searchParams.get('or')
        if (orParam) {
          // Anti-duplicata query
          dados = []
        } else {
          dados = clientesDb
        }
      }
    } else if (tabela === 'mover_cliente_atomico') {
      const body = req.postDataJSON()
      const alvo = clientesDb.find(c => c.id === body.p_cliente_id)
      if (alvo) {
        alvo.etapa_anterior = body.p_etapa_anterior
        alvo.etapa = body.p_etapa
        Object.assign(alvo, body.p_extras || {})
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
      return
    } else if (tabela === 'propostas') {
      if (metodo === 'POST') {
        const nova = { id: ++nextId, ...req.postDataJSON() }
        propostasDb.unshift(nova)
        dados = [nova]
      } else {
        const cid = url.searchParams.get('cliente_id')?.replace('eq.', '')
        dados = cid ? propostasDb.filter(p => String(p.cliente_id) === cid) : propostasDb
      }
    } else if (tabela === 'pedidos') {
      if (metodo === 'POST') {
        const novoPed = { id: ++nextId, ...req.postDataJSON() }
        pedidosDb.push(novoPed)
        dados = [novoPed]
      } else {
        dados = pedidosDb
      }
    } else if (tabela === 'itens_pedido') {
      dados = metodo === 'POST' ? req.postDataJSON() : []
    }

    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()

  // 1) Aba Clientes: SORVEMAX (cujo único card ativo tem novo_ciclo=true) DEVE estar visível
  await page.getByRole('button', { name: /^Clientes$/i }).dispatchEvent('click')
  await expect(page.locator('text=SORVEMAX TESTE LTDA >> visible=true').first()).toBeVisible({ timeout: 15_000 })

  // 2) Funil Comercial: buscar OBA OBA ICE (que está em follow_up -> aparece em novos ciclos)
  await page.getByRole('button', { name: /Funil Comercial/i }).dispatchEvent('click')
  const buscaFunil = page.getByPlaceholder(/buscar|pesquisar/i).first()
  await buscaFunil.fill('OBA OBA ICE TESTE')
  await page.waitForTimeout(1_000)

  // Clicar no card em Follow-up -> abre o ClientePanel -> clicar em "📝 Criar Proposta"
  await page.getByText('SORVETERIA OBA OBA ICE TESTE', { exact: true }).last().click()
  const painelFollowUp = page.locator('.fixed.inset-0').last()
  await expect(painelFollowUp.getByRole('button', { name: /Criar Proposta/i })).toBeVisible({ timeout: 15_000 })
  await painelFollowUp.getByRole('button', { name: /Criar Proposta/i }).click()

  // Modal de proposta deve abrir para criar o novo ciclo em Negociação
  const modal = page.locator('.fixed.inset-0').last()
  await expect(modal.getByRole('button', { name: /Gerar Proposta/i })).toBeVisible({ timeout: 15_000 })

  await modal.getByRole('button', { name: /CIF/i }).click()
  await modal.getByPlaceholder(/Buscar produto/i).fill('Leite')
  await modal.getByPlaceholder('Qtd').fill('10')
  await modal.getByRole('button', { name: /Gerar Proposta/i }).click()

  // Deve ter criado um NOVO card em negociação para a vendedora 2 (preservando 22715 em follow_up)
  await expect.poll(() => clientesDb.filter(c => c.razao_social === 'SORVETERIA OBA OBA ICE TESTE' && c.etapa === 'negociacao').length).toBe(1)
  const cardNegociacao = clientesDb.find(c => c.razao_social === 'SORVETERIA OBA OBA ICE TESTE' && c.etapa === 'negociacao')!
  expect(cardNegociacao.vendedor_id).toBe(2)
  expect(clientesDb.find(c => c.id === 22715)?.etapa).toBe('follow_up')

  // 3) Abrir o card em Negociação (à esquerda do de Follow-up) e clicar em "🎉 Ganhou" -> deve gerar o pedido enviado para aprovação!
  await page.getByText('SORVETERIA OBA OBA ICE TESTE', { exact: true }).first().click()

  const painel = page.locator('.fixed.inset-0').last()
  const btnGanhou = painel.getByRole('button', { name: /Ganhou/i })
  await expect(btnGanhou).toBeVisible({ timeout: 15_000 })
  await btnGanhou.click()

  await expect.poll(() => pedidosDb.length).toBe(1)
  expect(pedidosDb[0].cliente_id).toBe(cardNegociacao.id)
  expect(pedidosDb[0].vendedor_id).toBe(2)
  expect(pedidosDb[0].status).toBe('enviado')
})
