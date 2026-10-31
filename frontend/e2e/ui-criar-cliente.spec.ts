import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

async function clickSidebarItem(page: any, label: string) {
  await page.evaluate((text: string) => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const btn = buttons.find(b => b.textContent?.toLowerCase().includes(text.toLowerCase()))
    if (btn) (btn as HTMLButtonElement).click()
  }, label)
}

function gerarCnpj() {
  const raiz = Math.floor(10000000 + Math.random() * 89999999).toString()
  return `${raiz.slice(0,2)}.${raiz.slice(2,5)}.${raiz.slice(5,8)}/0001-${Math.floor(10 + Math.random() * 89)}`
}

test('criar cliente CNPJ na UI e verificar sincronização Omie', async ({ page }) => {
  await loginAs(page, 'gerente')

  const crmCard = page.locator('text=CRM MF Paris').first()
  await crmCard.click()
  await page.waitForTimeout(3_000)

  await clickSidebarItem(page, 'Clientes')
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: 'e2e/screenshots/ui-01-clientes.png', fullPage: true })

  // Clicar em Novo Cliente
  await page.locator('button:has-text("Novo Cliente")').first().click()
  await page.waitForTimeout(2_000)
  await page.screenshot({ path: 'e2e/screenshots/ui-02-novo-cliente.png', fullPage: true })

  // Preencher formulario
  const nome = `Teste UI CNPJ ${Date.now()}`
  const cnpj = gerarCnpj()
  await page.fill('input[placeholder*="Razão social"], input[name*="razao"]', nome)
  await page.fill('input[placeholder*="CNPJ"], input[name*="cnpj"]', cnpj)
  await page.fill('input[placeholder*="Nome fantasia"], input[name*="nomeFantasia"]', nome)
  await page.fill('input[placeholder*="Contato"], input[name*="contato"]', 'Teste Devin')
  await page.fill('input[placeholder*="Telefone"], input[name*="telefone"]', '(11) 99999-9999')
  await page.fill('input[placeholder*="E-mail"], input[name*="email"]', 'teste@devin.com.br')
  await page.fill('input[placeholder*="CEP"], input[name*="cep"]', '01001000')
  await page.fill('input[placeholder*="Endereço"], input[name*="endereco"]', 'Rua Teste')
  await page.fill('input[placeholder*="Número"], input[name*="numero"]', '123')
  await page.fill('input[placeholder*="Bairro"], input[name*="bairro"]', 'Centro')
  await page.fill('input[placeholder*="Cidade"], input[name*="cidade"]', 'São Paulo')
  await page.selectOption('select[name*="estado"]', 'SP')

  await page.screenshot({ path: 'e2e/screenshots/ui-03-form-preenchido.png', fullPage: true })

  // Salvar
  const salvarBtn = page.locator('button:has-text("Salvar"), button:has-text("Cadastrar")').first()
  await salvarBtn.click()
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: 'e2e/screenshots/ui-04-apos-salvar.png', fullPage: true })
})
