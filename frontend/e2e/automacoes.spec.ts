import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Automações de Vendas', () => {
  test('view renderiza sem erros para gerente', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Automações/i }).click()
    await expect(page.locator('h2', { hasText: 'Automações de Vendas' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('gerente consegue ver cadências e regras', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Automações/i }).click()
    await page.waitForTimeout(2_000)

    // A view deve ter conteúdo visível além do título
    await expect(page.locator('h2', { hasText: 'Automações de Vendas' })).toBeVisible({ timeout: 5_000 })
    // Deve ter seções como Lead/Empresa, Propaganda, Templates, Campanhas
    await expect(page.getByText('Lead / Empresa').first()).toBeVisible({ timeout: 5_000 })
  })

  test('vendedor NÃO acessa automações', async ({ page }) => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas')
    }

    await loginAs(page, 'vendedor')
    await page.waitForTimeout(2_000)
    await expect(page.getByRole('button', { name: /Automações/i })).not.toBeVisible()
  })
})
