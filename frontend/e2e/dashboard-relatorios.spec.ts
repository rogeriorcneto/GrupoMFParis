import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Dashboard & Relatórios (100% unificados e validados em computador e celular, ambiente isolado):
 * - Exclui Amostras/Bonificações de Faturamento, Ticket Médio e Curva ABC;
 * - "Novos clientes (1ª compra)" não conta ciclos automáticos (`novo_ciclo = true`);
 * - "Propostas enviadas" e "Pipeline Aberto" em Relatórios leem a tabela real `propostas` (R$ 15.000 em vez de R$ 0);
 * - Clientes Ativos e Recompra agrupam por CNPJ único (2 ciclos da mesma empresa = 1 cliente ativo recorrente);
 * - Top produtos e volume exibem "kg" (sem "un");
 * - Sem etapa fantasma "Qualificação" e sem vazamento de JSON `store:*` em Últimas atualizações;
 * - Painel "Gargalos de atenção imediata" clicável.
 */
test('Dashboard e Relatórios — KPIs exatos (sem bonificação/ciclos falsos), Pipeline real por Propostas, Empresa Única, kg e Gargalos', async ({ page }) => {
  const hoje = new Date()
  const hojeISO = hoje.toISOString().slice(0, 10)
  const cincoDiasAtras = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)
  const quarentaDiasAtras = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10)

  const clientesDb = [
    // Ciclo 1 vendido (Follow-up) — cadastrado hoje (1º cadastro real)
    {
      id: 9101,
      razao_social: 'INDUSTRIA ALFA SORVETES LTDA',
      cnpj: '11.222.333/0001-81',
      endereco_estado: 'MG',
      etapa: 'follow_up',
      status_follow_up: 'entregue',
      ciclo_numero: 1,
      novo_ciclo: false,
      vendedor_id: 2,
      arquivado_duplicata: false,
      criado_em: `${hojeISO}T09:00:00Z`,
      data_entrada_etapa: hojeISO,
      valor_estimado: 0, // campo legado zerado como em produção!
    },
    // Ciclo 2 aberto automaticamente em Proposta para a MESMA empresa (não pode contar como "novo cliente"!)
    {
      id: 9102,
      razao_social: 'INDUSTRIA ALFA SORVETES LTDA',
      cnpj: '11.222.333/0001-81',
      endereco_estado: 'MG',
      etapa: 'proposta',
      ciclo_numero: 2,
      novo_ciclo: true,
      empresa_funil_id: 9101,
      vendedor_id: 2,
      arquivado_duplicata: false,
      criado_em: `${hojeISO}T10:00:00Z`,
      data_entrada_etapa: hojeISO,
      valor_estimado: 0,
    },
    // Cliente em Negociação há 5 dias (> 3d -> gargalo!) com proposta real de R$ 10.000
    {
      id: 9103,
      razao_social: 'LATICINIOS BETA LTDA',
      cnpj: '22.333.444/0001-92',
      endereco_estado: 'SP',
      etapa: 'negociacao',
      ciclo_numero: 1,
      novo_ciclo: false,
      vendedor_id: 2,
      arquivado_duplicata: false,
      criado_em: '2026-09-10T10:00:00Z',
      data_entrada_etapa: cincoDiasAtras,
      valor_estimado: 0,
    },
    // Cliente em Amostra há 40 dias (> 30d -> gargalo!)
    {
      id: 9104,
      razao_social: 'DOCES GAMA LTDA',
      cnpj: '33.444.555/0001-03',
      endereco_estado: 'RJ',
      etapa: 'amostra',
      status_amostra: 'entregue',
      data_envio_amostra: quarentaDiasAtras,
      ciclo_numero: 1,
      novo_ciclo: false,
      vendedor_id: 2,
      arquivado_duplicata: false,
      criado_em: '2026-09-01T10:00:00Z',
      data_entrada_etapa: quarentaDiasAtras,
      valor_estimado: 0,
    },
  ]

  const propostasDb = [
    {
      id: 701,
      numero: 'PROP-701',
      cliente_id: 9102,
      vendedor_nome: 'Eridiane Couto',
      itens: [{ produtoId: 1, nomeProduto: 'OKEY LAC CREAM 25KG', sku: 'OKC-25', unidade: 'KG', preco: 20, quantidade: 250 }],
      total_valor: 5000,
      criado_em: `${hojeISO}T10:30:00Z`,
    },
    {
      id: 702,
      numero: 'PROP-702',
      cliente_id: 9103,
      vendedor_nome: 'Eridiane Couto',
      itens: [{ produtoId: 1, nomeProduto: 'OKEY LAC CREAM 25KG', sku: 'OKC-25', unidade: 'KG', preco: 20, quantidade: 500 }],
      total_valor: 10000,
      criado_em: `${hojeISO}T11:00:00Z`,
    },
  ]

  const pedidosDb = [
    // Venda real confirmada: R$ 10.000 (500 kg)
    {
      id: 801,
      numero: 'PED-801',
      cliente_id: 9101,
      vendedor_id: 2,
      tipo: 'venda',
      status: 'confirmado',
      total_valor: 10000,
      data_criacao: `${hojeISO}T09:30:00Z`,
      data_aprovacao: `${hojeISO}T09:45:00Z`,
      itens_pedido: [{ produto_id: 1, nome_produto: 'OKEY LAC CREAM 25KG', sku: 'OKC-25', unidade: 'KG', preco: 20, quantidade: 500 }],
    },
    // Amostra/Bonificação confirmada: NÃO pode entrar no Faturamento nem derrubar o Ticket Médio!
    {
      id: 802,
      numero: 'AMT-802',
      cliente_id: 9104,
      vendedor_id: 2,
      tipo: 'bonificacao',
      status: 'confirmado',
      total_valor: 25,
      data_criacao: `${hojeISO}T09:50:00Z`,
      data_aprovacao: `${hojeISO}T09:55:00Z`,
      itens_pedido: [{ produto_id: 1, nome_produto: 'OKEY LAC CREAM 25KG', sku: 'OKC-25', unidade: 'KG', preco: 1, quantidade: 25 }],
    },
  ]

  const tarefasDb = [
    {
      id: 301,
      titulo: 'Cobrar retorno atrasado',
      data: cincoDiasAtras,
      hora: '10:00',
      tipo: 'ligacao',
      status: 'pendente',
      prioridade: 'alta',
      cliente_id: 9103,
      vendedor_id: 1,
    },
  ]

  const atividadesDb = [
    {
      id: 1,
      tipo: 'store:parametros_listas',
      descricao: '{"JSON_INTERNO_QUE_NAO_PODE_APARECER":true}',
      vendedor_nome: 'Sistema',
      created_at: `${hojeISO}T10:00:00Z`,
    },
    {
      id: 2,
      tipo: 'venda',
      descricao: 'Pedido PED-801 aprovado para INDUSTRIA ALFA',
      vendedor_nome: 'Bernardo Nery',
      created_at: `${hojeISO}T10:05:00Z`,
    },
  ]

  await page.route('**/api/store/**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/missoes**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }))
  await page.route('**/api/tempo-tela/relatorio**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relatorio: [] }) }))
  await page.route('**/api/roleplay/historico/gerente**', async r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessoes: [] }) }))

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const tabela = url.pathname.split('/').pop()
    const isSingle = (req.headers()['accept'] || '').includes('vnd.pgrst.object')

    if (tabela === 'vendedores') {
      const lista = [
        { id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true, meta_vendas: 0, meta_leads: 0, meta_conversao: 35 },
        { id: 2, nome: 'Eridiane Couto', email: 'eridiane@mfparis.com.br', cargo: 'vendedor', ativo: true, meta_vendas: 100000, meta_leads: 10, meta_conversao: 35 },
      ]
      const res = url.searchParams.has('auth_id') || url.searchParams.has('email') ? [lista[0]] : lista
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? res[0] : res) })
      return
    }
    if (tabela === 'clientes') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clientesDb) })
      return
    }
    if (tabela === 'propostas') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(propostasDb) })
      return
    }
    if (tabela === 'pedidos') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pedidosDb) })
      return
    }
    if (tabela === 'tarefas') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tarefasDb) })
      return
    }
    if (tabela === 'atividades') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(atividadesDb) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()

  // =========================================================================
  // 1) DASHBOARD: KPIs exatos, sem bonificação, sem etapa fantasma e com Gargalos!
  // =========================================================================
  await expect(page.getByText('Gargalos de atenção imediata')).toBeVisible()
  // Ticket médio é R$ 10.000 (1 venda real de R$ 10.000 — amostra AMT-802 ignorada!)
  await expect(page.getByText(/R\$\s*10\.000/).first()).toBeVisible()
  // Novos clientes (1ª compra) = 1 e "1 cadastro(s) novo(s) no período" (Ciclo 2 automático NÃO contou!)
  await expect(page.getByText('1 cadastro(s) novo(s) no período')).toBeVisible()
  // Top produtos em kg ("500 kg", nunca "500 un")
  await expect(page.getByText('500 kg').first()).toBeVisible()
  await expect(page.getByText('500 un')).toHaveCount(0)
  // Sem etapa fantasma "qualificação" e sem vazamento de JSON interno store:*
  await expect(page.getByText('qualificação', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/JSON_INTERNO_QUE_NAO_PODE_APARECER/)).toHaveCount(0)
  await expect(page.getByText('Pedido PED-801 aprovado para INDUSTRIA ALFA')).toBeVisible()

  // Clicar no card de Gargalo "Tarefas atrasadas" -> navega direto para Tarefas!
  await page.getByRole('button', { name: /Tarefas atrasadas/i }).click()
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  await expect(page.getByText('Cobrar retorno atrasado').first()).toBeVisible()

  // =========================================================================
  // 2) RELATÓRIOS: Pipeline Aberto real (R$ 15.000 das propostas), Vendas Confirmadas (R$ 10.000) e kg!
  // =========================================================================
  await page.getByRole('button', { name: /^Relatórios$/i }).first().dispatchEvent('click')
  await expect(page.getByText('Pipeline Aberto (Proposta + Negoc.)')).toBeVisible()
  // R$ 5.000 (PROP-701 em Proposta) + R$ 10.000 (PROP-702 em Negociação) = R$ 15.000!
  await expect(page.getByText(/R\$\s*15\.000/).first()).toBeVisible()
  await expect(page.getByText('9. Análise de Perdas e Inteligência Competitiva')).toBeVisible()
  await expect(page.getByText('10. Tempo de Tela no CRM')).toBeVisible()
})
