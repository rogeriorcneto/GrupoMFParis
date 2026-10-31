import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

async function clickSidebarItem(page: any, label: string) {
  await page.evaluate((text: string) => {
    const spans = Array.from(document.querySelectorAll('button span'))
    const span = spans.find(s => s.textContent?.trim() === text)
    const btn = span?.closest('button') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text)
    if (btn) (btn as HTMLButtonElement).click()
  }, label)
  await page.waitForTimeout(2000)
}

const CLIENTE_NOME = 'Empresa Teste UI 1792170214461'
const CHAVE = '1792170214461'

test('UI: cliente existente -> venda Tabela A -> amostra aprovada', async ({ page }) => {
  test.setTimeout(300_000)
  await loginAs(page, 'gerente')
  await page.locator('text=CRM MF Paris').first().click()
  await page.waitForTimeout(3000)

  // ============================================================
  // 1) VENDA COM TABELA A
  // ============================================================
  console.log('[UI] === VENDA TABELA A ===')
  await clickSidebarItem(page, 'Pedidos')

  // busca e seleciona o cliente existente
  const clienteSearch = page.locator('input[placeholder*="Buscar cliente"]').first()
  await clienteSearch.click()
  await clienteSearch.fill(CHAVE)
  await page.waitForTimeout(1500)
  await page.locator(`button:has-text("${CHAVE}")`).first().click()
  await page.waitForTimeout(800)

  // tipo Venda + frete FOB + pagamento 30/60
  await page.locator('button:has-text("Venda")').first().click().catch(() => {})
  await page.locator('button:has-text("FOB")').first().click().catch(() => {})
  await page.locator('select').filter({ has: page.locator('option:has-text("À vista")') }).first()
    .selectOption({ label: '30/60' }).catch(async () => {
      await page.locator('select').nth(0).selectOption('30/60').catch(() => {})
    })

  // adiciona produto
  const buscaProduto = page.locator('input[placeholder="Buscar..."]').first()
  await buscaProduto.fill('PERMEADO')
  await page.waitForTimeout(1200)
  const addBtn = page.locator('button:has-text("Adicionar")').first()
  if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await addBtn.click()
    await page.waitForTimeout(800)
    await page.locator('input[type="number"][min="0.01"]').first().fill('50')
    await page.waitForTimeout(500)
  }

  // preço unitário
  const precoInput = page.locator('input[type="number"][min="0"][step="0.01"]').last()
  if (await precoInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await precoInput.click()
    await precoInput.fill('3.00')
    await page.waitForTimeout(500)
  }

  await page.locator('textarea[placeholder*="Condicoes"], textarea').last()
    .fill('Pedido Tabela A - teste UI com cliente existente')

  await page.locator('button:has-text("Enviar")').first().scrollIntoViewIfNeeded()
  await page.locator('button:has-text("Enviar")').first().click()
  await page.waitForTimeout(4000)
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('button:has-text("Histórico"), button:has-text("Historico"), button:has-text("OK"), button:has-text("Fechar")').first().click().catch(() => {})
  await page.waitForTimeout(800)

  // aprovação TABELA A
  await clickSidebarItem(page, 'Aprovação de Pedidos')
  await page.waitForTimeout(2000)

  const cardPedido = page.locator('div.bg-white.rounded-apple, div.bg-white.rounded-xl', { hasText: CHAVE }).last()
  const cardPedidoOk = await cardPedido.isVisible({ timeout: 8_000 }).catch(() => false)
  const scope = cardPedidoOk ? cardPedido : page

  const tabA = scope.locator('button[title*="tabela A"], button:has-text("Tabela A")').first()
  if (await tabA.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await tabA.click()
    await page.waitForTimeout(500)
    console.log('[UI] Tabela A selecionada')
  }

  await scope.locator('button:has-text("Aprovar Pedido")').first().click()
  await page.waitForTimeout(15_000)
  console.log('[UI] Venda Tabela A aprovada')

  // ============================================================
  // 2) AMOSTRA (BONIFICAÇÃO)
  // ============================================================
  console.log('[UI] === AMOSTRA / BONIFICAÇÃO ===')
  await clickSidebarItem(page, 'Pedidos')

  // novo pedido para o mesmo cliente
  const clienteSearch2 = page.locator('input[placeholder*="Buscar cliente"]').first()
  await clienteSearch2.click()
  await clienteSearch2.fill(CHAVE)
  await page.waitForTimeout(1500)
  await page.locator(`button:has-text("${CHAVE}")`).first().click()
  await page.waitForTimeout(800)

  // tipo Amostra + frete CIF
  await page.locator('button:has-text("Amostra")').first().click().catch(() => {})
  await page.locator('button:has-text("CIF")').first().click().catch(() => {})
  await page.locator('select').filter({ has: page.locator('option:has-text("À vista")') }).first()
    .selectOption({ label: 'À vista' }).catch(async () => {
      await page.locator('select').nth(0).selectOption('À vista').catch(() => {})
    })

  const buscaProduto2 = page.locator('input[placeholder="Buscar..."]').first()
  await buscaProduto2.fill('OKEY')
  await page.waitForTimeout(1200)
  const addBtn2 = page.locator('button:has-text("Adicionar")').first()
  if (await addBtn2.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await addBtn2.click()
    await page.waitForTimeout(800)
    await page.locator('input[type="number"][min="0.01"]').first().fill('2')
    await page.waitForTimeout(500)
  }

  await page.locator('textarea[placeholder*="Condicoes"], textarea').last()
    .fill('Amostra de teste UI - bonificacao')

  await page.locator('button:has-text("Enviar")').first().scrollIntoViewIfNeeded()
  await page.locator('button:has-text("Enviar")').first().click()
  await page.waitForTimeout(4000)
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('button:has-text("Histórico"), button:has-text("Historico"), button:has-text("OK"), button:has-text("Fechar")').first().click().catch(() => {})
  await page.waitForTimeout(800)

  // aprovação amostra (sem seletor de tabela)
  await clickSidebarItem(page, 'Aprovação de Pedidos')
  await page.waitForTimeout(2000)

  const cardAmostra = page.locator('div.bg-white.rounded-apple, div.bg-white.rounded-xl', { hasText: CHAVE }).last()
  const cardAmostraOk = await cardAmostra.isVisible({ timeout: 8_000 }).catch(() => false)
  const scopeA = cardAmostraOk ? cardAmostra : page

  await scopeA.locator('button:has-text("Aprovar Pedido")').first().click()
  await page.waitForTimeout(15_000)
  console.log('[UI] Amostra aprovada')
})
