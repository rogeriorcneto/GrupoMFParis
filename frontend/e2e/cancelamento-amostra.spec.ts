import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { getAuthenticatedClient, criarClienteTeste, limparClienteTeste } from './fixtures/database.fixture'

/**
 * Regressão E2E: aprovar cancelamento de amostra deve concluir (não voltar à lista).
 * Bug real: card retornava porque status_amostra nunca era limpo (extras undefined ignorados).
 * Também valida a reorganização: amostra aparece na aba Cancelamentos com tag "Amostra".
 */

async function entrarNoCrm(page: any) {
  const modulo = page.getByRole('button', { name: /CRM MF Paris/i })
  if (await modulo.isVisible({ timeout: 5_000 }).catch(() => false)) await modulo.click()
}

test.describe('Cancelamento de amostra — aprovação conclui de verdade', () => {
  let clienteId: number
  let client: any

  test.beforeEach(async () => {
    client = await getAuthenticatedClient()
    const criado = await criarClienteTeste({
      etapa: 'amostra',
      status_amostra: 'cancelamento_pendente',
      data_envio_amostra: new Date().toISOString().split('T')[0],
    })
    clienteId = criado.id
  })

  test.afterEach(async () => {
    if (clienteId) await limparClienteTeste(clienteId).catch(() => {})
  })

  test('aprovar cancelamento move para prospecção e limpa status', async ({ page }) => {
    await loginAs(page, 'gerente')
    await entrarNoCrm(page)

    await page.locator('button[title="Abrir menu"]').click({ timeout: 15_000 })
    await page.getByRole('button', { name: /Aprovação de Pedidos/i }).click()

    // Aba Cancelamentos deve conter o card com tag "Amostra"
    await page.getByRole('button', { name: /Cancelamentos/ }).click()
    const card = page.locator('div.bg-white', { hasText: 'E2E Teste' }).filter({ hasText: 'Cancelamento Solicitado' }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    // Tag de tipo presente
    await expect(card.getByText('🧪 Amostra')).toBeVisible()

    // Aprova o cancelamento DENTRO do card do cliente de teste
    await card.getByRole('button', { name: /Aprovar Cancelamento/ }).click()

    // Card deve SUMIR da lista (não voltar)
    await expect(page.locator('text=E2E Teste')).not.toBeVisible({ timeout: 15_000 })

    // No banco: prospecção + status_amostra limpo
    const { data: cli } = await client.from('clientes').select('etapa,status_amostra,data_envio_amostra').eq('id', clienteId).single()
    expect(cli.etapa).toBe('prospecção')
    expect(cli.status_amostra).toBeNull()
  })
})
