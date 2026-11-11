import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { getAuthenticatedClient, criarClienteTeste, limparClienteTeste } from './fixtures/database.fixture'

/**
 * Regressão: clicar num card de novo ciclo na coluna Proposta e gerar a
 * negociação deve MOVER o mesmo card para Negociação — não pode criar
 * um segundo card (proposta + negociação duplicados para a mesma empresa).
 */

test('card de novo ciclo em Proposta: gerar negociação move o card sem duplicar', async ({ page }) => {
  const cleanupIds: number[] = []

  // Card de origem (follow_up) + card de ciclo em proposta
  const { id: origemId } = await criarClienteTeste({ etapa: 'follow_up' })
  cleanupIds.push(origemId)
  const client = await getAuthenticatedClient()
  const { data: origem } = await client.from('clientes').select('cnpj, razao_social').eq('id', origemId).single()
  const nomeCiclo = `E2E Ciclo ${Date.now()}`
  const { data: cicloCard, error: cicloErr } = await client.from('clientes').insert({
    razao_social: nomeCiclo,
    cnpj: origem!.cnpj,
    etapa: 'proposta',
    novo_ciclo: true,
    origem_ciclo_id: origemId,
    empresa_funil_id: origemId,
  }).select('id').single()
  if (cicloErr) throw cicloErr
  cleanupIds.push(cicloCard!.id)

  const contarCardsDaEmpresa = async () => {
    const { data } = await client.from('clientes')
      .select('id, etapa')
      .eq('empresa_funil_id', origemId)
      .eq('arquivado_duplicata', false)
    return data || []
  }
  const antes = await contarCardsDaEmpresa()

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.waitForTimeout(2_000)
  await page.getByRole('button', { name: /Funil Comercial/i }).dispatchEvent('click')
  await page.waitForTimeout(3_000)

  // Usa a busca do funil — filtra os cards pelo nome do cliente E2E
  const busca = page.getByPlaceholder(/buscar|pesquisar/i).first()
  if (await busca.isVisible().catch(() => false)) await busca.fill(nomeCiclo)
  await page.waitForTimeout(2_000)

  // Card do novo ciclo na coluna Proposta — nome único, clique direto → painel do cliente
  await page.getByText(nomeCiclo, { exact: true }).last().click()
  const painel = page.locator('.fixed.inset-0').last()
  await expect(painel.getByRole('button', { name: /Negociar/i })).toBeVisible({ timeout: 15_000 })

  // Botão "Negociar" abre o modal de proposta
  await painel.getByRole('button', { name: /Negociar/i }).click()
  const modal = page.locator('.fixed.inset-0').last()
  await expect(modal.getByRole('button', { name: /Gerar Proposta/i })).toBeVisible({ timeout: 15_000 })

  await modal.getByRole('button', { name: /Gerar Proposta/i }).click({ timeout: 30_000 })
  await page.waitForTimeout(8_000)

  // Verifica no banco: o card moveu pra negociacao e NÃO nasceu card novo
  const depois = await contarCardsDaEmpresa()
  const { data: cardAgora } = await client.from('clientes').select('etapa').eq('id', cicloCard!.id).single()

  expect(cardAgora?.etapa, `card ${cicloCard!.id} devia estar em negociacao, está em ${cardAgora?.etapa}`).toBe('negociacao')
  expect(depois.length, `empresa devia continuar com ${antes.length} card(s), tem ${depois.length}`).toBe(antes.length)

  // Cleanup
  for (const id of cleanupIds) { try { await limparClienteTeste(id) } catch { /* ignora */ } }
})
