import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * Smoke test — navega por TODAS as views e confirma que renderizam sem crash.
 * É o teste mais valioso: se alguma view quebrar após deploy, pega aqui.
 */

test.describe('Navegação completa — Gerente', () => {
  const views = [
    { button: 'Visão Geral', title: 'Visão Geral' },
    { button: 'Funil Comercial', title: 'Funil Comercial' },
    { button: 'Clientes', title: 'Clientes' },
    { button: 'Pedidos', title: 'Lançamento de Pedidos' },
    { button: 'Tarefas', title: 'Tarefas e Agenda' },
    { button: 'Produtos', title: 'Catálogo de Produtos' },
    { button: 'Templates', title: 'Templates de Mensagens' },
    { button: 'Automações', title: 'Automações de Vendas' },
    { button: 'Prospecção', title: 'Prospecção' },
    { button: 'Busca Social', title: 'Busca por Redes Sociais' },
    { button: 'Integrações', title: 'Integrações' },
    { button: 'Equipe', title: 'Equipe de Vendas' },
    { button: 'Relatórios', title: 'Relatórios e Gráficos' },
    { button: 'Mapa', title: 'Mapa de Leads' },
    { button: 'Aprovação de Pedidos', title: 'Aprovação de Pedidos' },
    { button: 'Assistente IA', title: 'Assistente IA' },
  ]

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'gerente')
  })

  for (const v of views) {
    test(`gerente navega para: ${v.button}`, async ({ page }) => {
      await page.getByRole('button', { name: new RegExp(v.button, 'i') }).click()
      // Verifica que o título da TopBar mudou
      await expect(page.getByText(v.title)).toBeVisible({ timeout: 10_000 })
      // Verifica que não há erro JS visível na tela
      await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
      await expect(page.locator('text=Something went wrong')).not.toBeVisible()
    })
  }

  test('gerente: Dashboard renderiza métricas', async ({ page }) => {
    await page.getByRole('button', { name: /Visão Geral/i }).click()
    await expect(page.getByText('Total Leads')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Conversão')).toBeVisible()
  })

  test('gerente: Funil renderiza colunas do pipeline', async ({ page }) => {
    await page.getByRole('button', { name: /Funil Comercial/i }).click()
    await expect(page.getByText('Prospecção')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Amostra')).toBeVisible()
    await expect(page.getByText('Proposta')).toBeVisible()
    await expect(page.getByText('Negociação')).toBeVisible()
    await expect(page.getByText('Follow-up')).toBeVisible()
    await expect(page.getByText('Cliente Ativo')).toBeVisible()
  })

  test('gerente: Clientes renderiza tabela', async ({ page }) => {
    await page.getByRole('button', { name: /^Clientes$/i }).click()
    // A view deve ter algum elemento de listagem (tabela ou cards)
    await expect(page.getByText('Clientes')).toBeVisible({ timeout: 10_000 })
  })

  test('gerente: Relatórios renderiza gráficos', async ({ page }) => {
    await page.getByRole('button', { name: /Relatórios/i }).click()
    await expect(page.getByText('Relatórios e Gráficos')).toBeVisible({ timeout: 10_000 })
  })

  test('gerente: Equipe renderiza lista de vendedores', async ({ page }) => {
    await page.getByRole('button', { name: /^Equipe$/i }).click()
    await expect(page.getByText('Equipe de Vendas')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Navegação completa — Vendedor', () => {
  test.beforeEach(async () => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas em .env.e2e')
    }
  })

  const vendedorViews = [
    { button: 'Funil Comercial', title: 'Funil Comercial' },
    { button: 'Clientes', title: 'Clientes' },
    { button: 'Pedidos', title: 'Lançamento de Pedidos' },
    { button: 'Tarefas', title: 'Tarefas e Agenda' },
    { button: 'Produtos', title: 'Catálogo de Produtos' },
    { button: 'Templates', title: 'Templates de Mensagens' },
    { button: 'Mapa', title: 'Mapa de Leads' },
    { button: 'Assistente IA', title: 'Assistente IA' },
  ]

  for (const v of vendedorViews) {
    test(`vendedor navega para: ${v.button}`, async ({ page }) => {
      await loginAs(page, 'vendedor')
      await page.getByRole('button', { name: new RegExp(v.button, 'i') }).click()
      await expect(page.getByText(v.title)).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
    })
  }
})

test.describe('Navegação completa — SDR', () => {
  test.beforeEach(async () => {
    if (!credentials.sdr.senha) {
      test.skip(true, 'Credenciais de SDR não configuradas em .env.e2e')
    }
  })

  const sdrViews = [
    { button: 'Funil Comercial', title: 'Funil Comercial' },
    { button: 'Clientes', title: 'Clientes' },
    { button: 'Pedidos', title: 'Lançamento de Pedidos' },
    { button: 'Tarefas', title: 'Tarefas e Agenda' },
    { button: 'Templates', title: 'Templates de Mensagens' },
    { button: 'Mapa', title: 'Mapa de Leads' },
    { button: 'Prospecção', title: 'Prospecção' },
  ]

  for (const v of sdrViews) {
    test(`sdr navega para: ${v.button}`, async ({ page }) => {
      await loginAs(page, 'sdr')
      await page.getByRole('button', { name: new RegExp(v.button, 'i') }).click()
      await expect(page.getByText(v.title)).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
    })
  }
})
