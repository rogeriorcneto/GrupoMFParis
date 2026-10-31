import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('iOS — cadastro de cliente', () => {
  test('abre modal novo cliente e salva', async ({ page }) => {
    const erros: string[] = []
    page.on('pageerror', e => erros.push(`pageerror: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') erros.push(`console: ${m.text()}`) })

    await loginAs(page, 'gerente')
    const modulo = page.getByRole('button', { name: /CRM MF Paris/i })
    if (await modulo.isVisible({ timeout: 8_000 }).catch(() => false)) await modulo.tap().catch(() => modulo.dispatchEvent('click'))

    await page.locator('button[title="Abrir menu"]').click({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Clientes', exact: true }).click()
    await page.waitForTimeout(2_000)

    await page.getByRole('button', { name: 'Novo' }).click({ timeout: 10_000 })
    await page.waitForSelector('text=Informe CNPJ ou CPF', { timeout: 8_000 })

    // Campos por placeholder/label
    await page.locator('input[placeholder="00.000.000/0000-00"]').fill('11222333000181')
    await page.locator('input[placeholder="Ex: Supermercado BH Ltda"]').fill('E2E IOS TESTE LTDA')
    const tel = page.locator('input[placeholder="(00) 00000-0000"]').first()
    if (await tel.isVisible().catch(() => false)) await tel.fill('71999998888')
    const rua = page.locator('input[placeholder*="rua" i], input[placeholder*="logradouro" i], input[placeholder*="endereço" i]').first()
    if (await rua.isVisible().catch(() => false)) await rua.fill('Rua Teste')

    await page.screenshot({ path: 'test-results/ios-cliente-preenchido.png', fullPage: true })
    const btnSalvar = page.getByRole('button', { name: /Salvar|Cadastrar|Criar Cliente/i }).last()
    console.log('BTN SALVAR:', await btnSalvar.textContent().catch(() => '?'))
    await btnSalvar.tap().catch(() => btnSalvar.click({ force: true }))
    await page.waitForTimeout(6_000)
    await page.screenshot({ path: 'test-results/ios-cliente-depois.png', fullPage: true })

    console.log('=== ERROS JS ===\n' + erros.join('\n'))
    const modalAindaAberto = await page.locator('text=Informe CNPJ ou CPF').isVisible().catch(() => false)
    console.log('MODAL AINDA ABERTO:', modalAindaAberto)
    const toasts = await page.locator('[class*="toast"], [class*="Toast"], [role="alert"]').allTextContents()
    console.log('TOASTS:', JSON.stringify(toasts.slice(0, 5)))
  })
})
