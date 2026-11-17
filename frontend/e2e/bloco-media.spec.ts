import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Bloco Prioridade Média (Itens 7, 9, 10 e 11), 100% em ambiente isolado (mock REST):
 * - Item 7: Valores de Pipeline e Prevista/Pipeline ponderado batem entre Dashboard e Funil usando propostas ativas.
 * - Item 9: Cadastro por CPF com razao_social vazia (#23369) exibe o nome da pessoa como título do card.
 * - Item 10: Agenda de hoje mostra contagem real, deduplica tarefas repetidas e formata hora sempre em hh:mm.
 * - Item 11: Tempo de tela CRM ignora usuários inativos/duplicados.
 */
test('Bloco Média (Itens 7, 9, 10, 11): valores unificados, CPF com título, agenda hh:mm sem duplicadas e tempo de tela limpo', async ({ page }) => {
  const now = new Date()
  const hoje = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const clientesDb = [
    // Card em Proposta: valor_estimado = 0, mas tem proposta ativa de R$ 10.000 (ponderado 80% = R$ 8.000)
    {
      id: 101, razao_social: 'DISTRIBUIDORA PROPOSTA ATIVA', nome_fantasia: 'DIST ATIVA',
      cnpj: '11.222.333/0001-81', etapa: 'proposta', vendedor_id: 2,
      valor_estimado: 0, valor_proposta: null, arquivado_duplicata: false,
      data_entrada_etapa: hoje, ultima_interacao: hoje,
    },
    // Card por CPF sem razao_social (caso real #23369 Isabelle) em Negociação com proposta de R$ 20.000 (ponderado 95% = R$ 19.000)
    // Total Pipeline = R$ 30.000 | Total Ponderado/Prevista = R$ 27.000
    {
      id: 23369, razao_social: '', nome_fantasia: 'Isabelle Rosa Portal Diniz', contato_nome: 'Isabelle',
      cpf: '198.567.467-01', cnpj: '', etapa: 'negociacao', vendedor_id: 2,
      valor_estimado: 0, valor_proposta: 20000, arquivado_duplicata: false,
      data_entrada_etapa: hoje, data_proposta: hoje, ultima_interacao: hoje,
    },
  ]

  const propostasDb = [
    {
      id: 501, numero: 'PROP-100001', cliente_id: 101, vendedor_nome: 'Eridiane Couto',
      itens: [{ produtoId: 1, nomeProduto: 'Leite 25kg', sku: 'L1', preco: 250, unidade: 'SC', quantidade: 40 }],
      observacoes: '', frete: 'CIF', pagamento: '28 dias', total_valor: 10000, criado_em: new Date().toISOString(),
    },
  ]

  const tarefasDb = [
    // Duas tarefas repetidas para o mesmo cliente hoje com hora "09:30:00" + uma visita sem hora ("")
    { id: 701, titulo: 'Cobrar resposta proposta — DISTRIBUIDORA PROPOSTA ATIVA', data: hoje, hora: '09:30:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', cliente_id: 101, vendedor_id: 2 },
    { id: 702, titulo: 'Cobrar resposta proposta — DISTRIBUIDORA PROPOSTA ATIVA', data: hoje, hora: '09:30:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', cliente_id: 101, vendedor_id: 2 },
    { id: 703, titulo: 'Visita comercial presencial', data: hoje, hora: null, tipo: 'visita', status: 'pendente', prioridade: 'alta', cliente_id: 23369, vendedor_id: 2 },
  ]

  await page.route('**/api/tempo-tela/relatorio**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        relatorio: [
          { vendedorId: 2, nome: 'Eridiane Couto', totalSegundos: 7200 },
          { vendedorId: 9, nome: 'Ricardo Goes', totalSegundos: 0 }, // inativo -> deve ser filtrado
        ],
      }),
    })
  })

  await page.route('**/api/missoes**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const tabela = url.pathname.split('/').pop()
    let dados: any = []

    if (tabela === 'vendedores') {
      const listaVend = [
        { id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true },
        { id: 2, nome: 'Eridiane Couto', email: 'vendas04@mfparis.com.br', cargo: 'vendedor', ativo: true },
        { id: 9, nome: 'Ricardo Goes', email: 'ricardo@mfparis', cargo: 'vendedor', ativo: false },
      ]
      dados = (url.searchParams.has('auth_id') || url.searchParams.has('email')) ? [listaVend[0]] : listaVend
    } else if (tabela === 'clientes') {
      dados = clientesDb
    } else if (tabela === 'propostas') {
      dados = propostasDb
    } else if (tabela === 'tarefas') {
      dados = tarefasDb
    }

    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()

  // ── Dashboard: Item 7 (Pipeline ponderado R$ 27.000 e Total em pipeline R$ 30.000), Item 10 (Agenda de hoje) e Item 11 (Tempo de tela sem Ricardo Goes inativo)
  await expect(page.getByText(/R\$\s*27\.000/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/R\$\s*30\.000/).first()).toBeVisible()

  // Item 10: 2 atividades únicas (a duplicada #702 foi filtrada) · 1 visita, horários em hh:mm ("09:30" e "09:00", zero "09:30:00" e zero "--:--")
  await expect(page.getByText(/2 atividades\s*·\s*1 visita/i)).toBeVisible()
  await expect(page.getByText('09:30', { exact: true })).toBeVisible()
  await expect(page.getByText('09:00', { exact: true })).toBeVisible()
  await expect(page.getByText('09:30:00')).toHaveCount(0)
  await expect(page.getByText('--:--')).toHaveCount(0)

  // Item 11: Eridiane aparece no Tempo de tela, Ricardo Goes (inativo) NÃO aparece
  await expect(page.getByText('Ricardo Goes')).toHaveCount(0)

  // ── Funil Comercial: Item 7 (PIPELINE = R$ 30.000 e PREVISTA = R$ 27.000 batendo com o Dashboard!) + Item 9 (card CPF #23369 com nome Isabelle Rosa Portal Diniz)
  await page.getByRole('button', { name: /Funil Comercial/i }).dispatchEvent('click')
  await expect(page.locator('text=Isabelle Rosa Portal Diniz >> visible=true').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/R\$\s*30\.000/).first()).toBeVisible()
  await expect(page.getByText(/R\$\s*27\.000/).first()).toBeVisible()
})
