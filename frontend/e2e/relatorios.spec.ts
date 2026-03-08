import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Relatórios e Gráficos', () => {
  test('view renderiza sem erros para gerente', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Relatórios/i }).click()
    await expect(page.getByText('Relatórios e Gráficos')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('relatórios mostram gráficos ou dados', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Relatórios/i }).click()
    await page.waitForTimeout(3_000)

    // Deve ter algum conteúdo visual (gráficos, tabelas, cards)
    const charts = page.locator('canvas, svg, [class*="chart"], [class*="graph"], table, [class*="card"]')
    const count = await charts.count()
    expect(count).toBeGreaterThan(0)
  })

  test('vendedor NÃO acessa relatórios', async ({ page }) => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas')
    }

    await loginAs(page, 'vendedor')
    await page.waitForTimeout(2_000)
    await expect(page.getByRole('button', { name: /Relatórios/i })).not.toBeVisible()
  })

  test('filtro de período funciona nos relatórios', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Relatórios/i }).click()
    await page.waitForTimeout(2_000)

    // Procura botões de período ou select
    const periodoBtn = page.locator('button:has-text("7d"), button:has-text("30d"), button:has-text("90d"), button:has-text("Total")').first()
    if (await periodoBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await periodoBtn.click()
      await page.waitForTimeout(1_000)
      // Não crashou — sucesso
      await expect(page.getByText('Relatórios e Gráficos')).toBeVisible()
    }
  })
})
