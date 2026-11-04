import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

const NOME_MISSAO = `Missão E2E ${Math.floor(Date.now() / 1000)}`

async function abrirMissoes(page: any) {
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.waitForTimeout(2_000)
  await page.locator('button:has-text("Missões")').first().dispatchEvent('click')
  await page.waitForTimeout(2_500)
}

test('Missão Comercial — fluxo completo', async ({ page, context }) => {
  test.setTimeout(180_000)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -22.9, longitude: -47.06 })
  await loginAs(page, 'gerente')

  await test.step('abrir Missões e criar missão', async () => {
    await abrirMissoes(page)
    await page.getByRole('button', { name: /nova missão/i }).click()
    await page.getByPlaceholder('Nome da missão').fill(NOME_MISSAO)
    await page.getByPlaceholder('Objetivo').fill('Desenvolver equipe')
    const datas = page.locator('input[type="date"]')
    await datas.nth(0).fill('2026-11-10')
    await datas.nth(1).fill('2026-11-14')
    await page.getByPlaceholder('Cidades (separadas por vírgula)').fill('Campinas')
    await page.getByRole('button', { name: /^Salvar$/ }).click()
    await page.waitForTimeout(2_500)
    await expect(page.getByText(NOME_MISSAO)).toBeVisible({ timeout: 15_000 })
  })

  await test.step('gerar roteiro com cliente planejado', async () => {
    await page.getByText(NOME_MISSAO).first().click()
    await page.waitForTimeout(2_000)
    const sel = page.locator('select[multiple]').first()
    await expect(sel).toBeVisible({ timeout: 10_000 })
    await sel.selectOption({ index: 0 })
    await page.getByRole('button', { name: /gerar roteiro/i }).click()
    await page.waitForTimeout(2_500)
    await expect(page.getByText('Visita -').first()).toBeVisible({ timeout: 10_000 })
  })

  await test.step('solicitar aprovação', async () => {
    await page.getByRole('button', { name: /solicitar aprovação/i }).click()
    await page.waitForTimeout(2_500)
    await expect(page.getByText('aguardando aprovacao').first()).toBeVisible({ timeout: 10_000 })
  })

  await test.step('aprovar missão', async () => {
    await page.getByRole('button', { name: '✅ Aprovar' }).click()
    await page.waitForTimeout(2_500)
    await expect(page.getByText('aprovada').first()).toBeVisible({ timeout: 10_000 })
  })

  await test.step('iniciar missão', async () => {
    await page.getByRole('button', { name: /^Iniciar missão$/ }).click()
    await page.waitForTimeout(2_500)
    await expect(page.getByText('em andamento').first()).toBeVisible({ timeout: 10_000 })
  })

  await test.step('check-in e check-out com GPS', async () => {
    await page.getByRole('button', { name: /check-in/i }).first().click()
    await page.waitForTimeout(2_500)
    await page.getByRole('button', { name: /check-out/i }).first().click()
    await page.waitForTimeout(1_000)
    await page.getByPlaceholder('Resultado da visita').fill('Visita E2E — interessado')
    await page.getByPlaceholder('Próximos passos').fill('Enviar proposta')
    await page.getByRole('button', { name: /confirmar check-out/i }).click()
    await page.waitForTimeout(2_500)
    await expect(page.getByText('concluida').first()).toBeVisible({ timeout: 10_000 })
  })

  await test.step('adicionar despesa', async () => {
    await page.locator('input[placeholder="Valor"]').fill('250')
    await page.locator('input[type="date"]').last().fill('2026-11-10')
    await page.getByRole('button', { name: /adicionar despesa/i }).click()
    await page.waitForTimeout(2_500)
    await expect(page.getByText('R$ 250')).toBeVisible({ timeout: 10_000 })
  })

  await test.step('finalizar missão com IEM', async () => {
    await page.getByRole('button', { name: /finalizar missão/i }).click()
    await page.waitForTimeout(4_000)
    await expect(page.getByText(/IEM — Índice/).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('concluida').first()).toBeVisible({ timeout: 10_000 })
  })
})
