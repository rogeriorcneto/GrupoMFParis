import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

const VIEW_LABELS = ['Dashboard', 'Aprovação de Pedidos', 'Funil Comercial', 'Clientes', 'Pedidos']

async function openSidebar(page: any) {
  const hamburger = page.locator('button[title="Abrir menu"]').first()
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click()
    await page.waitForTimeout(800)
  }
}

async function navigateTo(page: any, label: string) {
  await openSidebar(page)
  await page.evaluate((text: string) => {
    const spans = Array.from(document.querySelectorAll('button span'))
    const span = spans.find(s => s.textContent?.trim() === text)
    const btn = span?.closest('button') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text)
    if (btn) (btn as HTMLButtonElement).click()
  }, label)
  await page.waitForTimeout(1500)
}

test('UI mobile: navegar por todas as views principais', async ({ page }) => {
  test.setTimeout(180_000)

  await page.setViewportSize({ width: 390, height: 844 })

  // login
  await loginAs(page, 'gerente')
  await page.locator('text=CRM MF Paris').first().click()
  await page.waitForTimeout(3000)

  // 1. Sidebar abre e fecha
  await openSidebar(page)
  await expect(page.locator('text=Grupo MF Paris').first()).toBeVisible()
  await page.locator('button[title="Fechar menu"]').first().click()
  await page.waitForTimeout(500)

  // 2. Navegar por cada view e verificar conteúdo visível
  for (const label of VIEW_LABELS) {
    console.log(`[MOBILE] Navegando para: ${label}`)
    await navigateTo(page, label)
    await page.screenshot({ path: `e2e/screenshots/mobile-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`, fullPage: true })

    // verifica se a tela não está em branco — procura por algum texto/cabeçalho
    const hasText = await page.locator('h1, h2, h3, p, button').first().isVisible().catch(() => false)
    console.log(`[MOBILE] ${label} visivel:`, hasText)
  }

  // 3. Clientes - abrir formulario
  await navigateTo(page, 'Clientes')
  await page.locator('button:has-text("Novo Cliente")').first().click()
  await page.waitForTimeout(1000)
  await expect(page.locator('h2:has-text("Novo Cliente")').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/mobile-cliente-form.png', fullPage: true })

  // fecha modal
  await page.locator('button:has-text("Cancelar")').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(500)

  // 4. Pedidos - abrir tela
  await navigateTo(page, 'Pedidos')
  await expect(page.locator('text=Lançamento de Pedidos').first()).toBeVisible()

  console.log('[MOBILE] Navegação mobile concluída')
})
