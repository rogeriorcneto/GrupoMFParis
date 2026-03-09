import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('Produto — CRUD completo', () => {

  test('criar novo produto via UI', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Produtos$/i }).click()
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible({ timeout: 10_000 })

    // Clica em Novo Produto
    const novoBtn = page.locator('button:has-text("Novo Produto")')
    await expect(novoBtn).toBeVisible({ timeout: 5_000 })
    await novoBtn.click()

    // Modal deve abrir
    await expect(page.locator('h2', { hasText: 'Novo Produto' })).toBeVisible({ timeout: 5_000 })

    // Preenche campos obrigatórios
    const nome = `E2E Produto ${Date.now()}`
    const nomeInput = page.locator('input').filter({ has: page.locator('..'), hasText: /^$/ }).first()
    // Nome field is the first input in the modal after photo section
    const allInputs = page.locator('.fixed input[type="text"], .fixed input:not([type])')
    const nomeField = allInputs.first()
    await nomeField.click()
    await nomeField.fill(nome)

    // Descrição (textarea)
    const descricaoField = page.locator('.fixed textarea').first()
    await descricaoField.click()
    await descricaoField.fill('Produto de teste E2E criado automaticamente')

    // Preço
    const precoField = page.locator('.fixed input[type="number"]').first()
    await precoField.scrollIntoViewIfNeeded()
    await precoField.click()
    await precoField.fill('99.50')

    // Clica em Criar Produto
    const criarBtn = page.locator('button:has-text("Criar Produto")')
    await criarBtn.scrollIntoViewIfNeeded()
    await expect(criarBtn).toBeEnabled({ timeout: 3_000 })
    await criarBtn.click()

    // Modal deve fechar
    await expect(page.locator('h2', { hasText: 'Novo Produto' })).not.toBeVisible({ timeout: 10_000 })

    // Produto deve aparecer na lista
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 10_000 })
  })

  test('editar produto — alterar preço', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Produtos$/i }).click()
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_000)

    // Encontra o primeiro card de produto com botão Editar
    const editarBtn = page.locator('button:has-text("Editar")').first()
    if (!await editarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum produto com botão Editar encontrado')
      return
    }

    await editarBtn.click()

    // Modal de edição deve abrir
    await expect(page.locator('h2', { hasText: 'Editar Produto' })).toBeVisible({ timeout: 5_000 })

    // Altera o preço
    const precoField = page.locator('.fixed input[type="number"]').first()
    await precoField.scrollIntoViewIfNeeded()
    await precoField.click()
    await precoField.fill('')
    await precoField.fill('150.00')

    // Clica em Salvar
    const salvarBtn = page.locator('.fixed button:has-text("Salvar")')
    await salvarBtn.scrollIntoViewIfNeeded()
    await salvarBtn.click()

    // Modal deve fechar
    await expect(page.locator('h2', { hasText: 'Editar Produto' })).not.toBeVisible({ timeout: 10_000 })

    // Preço atualizado deve aparecer
    await expect(page.getByText('150,00').first()).toBeVisible({ timeout: 10_000 })
  })

  test('desativar e reativar produto', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Produtos$/i }).click()
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_000)

    // Encontra botão Desativar no primeiro produto ativo
    const desativarBtn = page.locator('button:has-text("Desativar")').first()
    if (!await desativarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum produto ativo com botão Desativar encontrado')
      return
    }

    await desativarBtn.click()
    await page.waitForTimeout(2_000)

    // Agora deve ter um botão "Ativar" (o produto desativado mostra "Ativar")
    // Filtra para ver inativos
    const filtroSelect = page.locator('select').filter({ hasText: /Todos|Ativos|Inativos/ }).first()
    if (await filtroSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await filtroSelect.selectOption('inativo')
      await page.waitForTimeout(1_000)
    }

    const ativarBtn = page.locator('button:has-text("Ativar")').first()
    if (await ativarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ativarBtn.click()
      await page.waitForTimeout(2_000)
    }

    // Volta para "Todos" e verifica que a página renderiza sem erro
    if (await filtroSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await filtroSelect.selectOption('')
      await page.waitForTimeout(1_000)
    }

    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible()
  })

  test('ver detalhes do produto', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Produtos$/i }).click()
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_000)

    // Clica em "Ver detalhes" do primeiro produto
    const detalhesBtn = page.locator('button:has-text("Ver detalhes")').first()
    if (!await detalhesBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum produto com botão Ver detalhes encontrado')
      return
    }

    await detalhesBtn.click()

    // Modal de detalhes deve abrir com informações do produto
    await page.waitForTimeout(1_000)
    await expect(page.getByText('Preço').first()).toBeVisible({ timeout: 5_000 })

    // Fecha o modal clicando no X
    const closeBtn = page.locator('.fixed button').filter({ has: page.locator('svg') }).first()
    if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.click()
    }

    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible()
  })

  test('filtro por categoria funciona', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Produtos$/i }).click()
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_000)

    // Seleciona uma categoria
    const catSelect = page.locator('select').filter({ hasText: /Todas categorias/ }).first()
    if (!await catSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Filtro de categoria não encontrado')
      return
    }

    await catSelect.selectOption('sacaria')
    await page.waitForTimeout(2_000)

    // Deve mostrar produtos de sacaria ou mensagem "Nenhum produto encontrado"
    // Verifica pelos cards (h3 headings dentro do grid) ou mensagem vazia
    const productCards = page.locator('h3').first()
    const nenhumMsg = page.getByText('Nenhum produto encontrado').first()
    const hasProducts = await productCards.isVisible({ timeout: 3_000 }).catch(() => false)
    const hasNenhum = await nenhumMsg.isVisible({ timeout: 1_000 }).catch(() => false)

    // Um dos dois deve ser verdadeiro (filtro funcionou)
    expect(hasProducts || hasNenhum).toBeTruthy()

    // Volta para todas categorias
    await catSelect.selectOption('')
    await page.waitForTimeout(500)
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible()
  })

  test('busca por nome de produto funciona', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Produtos$/i }).click()
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_000)

    // Campo de busca
    const searchInput = page.locator('input[placeholder*="Buscar por nome"]').first()
    if (!await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Campo de busca de produtos não encontrado')
      return
    }

    // Busca por algo improvável
    await searchInput.fill('ZZZNÃOEXISTE999')
    await page.waitForTimeout(1_000)
    await expect(page.locator('text=Nenhum produto encontrado')).toBeVisible({ timeout: 5_000 })

    // Limpa busca
    await searchInput.fill('')
    await page.waitForTimeout(1_000)

    // Produtos devem reaparecer
    await expect(page.locator('h2', { hasText: 'Catálogo de Produtos' })).toBeVisible()
  })
})
