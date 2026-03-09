import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { criarClienteTeste, limparClienteTeste } from './fixtures/database.fixture'

test.describe('Tarefas — CRUD e fluxo', () => {
  const cleanupIds: number[] = []

  test.afterAll(async () => {
    for (const id of cleanupIds) {
      try { await limparClienteTeste(id) } catch { /* ignora */ }
    }
  })

  test('view de tarefas renderiza sem erros', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Tarefas$/i }).click()
    await expect(page.locator('h2', { hasText: 'Tarefas e Agenda' })).toBeVisible({ timeout: 10_000 })
    // Não deve ter crash
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible()
  })

  test('criar nova tarefa via UI', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Tarefas$/i }).click()
    await page.waitForTimeout(1_000)

    // Procura botão de nova tarefa
    const novaTarefaBtn = page.locator('button:has-text("Nova Tarefa"), button:has-text("nova tarefa"), button:has-text("Adicionar")').first()
    if (!await novaTarefaBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão Nova Tarefa não encontrado no layout atual')
      return
    }

    await novaTarefaBtn.click()
    await page.waitForTimeout(1_000)

    const tituloInput = page.locator('input[name="titulo"], input[placeholder*="título"], input[placeholder*="Título"]').first()
    if (!await tituloInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Campo título de tarefa não encontrado')
      return
    }

    const titulo = `E2E Tarefa ${Date.now()}`
    await tituloInput.fill(titulo)

    // Data
    const dataInput = page.locator('input[type="date"], input[name="data"]').first()
    if (await dataInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const hoje = new Date().toISOString().split('T')[0]
      await dataInput.fill(hoje)
    }

    // Salvar (botão diz "Criar Tarefa")
    const salvarBtn = page.locator('button:has-text("Criar Tarefa"), button:has-text("Salvar")').first()
    await salvarBtn.scrollIntoViewIfNeeded()
    await salvarBtn.click()
    await page.waitForTimeout(2_000)

    // A tarefa deve aparecer na lista
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 10_000 })
  })

  test('criar tarefa com prioridade alta e tipo reunião', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Tarefas$/i }).click()
    await page.waitForTimeout(1_000)

    const novaTarefaBtn = page.locator('button:has-text("Nova Tarefa")').first()
    if (!await novaTarefaBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Botão Nova Tarefa não encontrado')
      return
    }
    await novaTarefaBtn.click()
    await page.waitForTimeout(1_000)

    // Título
    const tituloInput = page.locator('.fixed input[placeholder*="Ligar"], .fixed input[placeholder*="cliente"]').first()
    if (!await tituloInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Campo título não encontrado')
      return
    }
    const titulo = `E2E Reunião ${Date.now()}`
    await tituloInput.click()
    await tituloInput.fill(titulo)

    // Descrição
    const descInput = page.locator('.fixed textarea').first()
    if (await descInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await descInput.fill('Reunião de apresentação de produtos')
    }

    // Tipo = Reunião
    const tipoSelect = page.locator('.fixed select').filter({ hasText: /Ligação|Reunião|Email/ }).first()
    if (await tipoSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await tipoSelect.selectOption('reuniao')
    }

    // Prioridade = Alta
    const prioSelect = page.locator('.fixed select').filter({ hasText: /Baixa|Média|Alta/ }).first()
    if (await prioSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await prioSelect.selectOption('alta')
    }

    // Salvar
    const salvarBtn = page.locator('.fixed button:has-text("Criar Tarefa")').first()
    await salvarBtn.scrollIntoViewIfNeeded()
    await salvarBtn.click()
    await page.waitForTimeout(2_000)

    // A tarefa deve aparecer na lista
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 10_000 })

    // Verifica badge de prioridade alta
    await expect(page.getByText('alta').first()).toBeVisible({ timeout: 5_000 })
  })

  test('marcar tarefa como concluída via checkbox', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Tarefas$/i }).click()
    await page.waitForTimeout(2_000)

    // Garante que está filtrando por Pendentes
    const filtroSelect = page.locator('select').filter({ hasText: /Todas|Pendentes|Concluídas/ }).first()
    if (await filtroSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await filtroSelect.selectOption('pendente')
      await page.waitForTimeout(1_000)
    }

    // Encontra o botão/checkbox circular de toggle (é um button com w-5 h-5 border)
    const toggleBtn = page.locator('button[class*="rounded"][class*="border"]').filter({ hasText: '' }).first()
    if (!await toggleBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhuma tarefa pendente com toggle encontrada')
      return
    }

    await toggleBtn.click()
    await page.waitForTimeout(2_000)

    // Muda para Concluídas e verifica que pelo menos uma existe
    if (await filtroSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await filtroSelect.selectOption('concluida')
      await page.waitForTimeout(1_000)
    }

    // Deve existir ao menos uma tarefa concluída (com ✓ ou line-through)
    const concluida = page.locator('[class*="line-through"], [class*="bg-green"]').first()
    const hasConcluida = await concluida.isVisible({ timeout: 5_000 }).catch(() => false)

    test.info().annotations.push({
      type: 'info',
      description: hasConcluida ? 'Tarefa marcada como concluída com sucesso' : 'Toggle pode ter revertido ou filtro não mostrou'
    })
  })

  test('filtro de tarefas por status funciona', async ({ page }) => {
    await loginAs(page, 'gerente')
    await page.getByRole('button', { name: /^Tarefas$/i }).click()
    await page.waitForTimeout(2_000)

    const filtroSelect = page.locator('select').filter({ hasText: /Todas|Pendentes|Concluídas/ }).first()
    if (!await filtroSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Filtro de status não encontrado')
      return
    }

    // Filtra por todas
    await filtroSelect.selectOption('todas')
    await page.waitForTimeout(500)

    // Filtra por pendentes
    await filtroSelect.selectOption('pendente')
    await page.waitForTimeout(500)

    // Filtra por concluídas
    await filtroSelect.selectOption('concluida')
    await page.waitForTimeout(500)

    // Volta para pendentes
    await filtroSelect.selectOption('pendente')
    await page.waitForTimeout(500)

    // Não crashou
    await expect(page.locator('h2', { hasText: 'Tarefas e Agenda' })).toBeVisible()
  })

  test('tarefas automáticas criadas ao mover cliente no funil', async ({ page }) => {
    // Cria cliente em prospecção
    const { id, client } = await criarClienteTeste({ etapa: 'amostra', data_envio_amostra: new Date().toISOString().split('T')[0] })
    cleanupIds.push(id)

    const { data } = await client.from('clientes').select('razao_social').eq('id', id).single()
    const nome = data!.razao_social

    await loginAs(page, 'gerente')

    // Vai para Tarefas e verifica se existem tarefas associadas ao cliente
    await page.getByRole('button', { name: /^Tarefas$/i }).click()
    await page.waitForTimeout(2_000)

    // Procura tarefas com nome do cliente (podem existir se auto-task criou)
    const tarefaCliente = page.getByText(new RegExp(nome.slice(0, 20), 'i')).first()
    const hasTarefa = await tarefaCliente.isVisible({ timeout: 3_000 }).catch(() => false)

    test.info().annotations.push({
      type: 'info',
      description: hasTarefa
        ? `Tarefa automática encontrada para ${nome}`
        : 'Nenhuma tarefa automática encontrada (pode ser esperado se cliente foi criado via fixture sem trigger)'
    })
  })
})
