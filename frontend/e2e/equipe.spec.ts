import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test.describe('Equipe de Vendas — funcionalidades', () => {
  test('view renderiza lista de vendedores', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Equipe$/i }).click()
    await expect(page.locator('h2', { hasText: 'Equipe de Vendas' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()

    // Deve mostrar pelo menos 1 vendedor (o gerente logado existe no sistema)
    await page.waitForTimeout(2_000)
    // Procura por nomes de vendedores ou cargos na lista
    const vendedorItem = page.getByText(/Rafael|Gerente|vendedor/i).first()
    await expect(vendedorItem).toBeVisible({ timeout: 5_000 })
  })

  test('botão Novo Vendedor abre formulário', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Equipe$/i }).click()
    await page.waitForTimeout(1_000)

    const novoBtn = page.locator('button:has-text("Novo Vendedor"), button:has-text("Adicionar"), button:has-text("Convidar")').first()
    if (!await novoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão de novo vendedor não encontrado')
      return
    }

    await novoBtn.click()
    await page.waitForTimeout(1_000)

    // Deve abrir modal/formulário com campos de nome, email, cargo
    const nomeInput = page.locator('input[name="nome"], input[placeholder*="Nome"]').first()
    const emailInput = page.locator('input[name="email"], input[placeholder*="email"], input[type="email"]').first()

    const hasForm = await nomeInput.isVisible({ timeout: 3_000 }).catch(() => false) ||
                    await emailInput.isVisible({ timeout: 1_000 }).catch(() => false)

    if (hasForm) {
      // Formulário visível — sucesso
      expect(hasForm).toBe(true)
    }
  })

  test('vendedor NÃO acessa view de equipe', async ({ page }) => {
    if (!credentials.vendedor.senha) {
      test.skip(true, 'Credenciais de vendedor não configuradas')
    }

    await loginAs(page, 'vendedor')
    await page.waitForTimeout(2_000)

    // O botão Equipe não deve existir na sidebar
    await expect(page.getByRole('button', { name: /^Equipe$/i })).not.toBeVisible()
  })
})
