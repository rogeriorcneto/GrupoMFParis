import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { getAuthenticatedClient, criarClienteTeste, limparClienteTeste } from './fixtures/database.fixture'

/**
 * E2E: campo VT (valor tabela) nos itens do card de aprovação.
 * Cria pedido pendente com produto do simulador → VT deve exibir a diferença.
 */

let clienteId: number
let pedidoId: number
let client: any

test.beforeEach(async () => {
  client = await getAuthenticatedClient()
  const criado = await criarClienteTeste({ etapa: 'negociacao' })
  clienteId = criado.id
  const { data: ped } = await client.from('pedidos').insert({
    numero: `E2E-VT-${Date.now()}`,
    cliente_id: clienteId,
    status: 'enviado',
    total_valor: 20,
    tipo: 'venda',
    forma_pagamento: 'À vista',
  }).select('id').single()
  pedidoId = ped.id
  await client.from('itens_pedido').insert({
    pedido_id: pedidoId,
    nome_produto: 'LEITE EM PO INTEGRAL HORIZONTE 25KG',
    unidade: 'kg',
    preco: 20,
    quantidade: 1,
  })
})

test.afterEach(async () => {
  if (pedidoId) {
    await client.from('itens_pedido').delete().eq('pedido_id', pedidoId)
    await client.from('pedidos').delete().eq('id', pedidoId)
  }
  if (clienteId) await limparClienteTeste(clienteId).catch(() => {})
})

test('item do card mostra VT com diferença vs simulador', async ({ page }) => {
  await loginAs(page, 'gerente')
  const modulo = page.getByRole('button', { name: /CRM MF Paris/i })
  if (await modulo.isVisible({ timeout: 5_000 }).catch(() => false)) await modulo.click()

  await page.locator('button[title="Abrir menu"]').click({ timeout: 15_000 })
  await page.getByRole('button', { name: /Aprovação de Pedidos/i }).click()

  // O item exibe o preço + a linha VT com a diferença (+/-)
  const card = page.locator('div.bg-white', { hasText: 'E2E-VT-' }).first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  const vt = card.locator('div', { hasText: /^VT [+-]?/ }).first()
  await expect(vt).toBeVisible({ timeout: 15_000 })
  const txt = await vt.textContent()
  console.log('VT exibido:', txt)
  expect(txt).toMatch(/^VT [+-]?\d+,\d{2}/)
})
