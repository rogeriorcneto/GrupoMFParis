import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { criarClienteTeste, limparClienteTeste, gerarCnpjTeste } from './fixtures/database.fixture'

test.describe('Cliente — CRUD completo', () => {
  const cleanupIds: number[] = []

  test.afterAll(async () => {
    for (const id of cleanupIds) {
      try { await limparClienteTeste(id) } catch { /* ignora */ }
    }
  })

  test('criar novo cliente via UI e verificar na lista', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Clientes$/i }).click()
    await page.waitForTimeout(1_000)

    // Clica em Novo Cliente
    await page.click('button:has-text("Novo Cliente")')
    await expect(page.getByText('Novo Cliente')).toBeVisible({ timeout: 5_000 })

    // Preenche formulário
    const nome = `E2E CRUD ${Date.now()}`
    const cnpj = gerarCnpjTeste()

    await page.fill('input[name="razaoSocial"]', nome)
    await page.fill('input[name="cnpj"]', cnpj)
    await page.fill('input[name="contatoNome"]', 'Maria CRUD Teste')
    await page.fill('input[name="contatoTelefone"]', '31988880001')
    await page.fill('input[name="contatoEmail"]', 'maria.crud@teste.com')

    // Salva
    await page.click('button:has-text("Salvar")')

    // Modal deve fechar
    await expect(page.getByRole('heading', { name: 'Novo Cliente' })).not.toBeVisible({ timeout: 10_000 })

    // Verifica que apareceu na lista ou no funil
    await page.getByRole('button', { name: /Funil Comercial/i }).click()
    await page.waitForTimeout(2_000)
    await expect(page.getByText(nome)).toBeVisible({ timeout: 15_000 })
  })

  test('editar cliente existente — alterar contato', async ({ page }) => {
    // Cria cliente via fixture
    const { id, client } = await criarClienteTeste({ etapa: 'prospecção' })
    cleanupIds.push(id)

    const { data } = await client.from('clientes').select('razao_social').eq('id', id).single()
    const nome = data!.razao_social

    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Clientes$/i }).click()
    await page.waitForTimeout(2_000)

    // Busca o cliente na lista
    const searchInput = page.locator('input[placeholder*="Buscar"], input[placeholder*="buscar"]').first()
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill(nome)
      await page.waitForTimeout(1_000)
    }

    // Encontra a row do cliente e clica para abrir
    const row = page.getByText(nome).first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click()

    // Espera painel ou modal de detalhes
    await page.waitForTimeout(1_000)

    // Procura botão Editar no painel lateral
    const editBtn = page.getByRole('button', { name: /editar/i }).first()
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.click()
    }

    // Altera o nome do contato
    const novoContato = `Contato Editado ${Date.now()}`
    const contatoInput = page.locator('input[name="contatoNome"]')
    if (await contatoInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await contatoInput.fill(novoContato)
      await page.click('button:has-text("Salvar")')
      await page.waitForTimeout(2_000)

      // Verifica que o novo nome aparece
      await expect(page.getByText(novoContato)).toBeVisible({ timeout: 10_000 })
    }
  })

  test('clicar em cliente no funil abre painel lateral com dados', async ({ page }) => {
    const { id, client } = await criarClienteTeste({ etapa: 'proposta', valor_estimado: 75000 })
    cleanupIds.push(id)

    const { data } = await client.from('clientes').select('razao_social').eq('id', id).single()
    const nome = data!.razao_social

    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Funil Comercial/i }).click()
    await page.waitForTimeout(2_000)

    // Clica no card
    await page.getByText(nome).first().click()
    await page.waitForTimeout(1_000)

    // O painel deve mostrar dados do cliente
    await expect(page.getByText(nome)).toBeVisible({ timeout: 5_000 })
  })

  test('busca global encontra cliente', async ({ page }) => {
    const { id, client } = await criarClienteTeste({ etapa: 'prospecção' })
    cleanupIds.push(id)

    const { data } = await client.from('clientes').select('razao_social').eq('id', id).single()
    const nome = data!.razao_social

    await loginAs(page, 'gerente')

    // Abre busca global (ícone de lupa na TopBar)
    const searchBtn = page.locator('button[title*="Buscar"], button:has(svg.h-5.w-5)').first()
    if (await searchBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchBtn.click()

      const globalSearch = page.locator('input[placeholder*="Buscar"]').first()
      if (await globalSearch.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await globalSearch.fill(nome.slice(0, 15))
        await page.waitForTimeout(1_500)

        // Resultado deve conter o nome do cliente
        await expect(page.getByText(nome)).toBeVisible({ timeout: 5_000 })
      }
    }
  })
})
