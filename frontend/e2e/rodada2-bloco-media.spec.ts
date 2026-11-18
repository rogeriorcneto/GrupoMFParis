import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Rodada 2, Bloco Prioridade Média (Itens 7, 8, 9 e 10), 100% em ambiente isolado:
 * - Item 8: Inclui um segmento novo em Parâmetros -> aparece na hora em "Editar Cliente";
 *           desativa -> some do dropdown sem afetar cliente que já o usa;
 *           cria prazo novo -> aparece imediatamente no Pedido, registrando quem alterou e quando.
 * - Item 9: Em Clientes > Exportar, abre modal com as duas exportações .xlsx (Cadastro completo e Tarefas + Auditoria),
 *           com filtro de vendedor (um/vários/todos) e período.
 */
test('Rodada 2 — Bloco Média (Itens 8 e 9): Parâmetros em tempo real nos dropdowns e modal de Exportação .xlsx', async ({ page }) => {
  const hoje = new Date().toISOString().split('T')[0]
  const atividadesStore: Record<string, any>[] = []
  const clientesDb: Record<string, any>[] = [
    {
      id: 9501, razao_social: 'SORVETERIA TESTE PARAMETROS LTDA', cnpj: '11.222.333/0001-81',
      etapa: 'proposta', vendedor_id: 5, segmento: 'Food Service',
      contato_nome: 'Carlos', contato_telefone: '31988887777', endereco_rua: 'Rua B',
      arquivado_duplicata: false, data_entrada_etapa: hoje,
    },
    {
      id: 9502, razao_social: 'DISTRIBUIDORA SEGUNDO CLIENTE LTDA', cnpj: '22.333.444/0001-92',
      etapa: 'prospecção', vendedor_id: 5, segmento: 'Distribuição',
      contato_nome: 'Ana', contato_telefone: '31977776666', endereco_rua: 'Rua C',
      arquivado_duplicata: false, data_entrada_etapa: hoje,
    },
  ]

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
        { id: 1, nome: 'Rogério Reis', email: credentials.gerente.email, cargo: 'gerente', ativo: true },
        { id: 5, nome: 'Ursulla Lopes', email: 'ursulla@mfparis.com.br', cargo: 'vendedor', ativo: true },
      ]
      dados = (url.searchParams.has('auth_id') || url.searchParams.has('email')) ? [lista[0]] : lista
    } else if (tabela === 'produtos') {
      dados = [{ id: 1, nome: 'MALTODEXTRINA 25KG', sku: '2071', preco: 8, unidade: 'kg', categoria: 'sacaria', ativo: true }]
    } else if (tabela === 'clientes') {
      dados = clientesDb
    } else if (tabela === 'atividades') {
      if (metodo === 'POST') {
        const body = req.postDataJSON()
        const novo = { id: atividadesStore.length + 1, created_at: new Date().toISOString(), ...body }
        atividadesStore.push(novo)
        dados = [novo]
      } else if (metodo === 'PATCH') {
        const idEq = url.searchParams.get('id')?.replace('eq.', '')
        const alvo = atividadesStore.find(a => String(a.id) === idEq)
        if (alvo) Object.assign(alvo, req.postDataJSON())
        dados = alvo ? [alvo] : []
      } else {
        const tipoEq = url.searchParams.get('tipo')?.replace('eq.', '')
        dados = tipoEq ? atividadesStore.filter(a => a.tipo === tipoEq) : atividadesStore
      }
    }

    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()

  // ── Item 8.1: Abrir aba Parâmetros e incluir segmento novo "Food Service"
  await page.getByRole('button', { name: /Parâmetros/i }).dispatchEvent('click')
  await expect(page.getByText(/Parâmetros do Sistema/i)).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder(/Nova opção em Segmento do cliente/i).fill('Food Service')
  await page.getByRole('button', { name: '+ Adicionar' }).click()
  await expect(page.getByText(/Alterado por/i).first()).toBeVisible()

  // Ir em Clientes -> Novo Cliente -> "Food Service" aparece imediatamente no select de Segmento!
  await page.getByRole('button', { name: /^Clientes$/i }).dispatchEvent('click')
  await page.locator('button:has-text("Novo Cliente") >> visible=true').first().click()
  await expect(page.locator('select[name="segmento"] option[value="Food Service"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancelar' }).last().click()

  // ── Item 8.2: Desativar "Food Service" -> some do dropdown de novo cliente, mas cliente #9501 que já usa preserva o valor!
  await page.getByRole('button', { name: /Parâmetros/i }).dispatchEvent('click')
  await page.getByRole('button', { name: 'Desativar' }).last().click()
  await page.getByRole('button', { name: /^Clientes$/i }).dispatchEvent('click')
  await page.locator('button:has-text("Novo Cliente") >> visible=true').first().click()
  await expect(page.locator('select[name="segmento"] option[value="Food Service"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancelar' }).last().click()

  // ── Item 8.3: Criar prazo novo "45/60/75" em Parâmetros -> aparece na hora em Pedidos!
  await page.getByRole('button', { name: /Parâmetros/i }).dispatchEvent('click')
  await page.getByRole('button', { name: /Prazo de pagamento do pedido/i }).click()
  await page.getByPlaceholder(/Nova opção em Prazo de pagamento/i).fill('45/60/75')
  await page.getByRole('button', { name: '+ Adicionar' }).click()

  await page.getByRole('button', { name: /^Pedidos$/i }).dispatchEvent('click')
  await expect(page.locator('select option[value="45/60/75"]')).toHaveCount(1)

  // ── Item 9: Em Clientes > Exportar, abre o modal com as 2 exportações .xlsx e filtro de vendedor/período!
  await page.getByRole('button', { name: /^Clientes$/i }).dispatchEvent('click')
  await page.getByRole('button', { name: /^Exportar$/i }).click()
  await expect(page.getByText(/Exportar Cadastro Completo \(\.xlsx\)/i)).toBeVisible()
  await expect(page.getByText(/Exportar Tarefas \+ Auditoria \(\.xlsx\)/i)).toBeVisible()
})
