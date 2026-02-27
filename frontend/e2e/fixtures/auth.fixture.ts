import { test as base, type Page } from '@playwright/test'

/**
 * Credenciais de teste carregadas de .env.e2e
 */
export const credentials = {
  gerente: {
    email: process.env.E2E_GERENTE_EMAIL || 'rafael@mfparis.com.br',
    senha: process.env.E2E_GERENTE_SENHA || '',
  },
  vendedor: {
    email: process.env.E2E_VENDEDOR_EMAIL || 'vendedor.teste@mfparis.com.br',
    senha: process.env.E2E_VENDEDOR_SENHA || '',
  },
  sdr: {
    email: process.env.E2E_SDR_EMAIL || 'sdr.teste@mfparis.com.br',
    senha: process.env.E2E_SDR_SENHA || '',
  },
}

/**
 * Faz login na UI e espera o app carregar.
 */
export async function loginAs(page: Page, cargo: 'gerente' | 'vendedor' | 'sdr') {
  const cred = credentials[cargo]
  if (!cred.senha) throw new Error(`Senha de ${cargo} não configurada em .env.e2e`)

  await page.goto('/')

  // Espera a tela de login aparecer (pode mostrar "Carregando..." antes)
  await page.waitForSelector('text=Entrar no sistema', { timeout: 15_000 })

  // Preenche credenciais
  await page.fill('input[placeholder="seu@email.com"]', cred.email)
  await page.fill('input[placeholder="Digite sua senha"]', cred.senha)

  // Clica em Entrar
  await page.click('button:has-text("Entrar")')

  // Espera o login completar — sidebar com nome do app aparece
  await page.waitForSelector('text=Entrar no sistema', { state: 'detached', timeout: 15_000 })

  // Espera os dados carregarem (loading spinner some)
  await page.waitForSelector('text=Carregando dados...', { state: 'detached', timeout: 30_000 }).catch(() => {
    // Pode já ter terminado o loading antes de chegarmos aqui
  })
}

/**
 * Faz logout clicando em "Sair"
 */
export async function logout(page: Page) {
  await page.click('button:has-text("Sair")')
  await page.waitForSelector('text=Entrar no sistema', { timeout: 10_000 })
}

/**
 * Fixture que já faz login como gerente antes de cada teste.
 */
export const testAsGerente = base.extend({
  page: async ({ page }, use) => {
    await loginAs(page, 'gerente')
    await use(page)
  },
})
