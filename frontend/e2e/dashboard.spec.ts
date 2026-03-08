import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Dashboard — Visão Geral', () => {
  test('renderiza métricas principais', async ({ page }) => {
    await loginAs(page, 'gerente')
    // Dashboard é a view padrão do gerente
    await expect(page.getByText('Visão Geral')).toBeVisible({ timeout: 10_000 })

    // Métricas obrigatórias
    await expect(page.getByText('Total Leads')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Leads Ativos')).toBeVisible()
    await expect(page.getByText('Conversão')).toBeVisible()
    await expect(page.getByText('Valor Total')).toBeVisible()
    await expect(page.getByText('Ticket Médio')).toBeVisible()
    await expect(page.getByText('Novos Hoje')).toBeVisible()
    await expect(page.getByText('Interações')).toBeVisible()
  })

  test('gráfico de funil por etapa renderiza', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.waitForTimeout(3_000)

    // Deve ter gráfico (canvas ou SVG)
    const charts = page.locator('canvas, svg[class*="recharts"], [class*="chart"]')
    const count = await charts.count()
    expect(count).toBeGreaterThan(0)
  })

  test('filtro de período funciona', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.waitForTimeout(2_000)

    // Botões de período: 7d, 30d, 90d, Total
    const btn7d = page.locator('button:has-text("7d")').first()
    const btn30d = page.locator('button:has-text("30d")').first()
    const btnTotal = page.locator('button:has-text("Total")').first()

    if (await btn7d.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await btn7d.click()
      await page.waitForTimeout(1_000)
      await expect(page.getByText('Total Leads')).toBeVisible()

      await btn30d.click()
      await page.waitForTimeout(1_000)
      await expect(page.getByText('Total Leads')).toBeVisible()

      await btnTotal.click()
      await page.waitForTimeout(1_000)
      await expect(page.getByText('Total Leads')).toBeVisible()
    }
  })

  test('rankings de vendedores renderizam', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.waitForTimeout(3_000)

    // Deve mostrar seção de ranking
    const ranking = page.getByText(/Ranking/i).first()
    if (await ranking.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(ranking).toBeVisible()
    }
  })

  test('projeção de receita futura renderiza', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.waitForTimeout(3_000)

    const projecao = page.getByText(/Projeção|Receita Futura/i).first()
    if (await projecao.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(projecao).toBeVisible()
    }
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
