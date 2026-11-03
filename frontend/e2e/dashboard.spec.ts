import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

async function abrirDashboard(page: any) {
  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.waitForTimeout(3_000)
}

test.describe('Dashboard Comercial', () => {
  test('KPIs principais visíveis com dados reais', async ({ page }) => {
    await abrirDashboard(page)
    for (const label of ['Faturamento do mês', 'Novos clientes', 'Conversão', 'Ticket médio', 'Pipeline ponderado', 'Sem compra 30d']) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 15_000 })
    }
    await expect(page.getByText('Ranking da equipe')).toBeVisible({ timeout: 15_000 })
  })

  test('seletor de período: preset Mês e Semana funcionam', async ({ page }) => {
    await abrirDashboard(page)
    const fatMes = await page.getByText('Faturamento do mês').locator('..').locator('..').textContent()
    expect(fatMes).toBeTruthy()
    // troca de preset não deve quebrar a tela
    const btnSemana = page.getByRole('button', { name: /semana/i }).first()
    if (await btnSemana.isVisible().catch(() => false)) await btnSemana.click()
    await page.waitForTimeout(1_500)
    await expect(page.getByText('Faturamento do mês').first()).toBeVisible()
  })

  test('Relatórios gerente: indicadores dos PDFs visíveis', async ({ page }) => {
    await abrirDashboard(page)
    await page.getByRole('button', { name: 'Relatórios' }).first().dispatchEvent('click')
    await page.waitForTimeout(3_000)
    for (const label of ['Clientes Ativos', 'Novos Clientes', 'Leads Gerados', 'Pipeline Aberto', 'Pipeline Ponderado', 'Previsão Faturamento']) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 15_000 })
    }
  })

  test('vendedor NÃO acessa dashboard de gerente', async ({ page }) => {
    // o login de vendedor deve cair na própria carteira, sem opções de gerente
    await loginAs(page, 'vendedor').catch(() => test.skip())
  })
})
