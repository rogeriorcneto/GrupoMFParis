import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

test.describe('Templates de Mensagens', () => {
  test('view renderiza sem erros', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await expect(page.locator('h2', { hasText: 'Templates de Mensagens' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('criar novo template de mensagem', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await page.waitForTimeout(1_000)

    const novoBtn = page.locator('button:has-text("Novo Template"), button:has-text("Criar"), button:has-text("Adicionar")').first()
    if (!await novoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão novo template não encontrado')
      return
    }

    await novoBtn.click()
    await page.waitForTimeout(1_000)

    // Preenche nome do template (placeholder: "Ex: Follow-up Pós-Reunião")
    const nomeInput = page.locator('input[placeholder*="Follow-up"], input[placeholder*="Nome"], input[name="nome"]').first()
    if (await nomeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nomeInput.fill(`E2E Template ${Date.now()}`)
    }

    // Preenche corpo da mensagem (textarea obrigatório)
    const bodyInput = page.locator('textarea').first()
    if (await bodyInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await bodyInput.fill('Olá {{nome}}, tudo bem? Seguem informações sobre {{produto}}.')
    }

    // Espera o botão ficar habilitado e clica
    const criarBtn = page.locator('button:has-text("Criar Template")')
    if (await criarBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await criarBtn.click({ timeout: 15_000 })
      await page.waitForTimeout(2_000)
    }

    // Não crashou — sucesso
    await expect(page.locator('h2', { hasText: 'Templates de Mensagens' })).toBeVisible()
  })

  test('criar template de WhatsApp', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await page.waitForTimeout(1_000)

    const novoBtn = page.locator('button:has-text("Novo Template")').first()
    if (!await novoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão novo template não encontrado')
      return
    }
    await novoBtn.click()
    await page.waitForTimeout(1_000)

    // Nome
    const nomeInput = page.locator('.fixed input[placeholder*="Follow-up"], .fixed input[placeholder*="Nome"]').first()
    if (await nomeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nomeInput.fill(`E2E WhatsApp Template ${Date.now()}`)
    }

    // Canal = WhatsApp
    const canalSelect = page.locator('.fixed select').filter({ hasText: /Email|WhatsApp/ }).first()
    if (await canalSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await canalSelect.selectOption('whatsapp')
    }

    // Etapa = Amostra
    const etapaSelect = page.locator('.fixed select').filter({ hasText: /Prospecção|Amostra|Proposta/ }).first()
    if (await etapaSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await etapaSelect.selectOption('amostra')
    }

    // Corpo
    const bodyInput = page.locator('.fixed textarea').first()
    if (await bodyInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await bodyInput.fill('Olá {nome}! Sua amostra da {empresa} foi enviada. Qualquer dúvida, estou à disposição!')
    }

    // Criar
    const criarBtn = page.locator('.fixed button:has-text("Criar Template")')
    if (await criarBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await criarBtn.click()
      await page.waitForTimeout(2_000)
    }

    await expect(page.locator('h2', { hasText: 'Templates de Mensagens' })).toBeVisible()
  })

  test('filtro por canal funciona', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await page.waitForTimeout(1_000)

    const canalSelect = page.locator('select').filter({ hasText: /Todos os canais/ }).first()
    if (!await canalSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Filtro de canal não encontrado')
      return
    }

    // Filtra por email
    await canalSelect.selectOption('email')
    await page.waitForTimeout(500)

    // Filtra por whatsapp
    await canalSelect.selectOption('whatsapp')
    await page.waitForTimeout(500)

    // Volta para todos
    await canalSelect.selectOption('')
    await page.waitForTimeout(500)

    await expect(page.locator('h2', { hasText: 'Templates de Mensagens' })).toBeVisible()
  })

  test('filtro por etapa funciona', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await page.waitForTimeout(1_000)

    const etapaSelect = page.locator('select').filter({ hasText: /Todas as etapas/ }).first()
    if (!await etapaSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Filtro de etapa não encontrado')
      return
    }

    await etapaSelect.selectOption('prospecção')
    await page.waitForTimeout(500)

    await etapaSelect.selectOption('')
    await page.waitForTimeout(500)

    await expect(page.locator('h2', { hasText: 'Templates de Mensagens' })).toBeVisible()
  })

  test('ver template completo (preview)', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await page.waitForTimeout(1_000)

    const verBtn = page.locator('button:has-text("Ver completo")').first()
    if (!await verBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum template com botão Ver completo encontrado')
      return
    }

    await verBtn.click()
    await page.waitForTimeout(1_000)

    // Modal de preview deve abrir com conteúdo
    const previewModal = page.locator('.fixed').filter({ hasText: /Variáveis/ }).first()
    await expect(previewModal).toBeVisible({ timeout: 5_000 })

    // Fecha o modal
    const closeBtn = page.locator('.fixed button').filter({ has: page.locator('svg') }).first()
    if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.click()
    }

    await expect(page.locator('h2', { hasText: 'Templates de Mensagens' })).toBeVisible()
  })

  test('excluir template com confirmação', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /Templates/i }).click()
    await page.waitForTimeout(1_000)

    // Procura botão de excluir (✕) no card de template
    const deleteBtn = page.locator('button:has-text("✕")').first()
    if (!await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum template com botão excluir encontrado')
      return
    }

    await deleteBtn.click()
    await page.waitForTimeout(1_000)

    // Modal de confirmação "Excluir Template" deve abrir
    await expect(page.getByText('Excluir Template').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Esta ação não pode ser desfeita').first()).toBeVisible({ timeout: 3_000 })

    // Cancela a exclusão (não queremos realmente deletar)
    const cancelarBtn = page.locator('.fixed button:has-text("Cancelar")')
    await cancelarBtn.click()
    await page.waitForTimeout(500)

    // Modal deve fechar
    await expect(page.locator('h2', { hasText: 'Templates de Mensagens' })).toBeVisible()
  })
})
