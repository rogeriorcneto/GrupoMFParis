import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'

async function clickSidebarItem(page: any, label: string) {
  await page.evaluate((text: string) => {
    const spans = Array.from(document.querySelectorAll('button span'))
    const span = spans.find(s => s.textContent?.trim() === text)
    const btn = span?.closest('button') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text)
    if (btn) (btn as HTMLButtonElement).click()
  }, label)
  await page.waitForTimeout(2000)
}

function gerarCnpj() {
  const rand = () => Math.floor(Math.random() * 10)
  const base = Array.from({ length: 8 }, rand)
  base.push(0, 0, 0, 1)
  const d = (arr: number[], weights: number[]) => {
    const s = arr.reduce((acc, n, i) => acc + n * weights[i], 0) % 11
    return s < 2 ? 0 : 11 - s
  }
  const d1 = d(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = d([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const digits = [...base, d1, d2].join('')
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
}

// Move o card para a etapa alvo usando o menu ⇄ do card (visivel em viewport mobile)
async function moverCardPara(page: any, chaveCliente: string, etapaDestino: string) {
  // garante viewport mobile para exibir o botao ⇄ (md:hidden)
  await page.setViewportSize({ width: 390, height: 844 })

  // acha o card pelo trecho unico do nome (timestamp)
  const card = page.locator(`h4:has-text("${chaveCliente}")`).first()
  await card.scrollIntoViewIfNeeded()

  // abre o menu de mover
  const cardRoot = card.locator('xpath=ancestor::div[contains(@class,"relative")][1]')
  await cardRoot.locator('button[title="Mover de etapa"]').click()
  await page.waitForTimeout(500)

  // clica na etapa destino
  await page.locator(`button:has-text("${etapaDestino}")`).first().click()
  await page.waitForTimeout(1000)
}

test('UI: criar cliente CNPJ -> funil completo -> pedido -> aprovar -> Omie', async ({ page }) => {
  test.setTimeout(300_000)
  const CNPJ_TESTE = gerarCnpj()
  const nomeCliente = `Empresa Teste UI ${Date.now()}`
  // chave unica do cliente (timestamp) — usada para localizar card/pedido sem
  // confundir com registros de testes anteriores
  const chave = nomeCliente.split(' ').pop()!

  // ─── 1. LOGIN ───
  await loginAs(page, 'gerente')
  await page.locator('text=CRM MF Paris').first().click()
  await page.waitForTimeout(3000)

  // ─── 2. CRIAR CLIENTE CNPJ (UI) ───
  console.log('[UI] Criando cliente CNPJ:', CNPJ_TESTE)
  await clickSidebarItem(page, 'Clientes')
  await page.locator('button:has-text("Novo Cliente")').first().click()
  await page.waitForTimeout(1500)

  await page.fill('input[name="cnpj"]', CNPJ_TESTE)
  await page.fill('input[name="razaoSocial"]', nomeCliente)
  await page.fill('input[name="nomeFantasia"]', nomeCliente)
  await page.selectOption('select[name="vendedorId"]', { label: /Rafael/i }).catch(() => {})

  // campos obrigatorios (telefone e endereco)
  const fill = async (name: string, value: string) => {
    const el = page.locator(`input[name="${name}"], textarea[name="${name}"]`)
    if (await el.count() > 0) await el.first().fill(value).catch(() => {})
  }
  await fill('contatoTelefone', '11999999999')
  await fill('enderecoRua', 'Rua Teste')
  await fill('enderecoNumero', '123')
  await fill('enderecoBairro', 'Centro')
  await fill('enderecoCidade', 'Sao Paulo')
  await fill('enderecoEstado', 'SP')
  await fill('enderecoCep', '01001000')
  await fill('contatoNome', 'Teste Devin')

  await page.screenshot({ path: 'e2e/screenshots/flow-04-form.png', fullPage: true })
  await page.locator('button:has-text("Salvar Cliente")').first().click()
  await page.waitForTimeout(4000)

  // modal nao fecha sozinho apos salvar — fechar pelo botao Cancelar (ou X)
  for (let i = 0; i < 5; i++) {
    const modalAberto = await page.locator('h2:has-text("Novo Cliente")').first().isVisible().catch(() => false)
    if (!modalAberto) break
    await page.locator('button:has-text("Cancelar")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)
  }
  const modalAindaAberto = await page.locator('h2:has-text("Novo Cliente")').first().isVisible().catch(() => false)
  console.log('[UI] Cliente salvo, modal fechado:', !modalAindaAberto)

  // ─── 3. FUNIL — mover prospecção -> proposta -> negociacao ───
  await clickSidebarItem(page, 'Funil Comercial')
  await page.screenshot({ path: 'e2e/screenshots/flow-06-funil.png', fullPage: true })

  const cardVisivel = await page.locator(`h4:has-text("${chave}")`).first().isVisible({ timeout: 10_000 }).catch(() => false)
  console.log('[UI] Card no funil:', cardVisivel)

  // prospecção -> proposta
  await moverCardPara(page, chave, 'Proposta')
  console.log('[UI] Movido para Proposta')
  await page.screenshot({ path: 'e2e/screenshots/flow-07-proposta.png', fullPage: true })

  // proposta -> negociacao (abre modal de valor)
  await moverCardPara(page, chave, 'Negociação')
  await page.waitForTimeout(1000)
  const modalProposta = page.locator('input[type="number"], input[inputmode="decimal"]').first()
  if (await modalProposta.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await modalProposta.fill('150')
    await page.screenshot({ path: 'e2e/screenshots/flow-08-modal-proposta.png', fullPage: true })
    await page.locator('button:has-text("Confirmar"), button:has-text("Gerar"), button:has-text("Salvar")').first().click()
    await page.waitForTimeout(1500)
  }
  console.log('[UI] Movido para Negociacao')
  await page.screenshot({ path: 'e2e/screenshots/flow-09-negociacao.png', fullPage: true })

  // ─── 4. CRIAR PEDIDO (UI) ───
  await page.setViewportSize({ width: 1440, height: 900 })
  await clickSidebarItem(page, 'Pedidos')
  await page.screenshot({ path: 'e2e/screenshots/flow-10-pedidos.png', fullPage: true })

  // buscar e selecionar cliente pela chave unica (timestamp)
  const clienteSearch = page.locator('input[placeholder*="Buscar cliente"]').first()
  await clienteSearch.click()
  await clienteSearch.fill(chave)
  await page.waitForTimeout(1500)
  await page.locator(`button:has-text("${chave}")`).first().click()
  await page.waitForTimeout(800)

  // tipo Venda + frete CIF + pagamento 30/60 (parcelas)
  await page.locator('button:has-text("Venda")').first().click().catch(() => {})
  await page.locator('button:has-text("CIF")').first().click().catch(() => {})
  await page.locator('select').filter({ has: page.locator('option:has-text("À vista")') }).first()
    .selectOption({ label: '30/60' }).catch(async () => {
      await page.locator('select').nth(0).selectOption('30/60').catch(() => {})
    })
  await page.screenshot({ path: 'e2e/screenshots/flow-11-cliente-sel.png', fullPage: true })

  // buscar produto e adicionar
  const buscaProduto = page.locator('input[placeholder="Buscar..."]').first()
  await buscaProduto.fill('PERMEADO')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e/screenshots/flow-12-busca.png', fullPage: true })
  const addBtn = page.locator('button:has-text("Adicionar")').first()
  if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await addBtn.click()
    await page.waitForTimeout(800)
    // campo de quantidade aparece na linha do produto — define 50 kg (2 sacos de 25)
    const qtdInput = page.locator('input[type="number"][min="0.01"]').first()
    if (await qtdInput.isVisible().catch(() => false)) {
      await qtdInput.fill('50')
      await page.waitForTimeout(500)
    }
  } else {
    console.log('[UI] Nenhum produto "PERMEADO" — tentando primeiro produto disponivel')
    await buscaProduto.fill('LEITE')
    await page.waitForTimeout(1200)
    await page.locator('button:has-text("Adicionar")').first().click()
    await page.waitForTimeout(800)
  }
  await page.screenshot({ path: 'e2e/screenshots/flow-13-item.png', fullPage: true })

  // preco unitario no carrinho (vendedor define)
  const precoInput = page.locator('input[type="number"][min="0"][step="0.01"]').last()
  if (await precoInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await precoInput.click()
    await precoInput.fill('2.00')
    await page.waitForTimeout(500)
  }

  // observacoes obrigatorias
  await page.locator('textarea[placeholder*="Condicoes"], textarea').last().fill('Pedido de teste E2E - validacao peso/parcelas Omie')
  await page.screenshot({ path: 'e2e/screenshots/flow-14-carrinho.png', fullPage: true })

  // enviar para aprovacao
  const enviarBtn = page.locator('button:has-text("Enviar")').first()
  await enviarBtn.scrollIntoViewIfNeeded()
  await enviarBtn.click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'e2e/screenshots/flow-15-enviado.png', fullPage: true })
  console.log('[UI] Pedido enviado para aprovacao')

  // fecha modal "Pedido Enviado!" se aberto
  const modalEnviado = page.locator('text=Pedido Enviado').first()
  if (await modalEnviado.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.locator('button:has-text("Histórico"), button:has-text("Historico"), button:has-text("OK"), button:has-text("Fechar")').first().click().catch(() => {})
    await page.waitForTimeout(800)
  }

  // ─── 5. APROVACAO — Tabela B + Aprovar ───
  await clickSidebarItem(page, 'Aprovação de Pedidos')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/screenshots/flow-16-aprovacao.png', fullPage: true })

  // encontra o card do pedido do cliente de teste e age dentro dele
  const cardPedido = page.locator('div.bg-white.rounded-apple, div.bg-white.rounded-xl', { hasText: chave }).last()
  const cardPedidoOk = await cardPedido.isVisible({ timeout: 8_000 }).catch(() => false)
  console.log('[UI] Card do pedido na aprovacao:', cardPedidoOk)

  const scope = cardPedidoOk ? cardPedido : page

  const tabB = scope.locator('button[title*="tabela B"], button:has-text("Tabela B")').first()
  if (await tabB.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await tabB.click()
    await page.waitForTimeout(500)
    console.log('[UI] Tabela B selecionada')
  }
  await page.screenshot({ path: 'e2e/screenshots/flow-17-tabelaB.png', fullPage: true })

  const aprovarBtn = scope.locator('button:has-text("Aprovar Pedido")').first()
  await aprovarBtn.click()
  // aprovacao dispara envio ao Omie — aguarda processamento
  await page.waitForTimeout(15_000)
  await page.screenshot({ path: 'e2e/screenshots/flow-18-aprovado.png', fullPage: true })
  console.log('[UI] Pedido aprovado — checar Omie via backend')
})
