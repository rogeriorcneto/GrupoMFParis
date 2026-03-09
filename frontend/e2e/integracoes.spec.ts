import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Integrações', () => {
  test('view renderiza sem erros para gerente', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Integrações/i }).click()
    await expect(page.locator('h2', { hasText: /^Integrações$/ })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('mostra cards de integração (Omie, Email, WhatsApp)', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Integrações/i }).click()
    await page.waitForTimeout(2_000)

    // Deve mostrar pelo menos a integração Omie
    const omieCard = page.getByText(/Omie/i).first()
    await expect(omieCard).toBeVisible({ timeout: 5_000 })
  })

  test('vendedor NÃO acessa integrações', async ({ page }) => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas')
    }

    await loginAs(page, 'vendedor')
    await page.waitForTimeout(2_000)
    await expect(page.getByRole('button', { name: /Integrações/i })).not.toBeVisible()
  })
})
