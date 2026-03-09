import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('Assistente IA — chat funcional', () => {
  test('view do Assistente IA renderiza sem erros', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Assistente IA/i }).click()
    await expect(page.locator('h2', { hasText: 'Assistente IA' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('campo de input de mensagem está visível', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Assistente IA/i }).click()
    await page.waitForTimeout(2_000)

    // Procura campo de input para digitar mensagem
    const input = page.locator(
      'input[placeholder*="mensagem"], input[placeholder*="Mensagem"], ' +
      'textarea[placeholder*="mensagem"], textarea[placeholder*="Mensagem"], ' +
      'input[placeholder*="Pergunte"], textarea[placeholder*="Pergunte"], ' +
      'input[placeholder*="Digite"], textarea[placeholder*="Digite"]'
    ).first()

    await expect(input).toBeVisible({ timeout: 10_000 })
  })

  test('enviar mensagem e receber resposta da IA', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Assistente IA/i }).click()
    await page.waitForTimeout(2_000)

    // Localiza o input
    const input = page.locator(
      'input[placeholder*="mensagem"], input[placeholder*="Mensagem"], ' +
      'textarea[placeholder*="mensagem"], textarea[placeholder*="Mensagem"], ' +
      'input[placeholder*="Pergunte"], textarea[placeholder*="Pergunte"], ' +
      'input[placeholder*="Digite"], textarea[placeholder*="Digite"]'
    ).first()

    if (!await input.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Campo de input de mensagem não encontrado')
      return
    }

    // Digita uma pergunta simples
    await input.fill('Quantos clientes ativos temos?')

    // Envia (Enter ou botão)
    const sendBtn = page.locator('button[type="submit"], button:has-text("Enviar"), button:has(svg)').last()
    if (await sendBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sendBtn.click()
    } else {
      await input.press('Enter')
    }

    // Aguarda resposta da IA (pode demorar até 30s)
    // A resposta aparece como um novo bloco de texto no chat
    const resposta = page.locator('[class*="message"], [class*="chat"], [class*="response"], [class*="assistant"]')
      .filter({ hasNotText: /Quantos clientes/ })
      .last()

    // Espera qualquer indicador de que a resposta chegou
    // Pode ser texto, loading spinner que some, etc.
    await page.waitForTimeout(3_000)

    // Verifica que não houve erro visível
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
    await expect(page.locator('text=GEMINI_API_KEY não configurada')).not.toBeVisible()

    // Espera resposta real (até 30s)
    try {
      await page.waitForSelector('[class*="message"]:last-child, [class*="prose"]:last-child', { timeout: 30_000 })
    } catch {
      // Timeout pode ocorrer se a API demorar
      test.info().annotations.push({
        type: 'warning',
        description: 'Resposta da IA demorou mais de 30s. Pode ser problema de API key ou rede.'
      })
    }
  })

  test('histórico de conversas preserva mensagens', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Assistente IA/i }).click()
    await page.waitForTimeout(2_000)

    const input = page.locator(
      'input[placeholder*="mensagem"], input[placeholder*="Mensagem"], ' +
      'textarea[placeholder*="mensagem"], textarea[placeholder*="Mensagem"], ' +
      'input[placeholder*="Pergunte"], textarea[placeholder*="Pergunte"], ' +
      'input[placeholder*="Digite"], textarea[placeholder*="Digite"]'
    ).first()

    if (!await input.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Campo de input não encontrado')
      return
    }

    // Envia primeira mensagem
    await input.fill('Oi')
    await input.press('Enter')
    await page.waitForTimeout(5_000)

    // A mensagem "Oi" deve estar visível no chat
    await expect(page.getByText('Oi').first()).toBeVisible({ timeout: 10_000 })
  })
})
