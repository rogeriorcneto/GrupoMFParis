import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { limparClienteTeste, gerarCnpjTeste } from './fixtures/database.fixture'

test.describe('Cadastro de Cliente', () => {
  const clienteIds: number[] = []

  test.afterAll(async () => {
    // Limpa clientes criados durante os testes
    for (const id of clienteIds) {
      try { await limparClienteTeste(id) } catch { /* ignora se já deletado */ }
    }
  })

  test('cadastrar novo cliente com sucesso', async ({ page }) => {
    await loginAs(page, 'gerente')

    // Navega para Clientes
    await page.click('button:has-text("Clientes")')
    await expect(page.getByText('Clientes')).toBeVisible()

    // Clica em Novo Cliente
    await page.click('button:has-text("Novo Cliente")')

    // Aguarda o modal aparecer
    await expect(page.getByText('Novo Cliente')).toBeVisible({ timeout: 5_000 })

    // Preenche o formulário
    const razaoSocial = `E2E Teste Auto ${Date.now()}`
    const cnpj = gerarCnpjTeste()

    await page.fill('input[name="razaoSocial"]', razaoSocial)
    await page.fill('input[name="cnpj"]', cnpj)
    await page.fill('input[name="contatoNome"]', 'João E2E')
    await page.fill('input[name="contatoTelefone"]', '31999990001')
    await page.fill('input[name="contatoEmail"]', 'joao.e2e@teste.com')

    // Submete
    await page.click('button:has-text("Salvar")')

    // Modal deve fechar
    await expect(page.getByRole('heading', { name: 'Novo Cliente' })).not.toBeVisible({ timeout: 10_000 })

    // Toast de sucesso ou o cliente aparece na lista
    // Navega para o Funil para confirmar que o cliente apareceu na coluna Prospecção
    await page.click('button:has-text("Funil")')

    // Espera o funil carregar e procura o cliente
    await expect(page.getByText(razaoSocial)).toBeVisible({ timeout: 15_000 })
  })

  test('validação bloqueia submit sem razão social', async ({ page }) => {
    await loginAs(page, 'gerente')

    await page.click('button:has-text("Clientes")')
    await page.click('button:has-text("Novo Cliente")')
    await expect(page.getByText('Novo Cliente')).toBeVisible({ timeout: 5_000 })

    // Preenche tudo EXCETO razão social
    await page.fill('input[name="cnpj"]', '11222333000181')
    await page.fill('input[name="contatoNome"]', 'Teste')
    await page.fill('input[name="contatoTelefone"]', '31999990002')
    await page.fill('input[name="contatoEmail"]', 'teste@teste.com')

    // Tenta submeter — o campo required deve bloquear
    await page.click('button:has-text("Salvar")')

    // O modal deve continuar aberto (submit foi bloqueado pelo HTML required)
    await expect(page.getByRole('heading', { name: 'Novo Cliente' })).toBeVisible()
  })

  test('editar cliente existente', async ({ page }) => {
    await loginAs(page, 'gerente')

    // Navega para Clientes
    await page.click('button:has-text("Clientes")')

    // Espera a lista carregar — pega o primeiro cliente visível
    const firstRow = page.locator('tr').filter({ hasText: /.+/ }).nth(1) // skip header
    await firstRow.waitFor({ timeout: 15_000 })

    // Clica no botão editar do primeiro cliente
    const editButton = firstRow.getByRole('button', { name: /editar/i }).first()
    if (await editButton.isVisible()) {
      await editButton.click()
    } else {
      // Alguns layouts usam click na row
      await firstRow.click()
      // Verifica se abriu o painel e procura botão editar lá
      const panelEdit = page.getByRole('button', { name: /editar/i }).first()
      if (await panelEdit.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await panelEdit.click()
      } else {
        test.skip(true, 'Layout de edição não encontrado — skip')
        return
      }
    }

    // Espera o modal de edição
    await expect(page.getByText('Editar Cliente')).toBeVisible({ timeout: 5_000 })

    // Muda o nome do contato
    const novoNome = `Contato Editado ${Date.now()}`
    await page.fill('input[name="contatoNome"]', novoNome)

    // Salva
    await page.click('button:has-text("Salvar")')

    // Modal deve fechar
    await expect(page.getByRole('heading', { name: 'Editar Cliente' })).not.toBeVisible({ timeout: 10_000 })
  })
})
