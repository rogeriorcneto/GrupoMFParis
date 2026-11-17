import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

/**
 * E2E — Bloco Prioridade Baixa (Itens 12 e 13), 100% em ambiente isolado (mock REST):
 * - Item 12: No celular, botões flutuantes ficam recolhidos num único dock discreto
 *            e desaparecem quando o painel do cliente abre (não cobrem "Editar" nem o texto).
 * - Item 13: Cards com redes_sociais no formato "Instagram: url" e JSON exibem apenas
 *            links válidos (nunca "instagram.com/instagram:" nem 'https://com.br"}').
 */
test('Bloco Baixa (Itens 12 e 13): dock recolhido no mobile sem cobrir Editar e links sociais limpos', async ({ page }, testInfo) => {
  const hoje = new Date().toISOString().split('T')[0]
  const clientesDb = [
    {
      id: 4001, razao_social: 'SORVETERIA REDES TESTE', nome_fantasia: 'SORV REDES',
      cnpj: '11.222.333/0001-81', etapa: 'proposta', vendedor_id: 2, arquivado_duplicata: false,
      redes_sociais: 'Instagram: https://www.instagram.com/sorvetesoficial/ | Facebook: https://www.facebook.com/sorvetesoficial',
      website: 'https://sorvetesoficial.com.br',
      data_entrada_etapa: hoje, ultima_interacao: hoje,
    },
    {
      id: 4002, razao_social: 'PADARIA JSON REDES', nome_fantasia: 'PAD JSON',
      cnpj: '22.333.444/0001-92', etapa: 'proposta', vendedor_id: 2, arquivado_duplicata: false,
      redes_sociais: JSON.stringify({ instagram: 'https://instagram.com/padariajson', website: 'https://padariajson.com.br' }),
      data_entrada_etapa: hoje, ultima_interacao: hoje,
    },
  ]

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const tabela = url.pathname.split('/').pop()
    let dados: any = []
    if (tabela === 'vendedores') {
      dados = [{ id: 2, nome: 'Eridiane Couto', email: credentials.gerente.email, cargo: 'vendedor', ativo: true }]
    } else if (tabela === 'clientes') {
      dados = clientesDb
    }
    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) {
      dados = Array.isArray(dados) ? (dados[0] ?? null) : dados
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.getByRole('button', { name: /Funil Comercial/i }).dispatchEvent('click')
  await expect(page.locator('text=SORVETERIA REDES TESTE >> visible=true').first()).toBeVisible({ timeout: 15_000 })

  // ── Item 13: Nenhum link quebrado no DOM ("instagram:" ou 'com.br"}')
  const hrefs = await page.locator('a[target="_blank"]').evaluateAll(els => els.map(e => (e as HTMLAnchorElement).href))
  expect(hrefs.some(h => h.includes('instagram:'))).toBe(false)
  expect(hrefs.some(h => h.includes('com.br%22') || h.includes('com.br"}') || /^https?:\/\/com\.br\/?$/i.test(h))).toBe(false)
  expect(hrefs).toContain('https://www.instagram.com/sorvetesoficial/')
  expect(hrefs).toContain('https://sorvetesoficial.com.br/')
  expect(hrefs).toContain('https://padariajson.com.br/')

  // ── Item 12: No mobile, o dock recolhível aparece fechado e SOME ao abrir o card (não cobre o botão Editar!)
  const isMobile = testInfo.project.name === 'mobile-safari'
  if (isMobile) {
    const dockBtn = page.getByRole('button', { name: 'Atalhos rápidos' })
    await expect(dockBtn).toBeVisible()
    // Botão solto "← Portal Grupo Paris" não fica flutuando na tela do celular
    await expect(page.locator('button.fixed:has-text("← Portal Grupo Paris")')).toBeHidden()
  }

  // Abre o painel do cliente e verifica que "Editar" está clicável sem sobreposição
  await page.locator('text=SORVETERIA REDES TESTE >> visible=true').first().click()
  const painel = page.locator('.fixed.inset-0').last()
  const btnEditar = painel.getByRole('button', { name: /Editar/i }).first()
  await expect(btnEditar).toBeVisible({ timeout: 10_000 })
  if (isMobile) {
    await expect(page.getByRole('button', { name: 'Atalhos rápidos' })).toHaveCount(0)
  }
  await btnEditar.click()
})
