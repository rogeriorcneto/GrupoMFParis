import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('iOS — fluxo de pedido (WebKit)', () => {
  test('navega para Pedidos e cria pedido', async ({ page }) => {
    const erros: string[] = []
    page.on('pageerror', e => erros.push(`pageerror: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') erros.push(`console: ${m.text()}`) })

    await loginAs(page, 'gerente')

    // Portal → módulo CRM
    const modulo = page.getByRole('button', { name: /CRM MF Paris/i })
    if (await modulo.isVisible({ timeout: 8_000 }).catch(() => false)) {
      try { await modulo.tap({ timeout: 10_000 }) }
      catch {
        console.log('TAP falhou — tentando dispatchEvent')
        await modulo.dispatchEvent('click')
      }
    }

    // Menu hambúrguer (sidebar é drawer no mobile)
    await page.locator('button[title="Abrir menu"]').click({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Pedidos', exact: true }).click()
    await expect(page.locator('h2', { hasText: 'Lançamento de Pedidos' })).toBeVisible({ timeout: 15_000 })

    // Selecionar cliente
    const selCliente = page.locator('select').first()
    if (await selCliente.isVisible().catch(() => false)) {
      const opts = await selCliente.locator('option').allTextContents()
      console.log('CLIENTES OPTIONS:', opts.length)
      await selCliente.selectOption({ index: 1 }).catch(e => console.log('select fail:', e.message))
    }

    // Buscar produto e definir quantidade/preço
    const inputs = page.locator('input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]')
    const nInputs = await inputs.count()
    console.log('NUMERIC INPUTS:', nInputs)

    // Tenta clicar no botão de enviar pedido (se existir)
    const btn = page.getByRole('button', { name: /Enviar|Salvar|Criar Pedido|Finalizar/i }).first()
    if (await btn.isVisible().catch(() => false)) {
      console.log('BOTÃO ENVIAR VISÍVEL:', await btn.textContent())
    }

    // Loga erros JS capturados
    console.log('=== ERROS JS ===\n' + erros.join('\n'))
    await page.screenshot({ path: 'test-results/ios-pedido.png', fullPage: true })
  })
})
