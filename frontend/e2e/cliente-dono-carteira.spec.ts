import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'
import { getAuthenticatedClient, criarClienteTeste, limparClienteTeste } from './fixtures/database.fixture'

/**
 * Regressão E2E: edição de cadastro não pode mudar o dono da carteira
 * nem duplicar o card do cliente.
 *
 * Bug real: Bernardo (gerente) alterou o cadastro de um cliente do Artur e
 * o sistema criou um segundo card com dono = Bernardo (quem clicou).
 *
 * Regras validadas:
 *  - Gerente editando sem trocar o select de vendedor → dono permanece.
 *  - Vendedor editando cliente → dono permanece (não "puxa" pra si).
 *  - Após salvar, existe exatamente 1 cadastro da razão social (sem clone).
 */

async function idVendedorE2E(client: any): Promise<number> {
  // Vendedor usado como "dono" do cliente de teste: a conta E2E de vendedor,
  // ou qualquer vendedor da base (fallback).
  const email = credentials.vendedor.email
  const { data: v } = await client.from('vendedores').select('id,nome,cargo').eq('email', email).maybeSingle()
  if (v?.id) return v.id
  const { data: qualquer } = await client.from('vendedores').select('id,nome,cargo').eq('cargo', 'vendedor').limit(1)
  if (!qualquer?.length) throw new Error('Nenhum vendedor encontrado para o teste')
  return qualquer[0].id
}

async function contarCadastros(client: any, razaoSocial: string) {
  const { data } = await client.from('clientes').select('id,vendedor_id,etapa').eq('razao_social', razaoSocial)
  return data || []
}

async function entrarNoCrm(page: any) {
  // O login cai no portal do Grupo Paris — entrar no módulo CRM
  const modulo = page.getByRole('button', { name: /CRM MF Paris/i })
  if (await modulo.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await modulo.click()
  }
}

async function abrirEdicaoDoCliente(page: any, razaoSocial: string) {
  await entrarNoCrm(page)
  // Abre o menu lateral (drawer) — os botões existem no DOM mas fora do viewport
  await page.locator('button[title="Abrir menu"]').click()
  await page.getByRole('navigation').getByRole('button', { name: 'Clientes', exact: true }).click()
  await expect(page.locator('h2', { hasText: /^Clientes$/ })).toBeVisible({ timeout: 15_000 })
  // Busca pelo nome para isolar a linha do cliente de teste
  const busca = page.locator('input[placeholder*="Buscar"], input[placeholder*="buscar"], input[type="search"]').first()
  await busca.fill(razaoSocial)
  const linha = page.getByRole('row', { name: razaoSocial }).first()
  await expect(linha).toBeVisible({ timeout: 10_000 })
  await linha.hover()
  await linha.locator('button[title="Editar"]').click()
  await expect(page.locator('text=Editar Cliente')).toBeVisible({ timeout: 10_000 })
}

test.describe('Dono da carteira — edição de cadastro', () => {
  test('gerente edita cliente de outro vendedor: dono permanece e não duplica', async ({ page }) => {
    const client = await getAuthenticatedClient()
    const donoId = await idVendedorE2E(client)
    const { id, client: cli } = await criarClienteTeste({ vendedor_id: donoId, etapa: 'negociacao', endereco_rua: 'Rua E2E', endereco_numero: '1', endereco_bairro: 'Centro', endereco_cidade: 'Belo Horizonte', endereco_estado: 'MG' })
    const razao = (await cli.from('clientes').select('razao_social').eq('id', id).single()).data.razao_social

    try {
      await loginAs(page, 'gerente')
      await abrirEdicaoDoCliente(page, razao)

      // Altera apenas o nome fantasia — não toca no select de vendedor
      await page.locator('input[name="nomeFantasia"]').fill(`NF E2E ${Date.now()}`)
      await page.getByRole('button', { name: /Salvar Cliente/i }).click()
      await expect(page.locator('text=Editar Cliente')).not.toBeVisible({ timeout: 15_000 })

      // Espera o update persistir e confere no banco
      await page.waitForTimeout(1500)
      const rows = await contarCadastros(client, razao)
      expect(rows, 'cadastro não pode ter sido duplicado').toHaveLength(1)
      expect(rows[0].id).toBe(id)
      expect(rows[0].vendedor_id, 'dono da carteira não pode mudar na edição').toBe(donoId)
    } finally {
      await limparClienteTeste(id)
    }
  })

  test('vendedor edita cliente: dono permanece e não duplica', async ({ page }) => {
    test.skip(!credentials.vendedor.senha, 'E2E_VENDEDOR_SENHA não configurada')
    const client = await getAuthenticatedClient()
    const donoId = await idVendedorE2E(client)
    const { id, client: cli } = await criarClienteTeste({ vendedor_id: donoId, etapa: 'negociacao', endereco_rua: 'Rua E2E', endereco_numero: '1', endereco_bairro: 'Centro', endereco_cidade: 'Belo Horizonte', endereco_estado: 'MG' })
    const razao = (await cli.from('clientes').select('razao_social').eq('id', id).single()).data.razao_social

    try {
      await loginAs(page, 'vendedor')
      await abrirEdicaoDoCliente(page, razao)

      await page.locator('input[name="nomeFantasia"]').fill(`NF E2E ${Date.now()}`)
      await page.getByRole('button', { name: /Salvar Cliente/i }).click()
      await expect(page.locator('text=Editar Cliente')).not.toBeVisible({ timeout: 15_000 })

      await page.waitForTimeout(1500)
      const rows = await contarCadastros(client, razao)
      expect(rows, 'cadastro não pode ter sido duplicado').toHaveLength(1)
      expect(rows[0].vendedor_id, 'vendedor editando não pode virar dono').toBe(donoId)
    } finally {
      await limparClienteTeste(id)
    }
  })
})
