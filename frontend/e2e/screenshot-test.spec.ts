import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

async function clickSidebarItem(page: any, label: string) {
  await page.evaluate((text: string) => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const btn = buttons.find(b => b.textContent?.toLowerCase().includes(text.toLowerCase()))
    if (btn) (btn as HTMLButtonElement).click()
  }, label)
}

test('login and screenshot views', async ({ page }) => {
  await loginAs(page, 'gerente')
  await page.screenshot({ path: 'e2e/screenshots/01-portal.png', fullPage: true })

  // Acessar o modulo CRM
  const crmCard = page.locator('text=CRM MF Paris').first()
  await crmCard.click()
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: 'e2e/screenshots/02-crm-dashboard.png', fullPage: true })

  // Clicar em Clientes via JS (fora do viewport)
  await clickSidebarItem(page, 'Clientes')
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: 'e2e/screenshots/03-clientes.png', fullPage: true })

  // Clicar em Funil
  await clickSidebarItem(page, 'Funil')
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: 'e2e/screenshots/04-funil.png', fullPage: true })

  // Clicar em Pedidos
  await clickSidebarItem(page, 'Pedidos')
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: 'e2e/screenshots/05-pedidos.png', fullPage: true })
})
