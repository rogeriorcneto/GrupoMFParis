import { test, expect } from '@playwright/test'
import { loginAs, logout, credentials } from './fixtures/auth.fixture'

test.describe('Login', () => {
  test('exibe tela de login quando não autenticado', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Entrar no sistema')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByPlaceholder('seu@email.com')).toBeVisible()
    await expect(page.getByPlaceholder('Digite sua senha')).toBeVisible()
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
  })

  test('mostra branding MF Paris na tela de login', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Grupo MF Paris')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('CRM de Vendas')).toBeVisible()
  })

  test('login com credenciais corretas navega para o app', async ({ page }) => {
    await loginAs(page, 'gerente')

    // Sidebar visível com nome do usuário
    await expect(page.getByText('Grupo MF Paris')).toBeVisible()
    // Deve mostrar a view padrão (dashboard para gerente)
    await expect(page.getByText('Visão Geral')).toBeVisible()
  })

  test('login com credenciais erradas mostra erro', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=Entrar no sistema', { timeout: 15_000 })

    await page.fill('input[placeholder="seu@email.com"]', 'naoexiste@teste.com')
    await page.fill('input[placeholder="Digite sua senha"]', 'senhaerrada')
    await page.click('button:has-text("Entrar")')

    // Deve exibir mensagem de erro
    await expect(page.getByText(/inválidos|erro|falha/i)).toBeVisible({ timeout: 10_000 })

    // Deve continuar na tela de login
    await expect(page.getByText('Entrar no sistema')).toBeVisible()
  })

  test('sessão persistida após reload', async ({ page }) => {
    await loginAs(page, 'gerente')

    // Espera o app estar completamente carregado
    await expect(page.getByText('Visão Geral')).toBeVisible()

    // Recarrega a página
    await page.reload()

    // Deve re-autenticar automaticamente sem mostrar login
    await page.waitForSelector('text=Entrar no sistema', { state: 'detached', timeout: 20_000 }).catch(() => {
      // Se nunca apareceu, significa que logou direto — ok
    })

    // Deve estar logado
    await expect(page.getByText('Visão Geral')).toBeVisible({ timeout: 20_000 })
  })

  test('logout retorna para tela de login', async ({ page }) => {
    await loginAs(page, 'gerente')
    await logout(page)

    await expect(page.getByText('Entrar no sistema')).toBeVisible()
  })

  test('Enter no campo senha faz submit', async ({ page }) => {
    const cred = credentials.gerente
    if (!cred.senha) test.skip()

    await page.goto('/')
    await page.waitForSelector('text=Entrar no sistema', { timeout: 15_000 })

    await page.fill('input[placeholder="seu@email.com"]', cred.email)
    await page.fill('input[placeholder="Digite sua senha"]', cred.senha)

    // Press Enter no campo de senha
    await page.press('input[placeholder="Digite sua senha"]', 'Enter')

    // Deve logar
    await page.waitForSelector('text=Entrar no sistema', { state: 'detached', timeout: 15_000 })
    await expect(page.getByText('Grupo MF Paris')).toBeVisible()
  })
})
