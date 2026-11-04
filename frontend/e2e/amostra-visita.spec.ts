import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { criarClienteTeste, limparClienteTeste } from './fixtures/database.fixture'

test.describe('Frete Entregue em Visita (amostra)', () => {
  test('modal de amostra mostra a 3ª opção de frete', async ({ page }) => {
    const { id, client } = await criarClienteTeste({ etapa: 'prospecção' })
    try {
      await loginAs(page, 'gerente')
      await page.getByRole('button', { name: /CRM MF Paris/i }).click()
      await page.waitForTimeout(2_000)
      await page.locator('button:has-text("Funil Comercial")').first().dispatchEvent('click')
      await page.waitForTimeout(3_000)

      const { data } = await client.from('clientes').select('razao_social').eq('id', id).single()
      // abre o card do cliente e dispara Enviar Amostra
      await page.getByText(data!.razao_social).first().click()
      await page.waitForTimeout(2_000)
      const btnAmostra = page.getByRole('button', { name: /enviar amostra/i }).first()
      await expect(btnAmostra).toBeVisible({ timeout: 15_000 })
      await btnAmostra.click()
      await page.waitForTimeout(1_500)

      // As 3 opções de frete existem
      await expect(page.getByText('CIF (Entrega)')).toBeVisible()
      await expect(page.getByText('FOB (Retirada)')).toBeVisible()
      await expect(page.getByText('Entregue em Visita')).toBeVisible()

      // Selecionar Entregue em Visita marca o botão
      await page.getByText('Entregue em Visita').click()
      await page.waitForTimeout(500)
    } finally {
      await limparClienteTeste(id)
    }
  })

  test('amostra com frete VISITA aprovada no CRM sem ir ao Omie', async ({ page }) => {
    const { id: clienteId, client } = await criarClienteTeste({ etapa: 'amostra' })
    let pedidoId = 0
    try {
      // cria pedido tipo_frete VISITA via API (como a UI faria)
      const { data: pedido } = await client.from('pedidos').insert({
        cliente_id: clienteId, numero: 'E2E-VISITA-' + Date.now(), tipo: 'bonificacao',
        status: 'enviado', tipo_frete: 'VISITA', total_valor: 0,
        vendedor_id: 1, data_criacao: new Date().toISOString().slice(0, 10),
      }).select().single()
      pedidoId = pedido!.id
      expect(pedidoId).toBeGreaterThan(0)

      // aprova via API (gerente) — token do localStorage da sessão
      await loginAs(page, 'gerente')
      await page.goto('/')
      await page.waitForTimeout(1_500)
      const token = await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
          const v = localStorage.getItem(k)
          try { const j = JSON.parse(v || ''); if (j?.access_token) return j.access_token } catch {}
        }
        return null
      })
      const resp = await page.request.post(`https://grupomfparis-production.up.railway.app/api/pedidos/${pedidoId}/aprovar`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { tabela: 'A' },
      })
      const body = await resp.json()
      expect(body.success).toBe(true)

      await page.waitForTimeout(4_000) // background Omie teria rodado

      // pedido confirmado no CRM, SEM codigo Omie
      const { data: p } = await client.from('pedidos').select('status, omie_codigo, omie_erro').eq('id', pedidoId).single()
      expect(p!.status).toBe('confirmado')
      expect(p!.omie_codigo).toBeNull()
    } finally {
      if (pedidoId) await client.from('itens_pedido').delete().eq('pedido_id', pedidoId)
      if (pedidoId) await client.from('pedidos').delete().eq('id', pedidoId)
      await limparClienteTeste(clienteId)
    }
  })
})
