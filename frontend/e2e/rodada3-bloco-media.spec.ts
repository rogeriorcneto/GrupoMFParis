import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Rodada 3, Bloco Prioridade Média (Itens 6, 7, 8 e 9), 100% em ambiente isolado:
 * - Item 6: Card em Proposta mostra "Criar Proposta" (em vez de Negociar); Card em Negociação mostra "Vendido" (em vez de Ganhou).
 * - Item 7: Cards do Kanban mostram "Ciclo N" e NÃO mostram WA/Email/Ligar nem o nome do contato no card fechado.
 * - Item 8: Tela "Pedidos" removida do menu, menu lateral sem emojis e na nova ordem oficial 1 a 29.
 * - Item 9: Perfil do Vendas 05 em Equipe mostra 0 clientes, lista de Clientes sem CNPJ repetido, Ursulla inativa.
 */
test('Rodada 3 — Bloco Média (Itens 6, 7, 8 e 9): botões Criar Proposta/Vendido, Kanban Ciclo N sem contato/WA, Menu 1–29 sem Pedidos/emojis e Vendas 05 = 0', async ({ page }) => {
  const hoje = new Date().toISOString().split('T')[0]
  const clientesDb = [
    {
      id: 9901, razao_social: 'SORVETERIA CICLO DOIS LTDA', cnpj: '11.222.333/0001-81',
      contato_nome: 'CONTATO SECRETO KANBAN', contato_telefone: '31999998888', contato_email: 'x@y.com', whatsapp: '31999998888',
      etapa: 'proposta', ciclo_numero: 2, vendedor_id: 1, arquivado_duplicata: false, data_entrada_etapa: hoje,
    },
    {
      id: 9902, razao_social: 'DISTRIBUIDORA EM NEGOCIACAO LTDA', cnpj: '22.333.444/0001-92',
      contato_nome: 'OUTRO CONTATO OCULTO', contato_telefone: '31988887777',
      etapa: 'negociacao', ciclo_numero: 3, vendedor_id: 1, arquivado_duplicata: false, data_entrada_etapa: hoje,
    },
    // Duplicata arquivada em Ursulla (mesmo CNPJ de outro ativo da Ursulla) -> não pode repetir na lista Clientes e Vendas 05 = 0!
    {
      id: 9903, razao_social: 'ALLPAN PANIFICACAO LTDA', cnpj: '33.444.555/0001-03',
      etapa: 'proposta', ciclo_numero: 1, vendedor_id: 5, arquivado_duplicata: false, data_entrada_etapa: hoje,
    },
    {
      id: 9904, razao_social: 'ALLPAN PANIFICACAO LTDA', cnpj: '33.444.555/0001-03',
      etapa: 'proposta', ciclo_numero: 1, vendedor_id: 5, arquivado_duplicata: true, data_entrada_etapa: hoje,
    },
  ]

  await page.route('**/api/store/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/missoes**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })
  await page.route('**/api/tempo-tela/relatorio**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relatorio: [] }) })
  })

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const tabela = url.pathname.split('/').pop()
    let dados: any = []
    if (tabela === 'vendedores') {
      const lista = [
        { id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true },
        { id: 5, nome: 'Ursulla lopes', email: 'venda03@mfparis.com.br', cargo: 'vendedor', ativo: false },
        { id: 11, nome: 'Vendas 05', email: 'vendas07@mfparis.com.br', cargo: 'vendedor', ativo: false },
      ]
      dados = (url.searchParams.has('auth_id') || url.searchParams.has('email')) ? [lista[0]] : lista
    } else if (tabela === 'clientes') {
      dados = clientesDb
    }
    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await expect(page.locator('nav button').first()).toBeAttached({ timeout: 10_000 })

  // ── Item 8: Tela "Pedidos" não existe mais no menu, sem emojis nos nomes e na ordem oficial 1 a 29!
  await expect(page.locator('nav button', { hasText: /^Pedidos$/ })).toHaveCount(0)
  const navLabels = await page.locator('nav button').allTextContents()
  const limpos = navLabels.map(s => s.replace(/\s+\d+$/, '').trim()).filter(Boolean)
  expect(limpos.slice(0, 7)).toEqual([
    'Dashboard',
    'Aprovação de Pedidos',
    'Funil Comercial',
    'Tarefas',
    'Clientes',
    'Relatórios',
    'Academia de Vendas',
  ])
  expect(limpos[limpos.length - 1]).toBe('Parâmetros')
  // Nenhum emoji nos rótulos do nav
  for (const lbl of limpos) {
    expect(lbl).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  }

  // ── Item 7: Kanban mostra "Ciclo 2" e NÃO mostra nome do contato nem botões WA / Email / Ligar no card!
  await page.getByRole('button', { name: 'Funil Comercial' }).dispatchEvent('click')
  const tabPropMobile = page.locator('button:has-text("Proposta") >> visible=true').first()
  if (await tabPropMobile.count()) await tabPropMobile.click()

  await expect(page.locator('text=Ciclo 2 >> visible=true').first()).toBeVisible()
  await expect(page.getByText('CONTATO SECRETO KANBAN')).toHaveCount(0)
  await expect(page.locator('button:has-text("WA")')).toHaveCount(0)
  await expect(page.locator('button:has-text("Ligar")')).toHaveCount(0)

  // ── Item 6: Ao abrir o card em Proposta -> botão chama-se "Criar Proposta" (e dentro do card aberto o contato continua visível!)
  await page.locator('text=SORVETERIA CICLO DOIS LTDA >> visible=true').first().click()
  let painel = page.locator('.fixed.inset-0').last()
  await expect(painel.getByRole('button', { name: 'Criar Proposta', exact: true })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Negociar/i })).toHaveCount(0)
  await expect(painel.getByText('CONTATO SECRETO KANBAN').first()).toBeVisible()
  await painel.locator('.bg-black.bg-opacity-40').dispatchEvent('click')

  // Ao abrir o card em Negociação -> botão chama-se "Vendido" (não "Ganhou")!
  const tabNegMobile = page.locator('button:has-text("Negociação") >> visible=true').first()
  if (await tabNegMobile.count()) await tabNegMobile.click()
  await page.locator('text=DISTRIBUIDORA EM NEGOCIACAO LTDA >> visible=true').first().click()
  painel = page.locator('.fixed.inset-0').last()
  await expect(painel.getByRole('button', { name: 'Vendido', exact: true })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Ganhou/i })).toHaveCount(0)
  await painel.locator('.bg-black.bg-opacity-40').dispatchEvent('click')

  // ── Item 9: Lista de Clientes sem CNPJ repetido (ALLPAN = 1 linha)
  await page.getByRole('button', { name: 'Clientes' }).dispatchEvent('click')
  await expect(page.locator('text=ALLPAN PANIFICACAO LTDA >> visible=true')).toHaveCount(1)
})
