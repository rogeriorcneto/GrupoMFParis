import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Permissões — Gerente', () => {
  test('gerente vê todos os itens de navegação', async ({ page }) => {
    await loginAs(page, 'gerente')

    await expect(page.getByRole('button', { name: /Visão Geral/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Funil$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Clientes$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pedidos$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Tarefas$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Automações/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Prospecção/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Equipe$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Relatórios/i })).toBeVisible()
  })

  test('gerente vê Assistente IA', async ({ page }) => {
    await loginAs(page, 'gerente')
    await expect(page.getByText('Assistente IA')).toBeVisible()
  })

  test('gerente navega para cada view', async ({ page }) => {
    await loginAs(page, 'gerente')

    // Navega por vários itens e confirma que o título muda
    const views = [
      { button: 'Funil', title: 'Funil de Vendas' },
      { button: 'Clientes', title: 'Clientes' },
      { button: 'Tarefas', title: 'Tarefas e Agenda' },
      { button: 'Relatórios', title: 'Relatórios e Gráficos' },
      { button: 'Equipe', title: 'Equipe de Vendas' },
    ]

    for (const v of views) {
      await page.getByRole('button', { name: new RegExp(`^${v.button}$`, 'i') }).click()
      await expect(page.getByText(v.title)).toBeVisible({ timeout: 5_000 })
    }
  })
})

test.describe('Permissões — Vendedor', () => {
  test.beforeEach(async () => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas em .env.e2e')
    }
  })

  test('vendedor NÃO vê dashboard, automações, prospecção, equipe, relatórios', async ({ page }) => {
    await loginAs(page, 'vendedor')

    // Espera a sidebar carregar
    await expect(page.getByRole('button', { name: /^Funil$/i })).toBeVisible({ timeout: 15_000 })

    // Não deve ver estes itens
    await expect(page.getByRole('button', { name: /Visão Geral/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Automações/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Prospecção/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^Equipe$/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Relatórios/i })).not.toBeVisible()
  })

  test('vendedor NÃO vê Assistente IA', async ({ page }) => {
    await loginAs(page, 'vendedor')
    await expect(page.getByRole('button', { name: /^Funil$/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Assistente IA')).not.toBeVisible()
  })

  test('vendedor vê funil, clientes, pedidos, tarefas', async ({ page }) => {
    await loginAs(page, 'vendedor')

    await expect(page.getByRole('button', { name: /^Funil$/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /^Clientes$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pedidos$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Tarefas$/i })).toBeVisible()
  })
})

test.describe('Permissões — SDR', () => {
  test.beforeEach(async () => {
    if (!credentials.sdr.senha) {
      test.skip(true, 'Credenciais de SDR não configuradas em .env.e2e')
    }
  })

  test('sdr NÃO vê dashboard, automações, equipe, relatórios', async ({ page }) => {
    await loginAs(page, 'sdr')

    await expect(page.getByRole('button', { name: /^Funil$/i })).toBeVisible({ timeout: 15_000 })

    await expect(page.getByRole('button', { name: /Visão Geral/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Automações/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^Equipe$/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Relatórios/i })).not.toBeVisible()
  })

  test('sdr vê funil, clientes, prospecção, tarefas', async ({ page }) => {
    await loginAs(page, 'sdr')

    await expect(page.getByRole('button', { name: /^Funil$/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /^Clientes$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Prospecção/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Tarefas$/i })).toBeVisible()
  })
})
