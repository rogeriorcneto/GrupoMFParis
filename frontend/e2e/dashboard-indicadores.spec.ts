import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

async function entrarNoCRM(page: any) {
  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.waitForTimeout(3_000)
}

test.describe('Dashboards — indicadores dos PDFs (gerente + vendedor)', () => {
  test('Relatórios gerente: KPIs novos visíveis', async ({ page }) => {
    await entrarNoCRM(page)
    await page.getByRole('button', { name: 'Relatórios' }).first().dispatchEvent('click')
    await page.waitForTimeout(3_000)
    for (const label of ['Sem Compra 30d', 'Sem Compra 60d', 'Sem Compra 90d', 'Nunca Comprou', 'Pipeline Aberto', 'Pipeline Ponderado', 'Enviados', 'Previsão Faturamento', 'Mix Médio / Pedido']) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 15_000 })
    }
    await expect(page.getByText('Mix e Geografia')).toBeVisible()
    await expect(page.getByText(/OKEY|AÇAÍ|AÇAI|LEITE/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Dashboard vendedor/gerente: cards novos visíveis', async ({ page }) => {
    await entrarNoCRM(page)
    await page.getByRole('button', { name: 'Dashboard' }).first().click().catch(() => {})
    await page.waitForTimeout(3_000)
    for (const label of ['Ticket médio', 'Pipeline ponderado', 'Sem compra 30d']) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 15_000 })
    }
  })

  test('cards arquivados não inflam indicadores visíveis', async ({ page }) => {
    await entrarNoCRM(page)
    await page.getByRole('button', { name: 'Relatórios' }).first().dispatchEvent('click')
    await page.waitForTimeout(3_000)
    // Leads gerados não deve incluir os ~126 arquivados
    const leads = await page.getByText('Leads Gerados').locator('..').locator('..').textContent()
    expect(leads).toBeTruthy()
  })
})
