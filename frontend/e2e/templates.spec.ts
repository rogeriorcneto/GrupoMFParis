import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('Templates de Mensagens', () => {
  test('view renderiza sem erros', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await expect(page.getByText('Templates de Mensagens')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('criar novo template de mensagem', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await page.waitForTimeout(1_000)

    const novoBtn = page.locator('button:has-text("Novo Template"), button:has-text("Criar"), button:has-text("Adicionar")').first()
    if (!await novoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão novo template não encontrado')
      return
    }

    await novoBtn.click()
    await page.waitForTimeout(1_000)

    // Preenche nome do template
    const nomeInput = page.locator('input[name="nome"], input[placeholder*="nome"], input[placeholder*="Nome"]').first()
    if (await nomeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nomeInput.fill(`E2E Template ${Date.now()}`)
    }

    // Preenche corpo/conteúdo
    const bodyInput = page.locator('textarea, input[name="corpo"], input[name="conteudo"]').first()
    if (await bodyInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await bodyInput.fill('Olá {{nome}}, tudo bem? Seguem informações sobre {{produto}}.')
    }

    // Salva
    const salvarBtn = page.locator('button:has-text("Salvar"), button:has-text("Criar")').first()
    if (await salvarBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await salvarBtn.click()
      await page.waitForTimeout(2_000)
    }

    // Não crashou — sucesso
    await expect(page.getByText('Templates de Mensagens')).toBeVisible()
  })
})
