import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Rodada 2, Bloco Prioridade Alta (Itens 3, 4, 5 e 6), 100% em ambiente isolado:
 * - Item 3: Nenhum card em nenhuma etapa mostra "Criar Proposta".
 * - Item 4: Card em Follow-up não mostra "Perdido" (nem para gerente).
 * - Item 5: Lista de Clientes sem CNPJ repetido e sem coluna "Etapa"; clicar abre o card mais recente
 *           e os ciclos anteriores ficam em "Ver negócios"; cadastrar CNPJ existente bloqueia avisando o dono.
 * - Item 6: Produtos de interesse fora do cadastro e em destaque na lateral do card com Consumo mensal (kg/mês),
 *           preservando dados legados (Flocos de Neve: 250, 200, 100 kg/mês) e salvando estruturado.
 */
test('Rodada 2 — Bloco Alta (Itens 3, 4, 5 e 6): sem Criar Proposta/Perdido em FU, cadastro único por CNPJ e consumo kg/mês', async ({ page }) => {
  const hoje = new Date().toISOString().split('T')[0]
  const clientesDb: Record<string, any>[] = [
    // Empresa com 3 cards no mesmo CNPJ (Item 5 + Item 6 legado Flocos de Neve):
    {
      id: 9001, razao_social: 'SORVETERIA FLOCOS DE NEVE LTDA', nome_fantasia: 'FLOCOS DE NEVE',
      cnpj: '11.222.333/0001-81', etapa: 'perdido', ciclo_numero: 1, vendedor_id: 25,
      arquivado_duplicata: false, novo_ciclo: false, empresa_funil_id: 9001,
      produtos_interesse: ['LEITE EM PO INTEGRAL HORIZONTE 25KG', 'OKEY LAC CREAM 25KG', 'GLUCOSE EM PO 25KG'],
      produtos_quantidades_mensais: {
        'LEITE EM PO INTEGRAL HORIZONTE 25KG': 250,
        'OKEY LAC CREAM 25KG': 200,
        'GLUCOSE EM PO 25KG': 100,
      },
      data_entrada_etapa: hoje, ultima_interacao: hoje,
    },
    {
      id: 9002, razao_social: 'SORVETERIA FLOCOS DE NEVE LTDA', nome_fantasia: 'FLOCOS DE NEVE',
      cnpj: '11.222.333/0001-81', etapa: 'follow_up', status_follow_up: 'entregue', ciclo_numero: 2, vendedor_id: 25,
      arquivado_duplicata: false, novo_ciclo: true, empresa_funil_id: 9001, origem_ciclo_id: 9001,
      data_entrada_etapa: hoje, ultima_interacao: hoje,
    },
    {
      id: 9003, razao_social: 'SORVETERIA FLOCOS DE NEVE LTDA', nome_fantasia: 'FLOCOS DE NEVE',
      cnpj: '11.222.333/0001-81', etapa: 'proposta', ciclo_numero: 3, vendedor_id: 25,
      arquivado_duplicata: false, novo_ciclo: true, empresa_funil_id: 9001, origem_ciclo_id: 9002,
      data_entrada_etapa: hoje, ultima_interacao: hoje,
    },
    // Cards nas demais etapas para validar Item 3 (zero "Criar Proposta" em qualquer etapa)
    { id: 9010, razao_social: 'CARD LEAD TESTE', cnpj: '22.333.444/0001-92', etapa: 'lead', vendedor_id: 1, arquivado_duplicata: false, data_entrada_etapa: hoje },
    { id: 9011, razao_social: 'CARD PROSP TESTE', cnpj: '33.444.555/0001-03', etapa: 'prospecção', vendedor_id: 1, arquivado_duplicata: false, data_entrada_etapa: hoje },
    { id: 9012, razao_social: 'ARITA SORVETES AMOSTRA', cnpj: '44.555.666/0001-14', etapa: 'amostra', vendedor_id: 1, arquivado_duplicata: false, data_entrada_etapa: hoje },
    { id: 9013, razao_social: 'CARD NEGOCIACAO TESTE', cnpj: '55.666.777/0001-25', etapa: 'negociacao', vendedor_id: 1, arquivado_duplicata: false, data_entrada_etapa: hoje },
  ]

  await page.route('**/api/clientes/check-cnpj', async route => {
    const b = route.request().postDataJSON()
    const dig = String(b.cnpjs?.[0] || '').replace(/\D/g, '')
    const match = clientesDb.find(c => (c.cnpj || '').replace(/\D/g, '') === dig)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [match ? { cnpj: dig, exists: true, vendedorNome: 'Izidório dos Santos', razaoSocial: match.razao_social } : { cnpj: dig, exists: false }],
      }),
    })
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
    const metodo = req.method()
    let dados: any = []

    if (tabela === 'vendedores') {
      const lista = [
        { id: 1, nome: 'Bernardo Nery', email: credentials.gerente.email, cargo: 'gerente', ativo: true },
        { id: 25, nome: 'Izidório dos Santos', email: 'vendas08@mfparis.com.br', cargo: 'vendedor', ativo: true },
      ]
      dados = (url.searchParams.has('auth_id') || url.searchParams.has('email')) ? [lista[0]] : lista
    } else if (tabela === 'produtos') {
      dados = [{ id: 215, nome: 'LEITE EM PO INTEGRAL HORIZONTE 25KG', sku: '9111', preco: 27, unidade: 'kg', categoria: 'sacaria', ativo: true }]
    } else if (tabela === 'clientes') {
      if (metodo === 'PATCH') {
        const idMatch = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = clientesDb.find(c => String(c.id) === idMatch)
        if (alvo) Object.assign(alvo, req.postDataJSON())
        dados = alvo ? [alvo] : []
      } else {
        dados = clientesDb
      }
    }

    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()

  // ── Item 5: Tela Clientes -> sem coluna "Etapa", 1 única linha p/ Flocos de Neve (mesmo tendo 3 cards), clique abre o mais recente (Proposta #9003)!
  await page.getByRole('button', { name: /^Clientes$/i }).dispatchEvent('click')
  await expect(page.locator('text=SORVETERIA FLOCOS DE NEVE LTDA >> visible=true')).toHaveCount(1)
  await expect(page.locator('th', { hasText: /^Etapa$/i })).toHaveCount(0)

  await page.locator('text=SORVETERIA FLOCOS DE NEVE LTDA >> visible=true').first().click()
  let painel = page.locator('.fixed.inset-0').last()
  // Abriu o card ativo mais recente (Proposta #9003 -> tem botão Negociar) e NÃO mostra "Criar Proposta"!
  await expect(painel.getByRole('button', { name: /Negociar/i })).toBeVisible({ timeout: 10_000 })
  await expect(painel.getByRole('button', { name: /Criar Proposta/i })).toHaveCount(0)

  // ── Item 6: Produtos de interesse em destaque na lateral com Consumo mensal (kg/mês) preservando 250, 200, 100 e salvando estruturado!
  const inputLeite = painel.getByLabel('Consumo mensal (kg) — LEITE EM PO INTEGRAL HORIZONTE 25KG')
  await expect(inputLeite).toHaveValue('250')
  await expect(painel.getByLabel('Consumo mensal (kg) — OKEY LAC CREAM 25KG')).toHaveValue('200')
  await expect(painel.getByLabel('Consumo mensal (kg) — GLUCOSE EM PO 25KG')).toHaveValue('100')

  await inputLeite.fill('300abc')
  await expect(inputLeite).toHaveValue('300') // aceita só número
  await inputLeite.blur()
  await expect.poll(() => {
    const salvo = clientesDb.find(c => c.id === 9003)?.produtos_quantidades_mensais?.['LEITE EM PO INTEGRAL HORIZONTE 25KG']
    return typeof salvo === 'object' && salvo.kgMes === 300 && Boolean(salvo.atualizadoEm)
  }).toBe(true)

  // ── Item 5 ("Ver negócios" mostra os 3 ciclos, e permite abrir o ciclo #2 em Follow-up) + Item 4 (Follow-up sem botão "Perdido")
  await painel.getByRole('button', { name: /Ver negócios/i }).click()
  await expect(painel.getByText(/Ciclos de venda no funil \(3\)/i)).toBeVisible()
  // Abrir o card #9002 (Follow-up, o primeiro ciclo anterior com botão "Abrir card") para validar Item 4 e Item 3
  await painel.getByRole('button', { name: 'Abrir card' }).first().click()
  await expect(painel.getByRole('button', { name: /Coletar Satisfação/i })).toBeVisible()
  await expect(painel.getByRole('button', { name: /Perdido/i })).toHaveCount(0)
  await expect(painel.getByRole('button', { name: /Criar Proposta/i })).toHaveCount(0)
  await painel.locator('.bg-black.bg-opacity-40').dispatchEvent('click')
  await expect(painel).toBeHidden()

  // ── Item 5 (Novo Cliente com CNPJ já existente -> bloqueado avisando o dono "Izidório dos Santos") + Item 6 (sem Produtos de Interesse no cadastro)
  await page.locator('button:has-text("Novo Cliente") >> visible=true').first().click()
  await expect(page.locator('input[name="cnpj"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Incluir Produto de Interesse/i)).toHaveCount(0)
  await page.locator('input[name="cnpj"]').fill('11.222.333/0001-81')
  await page.locator('input[name="razaoSocial"]').fill('Tentativa Duplicada')
  await page.locator('input[name="contatoNome"]').fill('Contato')
  await page.locator('input[name="contatoTelefone"]').fill('31999998888')
  await page.locator('input[name="enderecoRua"]').fill('Rua A')
  await page.getByRole('button', { name: /Salvar|Cadastrar/i }).last().click()
  await expect(page.getByText(/Cadastro bloqueado:.*vendedor dono: Izidório dos Santos/i)).toBeVisible({ timeout: 10_000 })
})
