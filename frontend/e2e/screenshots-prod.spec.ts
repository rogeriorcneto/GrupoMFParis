import { test } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test('screenshots produção: dashboard, relatórios e kanban', async ({ page }) => {
  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.waitForTimeout(4_000)
  await page.screenshot({ path: 'shots-prod/01-dashboard.png', fullPage: false })
  await page.getByRole('button', { name: 'Relatórios' }).first().dispatchEvent('click')
  await page.waitForTimeout(4_000)
  await page.screenshot({ path: 'shots-prod/02-relatorios.png', fullPage: false })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: 'shots-prod/03-relatorios-fim.png', fullPage: false })
  await page.getByRole('button', { name: 'Funil Comercial' }).first().dispatchEvent('click')
  await page.waitForTimeout(4_000)
  await page.screenshot({ path: 'shots-prod/04-kanban.png', fullPage: false })
})
