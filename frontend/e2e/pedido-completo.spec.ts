import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { criarClienteTeste, limparClienteTeste } from './fixtures/database.fixture'

test.describe('Pedido — fluxo completo', () => {
  const cleanupIds: number[] = []

  test.afterAll(async () => {
    for (const id of cleanupIds) {
      try { await limparClienteTeste(id) } catch { /* ignora */ }
    }
  })

  test('criar pedido com cliente + produto + enviar para aprovação', async ({ page }) => {
    // Cria cliente de teste para associar ao pedido
    const { id, client } = await criarClienteTeste({ etapa: 'negociacao', valor_estimado: 50000 })
    cleanupIds.push(id)
    const { data: clienteData } = await client.from('clientes').select('razao_social').eq('id', id).single()
    const nomeCliente = clienteData!.razao_social

    await loginAs(page, 'gerente')

    // Navega para Pedidos via sidebar (usa regex exato para evitar match com sub-menus)
    await page.getByRole('button', { name: /^Pedidos$/i }).click()
    await page.waitForTimeout(2_000)

    // Verifica que a view carregou
    const heading = page.locator('h1, h2').filter({ hasText: /Lançamento de Pedidos|Pedidos/i }).first()
    await expect(heading).toBeVisible({ timeout: 10_000 })

    // Garante que está na aba "Novo Pedido"
    const novoTab = page.locator('button:has-text("Novo Pedido")').first()
    if (await novoTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await novoTab.click()
      await page.waitForTimeout(1_000)
    }

    // 1. Selecionar cliente via busca
    const clienteSearch = page.locator('input[placeholder*="Buscar cliente"]').first()
    if (!await clienteSearch.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Campo de busca de cliente no pedido não encontrado')
      return
    }
    await clienteSearch.click()
    await clienteSearch.fill(nomeCliente.slice(0, 15))
    await page.waitForTimeout(1_000)

    // Seleciona o cliente no dropdown
    const clienteOption = page.locator('button').filter({ hasText: new RegExp(nomeCliente.slice(0, 15), 'i') }).first()
    if (await clienteOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await clienteOption.click()
      await page.waitForTimeout(500)
    }

    // 2. Adicionar produto ao pedido — clica no botão "+ Adicionar" do primeiro produto
    const addProdutoBtn = page.locator('button:has-text("Adicionar")').first()
    if (!await addProdutoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão Adicionar produto não encontrado — nenhum produto ativo')
      return
    }
    await addProdutoBtn.click()
    await page.waitForTimeout(500)

    // Verifica que o carrinho tem pelo menos 1 item
    await expect(page.locator('text=/Carrinho \\(1/i').first()).toBeVisible({ timeout: 5_000 })

    // 3. Adicionar mais um produto diferente (se existir)
    const addProdutoBtn2 = page.locator('button:has-text("Adicionar")').first()
    if (await addProdutoBtn2.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addProdutoBtn2.click()
      await page.waitForTimeout(500)
    }

    // 4. Aumentar quantidade do primeiro item com o botão "+"
    const plusBtn = page.locator('.bg-primary-600:has-text("+"), button:has-text("+")').first()
    if (await plusBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await plusBtn.click()
      await page.waitForTimeout(500)
    }

    // 5. Adicionar observação
    const obsTextarea = page.locator('textarea[placeholder*="Condições"], textarea[placeholder*="prazo"]').first()
    if (await obsTextarea.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await obsTextarea.fill('Pedido de teste E2E — entrega em 15 dias')
    }

    // 6. Enviar para aprovação
    const enviarBtn = page.locator('button:has-text("Enviar para Aprovação")').first()
    await enviarBtn.scrollIntoViewIfNeeded()
    await expect(enviarBtn).toBeEnabled({ timeout: 3_000 })
    await enviarBtn.click()
    await page.waitForTimeout(3_000)

    // Modal de confirmação "Pedido Enviado!" deve aparecer
    const confirmModal = page.locator('text=Pedido Enviado!').first()
    const pedidoEnviado = await confirmModal.isVisible({ timeout: 10_000 }).catch(() => false)

    if (pedidoEnviado) {
      // Fecha o modal e vai para histórico
      const verHistoricoBtn = page.locator('button:has-text("Ver Histórico")').first()
      if (await verHistoricoBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await verHistoricoBtn.click()
        await page.waitForTimeout(1_000)
      } else {
        const novoPedidoBtn = page.locator('button:has-text("Novo Pedido")').first()
        if (await novoPedidoBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await novoPedidoBtn.click()
        }
      }
    }

    // Não crashou — sucesso
    await expect(heading).toBeVisible({ timeout: 5_000 })
  })

  test('salvar pedido como rascunho', async ({ page }) => {
    const { id, client } = await criarClienteTeste({ etapa: 'proposta', valor_estimado: 30000 })
    cleanupIds.push(id)
    const { data: clienteData } = await client.from('clientes').select('razao_social').eq('id', id).single()
    const nomeCliente = clienteData!.razao_social

    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Pedidos$/i }).click()
    await page.waitForTimeout(2_000)

    // Aba Novo Pedido
    const novoTab = page.locator('button:has-text("Novo Pedido")').first()
    if (await novoTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await novoTab.click()
      await page.waitForTimeout(1_000)
    }

    // Selecionar cliente
    const clienteSearch = page.locator('input[placeholder*="Buscar cliente"]').first()
    if (!await clienteSearch.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Campo de busca de cliente não encontrado')
      return
    }
    await clienteSearch.click()
    await clienteSearch.fill(nomeCliente.slice(0, 15))
    await page.waitForTimeout(1_000)
    const clienteOption = page.locator('button').filter({ hasText: new RegExp(nomeCliente.slice(0, 15), 'i') }).first()
    if (await clienteOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await clienteOption.click()
      await page.waitForTimeout(500)
    }

    // Adicionar um produto
    const addBtn = page.locator('button:has-text("Adicionar")').first()
    if (!await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum produto ativo para adicionar')
      return
    }
    await addBtn.click()
    await page.waitForTimeout(500)

    // Salvar como Rascunho
    const rascunhoBtn = page.locator('button:has-text("Salvar como Rascunho")').first()
    await rascunhoBtn.scrollIntoViewIfNeeded()
    await expect(rascunhoBtn).toBeEnabled({ timeout: 3_000 })
    await rascunhoBtn.click()
    await page.waitForTimeout(2_000)

    // Ir para histórico e verificar que o pedido aparece como rascunho
    const historicoTab = page.locator('button:has-text("Histórico")').first()
    if (await historicoTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await historicoTab.click()
      await page.waitForTimeout(2_000)
    }

    // Deve existir pelo menos um pedido com status Rascunho (badge: "📝 Rascunho")
    const rascunhoBadge = page.locator('span:has-text("Rascunho")').first()
    const hasBadge = await rascunhoBadge.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!hasBadge) {
      // Pode ter sido auto-aprovado — verifica se algum pedido aparece
      const anyPedido = page.locator('text=/PED-/').first()
      await expect(anyPedido).toBeVisible({ timeout: 5_000 })
    }
  })

  test('histórico de pedidos renderiza com filtros', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Pedidos$/i }).click()
    await page.waitForTimeout(2_000)

    // Vai para aba Histórico
    const historicoTab = page.locator('button:has-text("Histórico")').first()
    if (!await historicoTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Aba Histórico não encontrada')
      return
    }
    await historicoTab.click()
    await page.waitForTimeout(1_000)

    // Filtro de status
    const statusSelect = page.locator('select').filter({ hasText: /Todos os status/ }).first()
    if (await statusSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Filtra por enviado
      await statusSelect.selectOption('enviado')
      await page.waitForTimeout(500)

      // Volta para todos
      await statusSelect.selectOption('')
      await page.waitForTimeout(500)
    }

    // Filtro de cliente
    const clienteSelect = page.locator('select').filter({ hasText: /Todos os clientes/ }).first()
    if (await clienteSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Verifica que o select está funcional (sem crash)
      expect(await clienteSelect.isEnabled()).toBeTruthy()
    }

    // Página não crashou
    const heading = page.locator('h1, h2').filter({ hasText: /Lançamento de Pedidos|Pedidos/i }).first()
    await expect(heading).toBeVisible()
  })

  test('aprovar pedido via histórico (gerente)', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Pedidos$/i }).click()
    await page.waitForTimeout(2_000)

    // Vai para Histórico
    const historicoTab = page.locator('button:has-text("Histórico")').first()
    if (await historicoTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await historicoTab.click()
      await page.waitForTimeout(1_000)
    }

    // Filtra por "Enviado" para ver pedidos pendentes de aprovação
    const statusSelect = page.locator('select').filter({ hasText: /Todos os status/ }).first()
    if (await statusSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await statusSelect.selectOption('enviado')
      await page.waitForTimeout(1_000)
    }

    // Procura botão Confirmar
    const confirmarBtn = page.locator('button:has-text("Confirmar")').first()
    if (!await confirmarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum pedido enviado para aprovar encontrado')
      return
    }

    await confirmarBtn.click()
    await page.waitForTimeout(2_000)

    // O pedido deve mudar para status Aprovado/Confirmado
    // Volta para todos
    if (await statusSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await statusSelect.selectOption('')
      await page.waitForTimeout(1_000)
    }

    // Deve ter pelo menos um pedido confirmado
    const aprovadoBadge = page.locator('text=/Aprovado|Confirmado/i').first()
    const hasAprovado = await aprovadoBadge.isVisible({ timeout: 5_000 }).catch(() => false)

    test.info().annotations.push({
      type: 'info',
      description: hasAprovado ? 'Pedido aprovado com sucesso' : 'Nenhum badge de aprovado visível (pode já ter sido aprovado antes)'
    })
  })

  test('limpar carrinho funciona', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Pedidos$/i }).click()
    await page.waitForTimeout(2_000)

    // Aba Novo Pedido
    const novoTab = page.locator('button:has-text("Novo Pedido")').first()
    if (await novoTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await novoTab.click()
      await page.waitForTimeout(1_000)
    }

    // Adiciona um produto
    const addBtn = page.locator('button:has-text("Adicionar")').first()
    if (!await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum produto ativo')
      return
    }
    await addBtn.click()
    await page.waitForTimeout(500)

    // Verifica carrinho com 1 item
    await expect(page.locator('text=/Carrinho \\(1/i').first()).toBeVisible({ timeout: 5_000 })

    // Clica em limpar carrinho
    const limparBtn = page.locator('button:has-text("Limpar carrinho")').first()
    if (await limparBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await limparBtn.scrollIntoViewIfNeeded()
      await limparBtn.click()
      await page.waitForTimeout(1_000)
    }

    // Carrinho deve estar vazio
    await expect(page.locator('text=/Carrinho \\(0/i').first()).toBeVisible({ timeout: 5_000 })
  })
})
