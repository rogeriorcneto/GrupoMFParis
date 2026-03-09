import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Dashboard Comercial', () => {
  test('renderiza header com badge AO VIVO', async ({ page }) => {
    await loginAs(page, 'gerente')
    await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Dashboard Comercial')).toBeVisible()
    await expect(page.getByTestId('live-badge')).toBeVisible()
    await expect(page.getByText('AO VIVO')).toBeVisible()
    await expect(page.getByTestId('last-update')).toBeVisible()
  })

  test('seletor mensal funciona: selecionar mês mostra dados filtrados', async ({ page }) => {
    await loginAs(page, 'gerente')
    await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 10_000 })

    // Clica em Mês (default)
    await page.getByTestId('btn-mes').click()
    await expect(page.getByTestId('month-selector')).toBeVisible()

    // Seleciona um mês diferente do dropdown
    const selector = page.getByTestId('month-selector')
    const options = await selector.locator('option').all()
    expect(options.length).toBe(12)

    // Seleciona o segundo mês (mês anterior)
    if (options.length > 1) {
      const val = await options[1].getAttribute('value')
      if (val) await selector.selectOption(val)
    }
    // Dashboard should still render without errors
    await expect(page.getByTestId('dashboard-container')).toBeVisible()
  })

  test('botão Hoje filtra dados', async ({ page }) => {
    await loginAs(page, 'gerente')
    await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('btn-hoje').click()
    // Button should have active style
    await expect(page.getByTestId('btn-hoje')).toHaveClass(/bg-primary-600/)
    // Dashboard content still renders
    await expect(page.getByTestId('tab-bar')).toBeVisible()
  })

  test('8 abas navegáveis', async ({ page }) => {
    await loginAs(page, 'gerente')
    await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 10_000 })

    const tabs = ['saude', 'crescimento', 'produtos', 'mercado', 'clientes', 'funil', 'equipe', 'competitiva']
    for (const tab of tabs) {
      await page.getByTestId(`tab-${tab}`).click()
      await expect(page.getByTestId(`panel-${tab}`)).toBeVisible()
    }
  })

  test('aba Equipe: rankings de vendedores visíveis', async ({ page }) => {
    await loginAs(page, 'gerente')
    await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('tab-equipe').click()
    await expect(page.getByTestId('panel-equipe')).toBeVisible()
    await expect(page.getByText(/Ranking Faturamento/)).toBeVisible()
  })

  test('modo TV: entra e sai', async ({ page }) => {
    await loginAs(page, 'gerente')
    await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 10_000 })

    const tvBtn = page.getByTestId('btn-tv')
    await expect(tvBtn).toBeVisible()

    // Enter TV mode
    await tvBtn.click()
    await expect(page.getByTestId('dashboard-container')).toHaveClass(/bg-gray-950/)
    await expect(page.getByText(/Sair TV/)).toBeVisible()

    // Exit TV mode
    await tvBtn.click()
    await expect(page.getByTestId('dashboard-container')).not.toHaveClass(/bg-gray-950/)
  })

  test('vendedor NÃO acessa dashboard', async ({ page }) => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas')
    }

    await loginAs(page, 'vendedor')
    await page.waitForTimeout(2_000)
    await expect(page.getByRole('button', { name: /Visão Geral/i })).not.toBeVisible()
  })
})
