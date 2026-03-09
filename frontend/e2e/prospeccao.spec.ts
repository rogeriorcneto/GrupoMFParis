import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Prospecção', () => {
  test('view renderiza sem erros para gerente', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Prospecção/i }).click()
    await expect(page.locator('h2', { hasText: 'Prospecção' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('SDR consegue acessar prospecção', async ({ page }) => {
    if (!credentials.sdr.senha) {
      test.skip(true, 'Credenciais de SDR não configuradas')
    }

    await loginAs(page, 'sdr')
    await page.getByRole('button', { name: /Prospecção/i }).click()
    await expect(page.locator('h2', { hasText: 'Prospecção' })).toBeVisible({ timeout: 10_000 })
  })

  test('vendedor NÃO acessa prospecção', async ({ page }) => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas')
    }

    await loginAs(page, 'vendedor')
    await page.waitForTimeout(2_000)
    await expect(page.getByRole('button', { name: /Prospecção/i })).not.toBeVisible()
  })
})
