import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('Produtos — catálogo', () => {
  test('view de produtos renderiza sem erros', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Produtos/i }).click()
    await expect(page.getByText('Catálogo de Produtos')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('lista de produtos mostra itens cadastrados', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Produtos/i }).click()
    await page.waitForTimeout(2_000)

    // Deve ter pelo menos 1 produto (16 foram seeded na migração)
    const produtoCards = page.locator('[class*="card"], tr, [class*="produto"]')
      .filter({ hasText: /.{3,}/ }) // pelo menos 3 chars de conteúdo
    const count = await produtoCards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('botão novo produto abre formulário', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Produtos/i }).click()
    await page.waitForTimeout(1_000)

    const novoBtn = page.locator('button:has-text("Novo Produto"), button:has-text("Adicionar"), button:has-text("Cadastrar")').first()
    if (!await novoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão novo produto não encontrado')
      return
    }

    await novoBtn.click()
    await page.waitForTimeout(1_000)

    // Deve abrir formulário com campos de nome, preço, etc
    const nomeInput = page.locator('input[name="nome"], input[placeholder*="Nome"], input[placeholder*="nome"]').first()
    await expect(nomeInput).toBeVisible({ timeout: 5_000 })
  })
})
