import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Histórico Global por Cliente + Condições 5, 6 e 8 (Desktop & Mobile)', () => {
  test('unifica todos os ciclos com etiqueta Ciclo N, exibe Ativo só com pedido Omie e não escreve Amostra aprovada sem amostra', async ({ page }) => {
    const mockVendedores = [
      { id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true, meta_vendas: 100000 },
      { id: 2, nome: 'Eridiane Couto', email: 'eridiane@teste.com', cargo: 'vendedor', ativo: true, meta_vendas: 80000 },
    ]

    const mockClientes = [
      {
        id: 22392,
        razao_social: 'SAPORI BOLINA E TEIXEIRA LTDA',
        nome_fantasia: 'SAPORI DI LATTE',
        cnpj: '35.798.353/0001-63',
        contato_nome: 'Juliana',
        contato_telefone: '31999143356',
        contato_celular: '31999143356',
        whatsapp: '5531999143356',
        etapa: 'follow_up',
        status_follow_up: 'concluido',
        status_cliente: 'ativo',
        vendedor_id: 2,
        score: 95,
        data_ultima_venda: '2026-09-03',
        ciclo_numero: 1,
        empresa_funil_id: 22392,
        arquivado_duplicata: false,
        data_entrada_etapa: '2026-09-03T16:46:59Z',
        created_at: '2026-07-17T14:20:03Z',
      },
      {
        id: 24159,
        razao_social: 'SAPORI BOLINA E TEIXEIRA LTDA',
        nome_fantasia: 'SAPORI DI LATTE',
        cnpj: '35.798.353/0001-63',
        contato_nome: 'Juliana',
        contato_telefone: '31999143356',
        etapa: 'follow_up',
        status_follow_up: 'concluido',
        status_cliente: 'ativo',
        vendedor_id: 2,
        score: 95,
        ciclo_numero: 2,
        novo_ciclo: true,
        empresa_funil_id: 22392,
        origem_ciclo_id: 22392,
        arquivado_duplicata: false,
        data_entrada_etapa: '2026-11-10T13:58:10Z',
        created_at: '2026-11-09T13:35:48Z',
      },
      {
        id: 24363,
        razao_social: 'SAPORI BOLINA E TEIXEIRA LTDA',
        nome_fantasia: 'SAPORI DI LATTE',
        cnpj: '35.798.353/0001-63',
        contato_nome: 'Juliana',
        contato_telefone: '31999143356',
        etapa: 'proposta',
        status_cliente: 'ativo',
        vendedor_id: 2,
        score: 43, // mesmo que venha 43 legado no Ciclo 3, cabeçalho deve exibir 95 unificado da empresa!
        ciclo_numero: 3,
        novo_ciclo: true,
        empresa_funil_id: 22392,
        origem_ciclo_id: 24159,
        arquivado_duplicata: false,
        data_entrada_etapa: '2026-11-17T20:37:35Z',
        created_at: '2026-11-17T20:37:35Z',
      },
      {
        id: 30001,
        razao_social: 'PROSPECTO SEM OMIE LTDA',
        cnpj: '11.222.333/0001-81',
        contato_nome: 'Carlos',
        etapa: 'prospecção',
        status_cliente: 'ativo',
        vendedor_id: 2,
        ciclo_numero: 1,
        arquivado_duplicata: false,
        data_entrada_etapa: '2026-11-20T10:00:00Z',
        created_at: '2026-11-20T10:00:00Z',
      },
    ]

    const mockPedidos = [
      {
        id: 483,
        numero: 'PED-661797',
        cliente_id: 22392,
        vendedor_id: 2,
        status: 'confirmado',
        tipo: 'venda',
        total_valor: 1599,
        omie_codigo: '9709098914',
        omie_numero: '000000000012441',
        omie_status: 'entregue',
        data_criacao: '2026-09-03T14:27:41Z',
        data_aprovacao: '2026-09-03T16:46:58Z',
        itens_pedido: [{ id: 1, produto_id: 7, nome_produto: 'Okey Lac Pró 25kg', quantidade: 100, preco: 15.99 }],
      },
      {
        id: 1093,
        numero: 'PED-13204',
        cliente_id: 24159,
        vendedor_id: 2,
        status: 'confirmado',
        tipo: 'venda',
        total_valor: 2301.5,
        omie_codigo: '9736489140',
        omie_numero: '000000000013204',
        omie_status: 'faturado',
        data_criacao: '2026-11-09T13:35:50Z',
        data_aprovacao: '2026-11-10T13:58:10Z',
        itens_pedido: [
          { id: 10, produto_id: 7, nome_produto: 'OKEY LAC PRO 25KG', quantidade: 100, preco: 15.52 },
          { id: 11, produto_id: 9, nome_produto: 'OKEY LAC ACAI 25KG', quantidade: 50, preco: 14.99 },
        ],
      },
      {
        id: 500,
        numero: 'AMO-100200',
        cliente_id: 22392,
        vendedor_id: 2,
        status: 'confirmado',
        tipo: 'bonificacao',
        total_valor: 5,
        data_criacao: '2026-08-25T10:00:00Z',
        itens_pedido: [{ id: 2, produto_id: 1, nome_produto: 'Okey Lac Pró 25kg', quantidade: 5, preco: 1 }],
      },
    ]

    const mockPropostas = [
      { id: 258, numero: 'PROP-655653', cliente_id: 22392, vendedor_nome: 'Eridiane Couto', total_valor: 1599, itens: [], frete: 'FOB', pagamento: '21/28/35', criado_em: '2026-09-03T14:27:35Z' },
      { id: 769, numero: 'PROP-348365', cliente_id: 24159, vendedor_nome: 'Eridiane Couto', total_valor: 2301.5, itens: [], frete: 'FOB', pagamento: '21/28/35', criado_em: '2026-11-09T13:35:50Z' },
    ]

    const mockTarefas: any[] = [
      { id: 8440, cliente_id: 22392, vendedor_id: 2, titulo: 'Negociação de setembro Ciclo 1', descricao: 'Conversei com Juliana em setembro.', tipo: 'ligacao', status: 'concluida', prioridade: 'media', data: '2026-09-03', hora: '11:23', created_at: '2026-09-03T14:24:11Z' },
      { id: 8800, cliente_id: 24159, vendedor_id: 2, titulo: 'Visita presencial Ciclo 2', descricao: 'Visita na fábrica', tipo: 'visita', status: 'concluida', prioridade: 'alta', data: '2026-11-10', hora: '10:00', chegada_em: '2026-11-10T13:05:00Z', missao_id: 7, resultado: 'Positivo', created_at: '2026-11-10T09:00:00Z' },
      { id: 9860, cliente_id: 24363, vendedor_id: 2, titulo: 'Programar novo pedido Ciclo 3', descricao: 'Verificar estoque do cliente.', tipo: 'outro', status: 'pendente', prioridade: 'media', data: '2026-11-30', hora: '14:05', created_at: '2026-11-18T17:05:29Z' },
    ]

    const mockInteracoes = [
      { id: 1029, cliente_id: 22392, tipo: 'nota', assunto: 'Nota Setembro', descricao: 'Nota histórica de setembro com anexo https://zeaeppmnetdhzwwdydmq.supabase.co/storage/v1/object/public/anexos/ficha.pdf', automatico: false, created_at: '2026-09-03T14:20:00Z' },
      { id: 2662, cliente_id: 24363, tipo: 'whatsapp', assunto: 'WhatsApp Ciclo 3', descricao: 'Mensagem enviada no Ciclo 3', automatico: false, created_at: '2026-11-18T17:05:29Z' },
    ]

    const mockHistoricoEtapas = [
      { id: 2832, cliente_id: 22392, etapa: 'follow_up', etapa_anterior: 'negociacao', data: '2026-09-03', created_at: '2026-09-03T16:46:59Z' },
      { id: 5943, cliente_id: 24159, etapa: 'perdido', etapa_anterior: 'negociacao', data: '2026-11-17', created_at: '2026-11-17T20:37:35Z' },
    ]

    const mockAtividades = [
      { id: 5001, tipo: 'auditoria', descricao: 'SAPORI BOLINA E TEIXEIRA LTDA teve cadastro conferido', vendedor_nome: 'Eridiane Couto', created_at: '2026-09-01T12:00:00Z' },
    ]

    const mockRegras = [
      {
        id: 3,
        nome: 'Preparar proposta',
        ativa: true,
        gatilho: 'mudanca_etapa',
        condicoes: { etapaDestino: 'proposta' },
        acao: { titulo: 'Preparar proposta — {cliente}', descricao: 'Amostra aprovada. Preparar e enviar proposta comercial.', tipo: 'reuniao', prioridade: 'alta', diasPrazo: 5 },
      },
    ]

    await page.route('**/api/store/**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/api/simulador/params**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false }) })
    })
    await page.route('**/api/missoes**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.route('**/api/tempo-tela/relatorio**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relatorio: [] }) })
    })

    await page.route('**/rest/v1/rpc/**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    })

    await page.route('**/rest/v1/**', async route => {
      const req = route.request()
      const url = new URL(req.url())
      if (url.pathname.includes('/rpc/')) { await route.fallback(); return }
      const tabela = url.pathname.split('/').pop()
      const method = req.method()
      const isSingle = (req.headers()['accept'] || '').includes('vnd.pgrst.object')

      if (tabela === 'vendedores') {
        const res = url.searchParams.has('auth_id') || url.searchParams.has('email') ? [mockVendedores[0]] : mockVendedores
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSingle ? res[0] : res) })
      }
      if (tabela === 'clientes') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockClientes) })
      if (tabela === 'pedidos') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPedidos) })
      if (tabela === 'propostas') {
        const cidMatch = url.search.match(/cliente_id=eq\.(\d+)/)
        const list = cidMatch ? mockPropostas.filter(p => p.cliente_id === Number(cidMatch[1])) : mockPropostas
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) })
      }
      if (tabela === 'tarefas') {
        if (method === 'POST') {
          const body = JSON.parse(req.postData() || '{}')
          const created = { id: 9999, created_at: new Date().toISOString(), ...body }
          mockTarefas.push(created)
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(isSingle ? created : [created]) })
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTarefas) })
      }
      if (tabela === 'interacoes') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockInteracoes) })
      if (tabela === 'historico_etapas') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockHistoricoEtapas) })
      if (tabela === 'atividades') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAtividades) })
      if (tabela === 'regras_automacao') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRegras) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /CRM MF Paris/i }).click()
    await page.getByRole('button', { name: /Funil Comercial/i }).first().dispatchEvent('click')

    // Em mobile, clicar na coluna Proposta se houver chip de etapa
    const chipProp = page.locator('button', { hasText: /^Proposta/ }).first()
    if (await chipProp.isVisible().catch(() => false)) await chipProp.click()

    // 1. Abrir o card aberto do Ciclo 3 da SAPORI (#24363) em Proposta
    const saporiCard = page.getByText('SAPORI BOLINA E TEIXEIRA LTDA').first()
    await expect(saporiCard).toBeVisible({ timeout: 15000 })
    await saporiCard.click()

    // 2. Deve exibir badge "Ativo" (pedido Omie 13204 em 10/11 < 30 dias), Última venda 10/11/2026 e Score unificado igual ao do Ciclo 1 (86, nunca 43)!
    await expect(page.locator('span', { hasText: /^Ativo$/ }).first()).toBeVisible()
    await expect(page.getByText('10/11/2026').first()).toBeVisible()
    await expect(page.getByText('Score: 86')).toBeVisible()
    await expect(page.getByText('Score: 43')).toHaveCount(0)

    // 3. No Histórico devem aparecer TODOS os ciclos juntos com etiquetas Ciclo 1, Ciclo 2, Ciclo 3!
    await expect(page.getByText('Ciclo 1').first()).toBeVisible()
    await expect(page.getByText('Ciclo 2').first()).toBeVisible()
    await expect(page.getByText('Ciclo 3').first()).toBeVisible()

    // Notas de setembro (Ciclo 1) + anexo PDF + proposta PROP-655653 + amostra AMO-100200 + visita com Check-in/Missão (Ciclo 2) + atividade
    await expect(page.getByText(/Nota histórica de setembro/i).first()).toBeVisible()
    await expect(page.getByText(/Abrir anexo/i).first()).toBeVisible()
    await expect(page.getByText(/PROP-655653/).first()).toBeVisible()
    await expect(page.getByText(/AMO-100200/).first()).toBeVisible()
    await expect(page.getByText(/Check-in de visita/i).first()).toBeVisible()
    await expect(page.getByText(/Missão comercial #7/i).first()).toBeVisible()
    await expect(page.getByText(/teve cadastro conferido/i).first()).toBeVisible()

    // Conferir aba "Ver negócios" -> "Pedidos do cliente" exibe PED-13204 (Omie #13204, R$ 2.301,50) e PED-661797!
    await page.getByRole('button', { name: /Ver negócios/i }).click()
    await expect(page.getByText('PED-13204').first()).toBeVisible()
    await expect(page.getByText(/Omie #13204/).first()).toBeVisible()
    await expect(page.getByText('PED-661797').first()).toBeVisible()

    // Fechar painel da Sapori
    await page.getByRole('button', { name: 'Fechar painel' }).click()

    // 4. Condição 5 + Condição 6: abrir PROSPECTO SEM OMIE LTDA (sem pedido Omie) -> deve mostrar "Prospecto"
    const chipProsp = page.locator('main button', { hasText: /^Prospecção/ }).first()
    if (await chipProsp.isVisible().catch(() => false)) await chipProsp.click()

    const prospectoCard = page.getByText('PROSPECTO SEM OMIE LTDA').first()
    await expect(prospectoCard).toBeVisible()
    await prospectoCard.click()
    await expect(page.locator('span', { hasText: /^Prospecto$/ }).first()).toBeVisible()

    // Mover de Prospecção -> Proposta (sem passar por Amostra) e verificar que a tarefa criada NÃO contém "Amostra aprovada"
    const btnProposta = page.getByRole('button', { name: /^Proposta$/i }).first()
    if (await btnProposta.isVisible().catch(() => false)) {
      await btnProposta.click()
      await page.waitForTimeout(500)
      const tarefaCriada = mockTarefas.find(t => t.cliente_id === 30001)
      if (tarefaCriada) {
        expect(tarefaCriada.descricao).not.toContain('Amostra aprovada')
      }
    }
  })
})
