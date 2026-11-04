import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

async function irAutomacoes(page: any) {
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.waitForTimeout(2_000)
  await page.locator('button:has-text("Automações")').first().dispatchEvent('click')
  await page.waitForTimeout(2_500)
}

test.describe('Automações de Vendas', () => {
  test('view renderiza sem erros para gerente', async ({ page }) => {
    await loginAs(page, 'gerente')
    await irAutomacoes(page)
    await expect(page.locator('h1', { hasText: 'Automações de Vendas' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('gerente vê abas de disparo e seções de canal/mensagem', async ({ page }) => {
    await loginAs(page, 'gerente')
    await irAutomacoes(page)
    await expect(page.getByText('1. Canal e Audiência')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('2. Mensagem')).toBeVisible({ timeout: 5_000 })
    // aba histórico
    await page.getByRole('button', { name: /histórico|historico/i }).first().click()
    await page.waitForTimeout(2_000)
    await expect(page.getByText(/Histórico de Disparos/i)).toBeVisible({ timeout: 10_000 })
  })

  test('criar automação via ⚙️ Criar Automação', async ({ page }) => {
    const nome = `Automação E2E ${Math.floor(Date.now() / 1000)}`
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /CRM MF Paris/i }).click()
    await page.waitForTimeout(2_000)
    await page.locator('button:has-text("Criar Automação")').first().dispatchEvent('click')
    await page.waitForTimeout(3_000)

    await page.getByRole('button', { name: /Notificação/ }).last().click()
    await page.waitForTimeout(1_500)
    await page.getByPlaceholder('Ex: Boas-vindas Novos Clientes').fill(nome)
    await page.getByPlaceholder(/Descreva como esta automação/i).fill('Teste E2E de criação')
    await page.getByRole('button', { name: /adicionar ação/i }).click()
    await page.waitForTimeout(1_000)
    const selAcao = page.locator('select').filter({ has: page.locator('option[value="enviar_mensagem"]') }).first()
    await selAcao.selectOption('enviar_mensagem')
    await page.waitForTimeout(500)
    await page.getByPlaceholder('Digite a mensagem...').fill('Mensagem E2E')
    const salvar = page.getByRole('button', { name: 'SALVAR AUTOMAÇÃO' })
    await salvar.click()
    await page.waitForTimeout(3_000)
    await page.getByRole('button', { name: /gerenciar/i }).click()
    await page.waitForTimeout(2_000)
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 15_000 })
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
