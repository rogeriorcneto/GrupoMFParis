import { test, expect } from '@playwright/test'
import { loginAs, credentials } from './fixtures/auth.fixture'

test('coletar satisfação abre tarefa e salva o resultado sem duplicar card', async ({ page }) => {
  const cliente: Record<string, any> = {
    id: 987654, razao_social: 'Cliente E2E Satisfação Isolado', etapa: 'follow_up',
    vendedor_id: 2, status_follow_up: 'entregue', data_entrada_etapa: '2020-01-01',
    ultima_interacao: '2020-01-01', arquivado_duplicata: false, score: 80,
  }
  let tarefa: Record<string, any> | undefined
  let insercoes = 0
  const resultado = 'Cliente satisfeito com a entrega e qualidade. Nota 5 de 5.'

  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    const tabela = new URL(req.url()).pathname.split('/').pop()
    const metodo = req.method()
    let dados: any = []
    if (tabela === 'vendedores') {
      dados = [{ id: 2, nome: 'Vendedor E2E', email: credentials.gerente.email, cargo: 'vendedor', ativo: true }]
    } else if (tabela === 'clientes') {
      if (metodo === 'PATCH') Object.assign(cliente, req.postDataJSON())
      dados = [cliente]
    } else if (tabela === 'tarefas') {
      if (metodo === 'POST') {
        insercoes++
        tarefa = { ...req.postDataJSON(), id: 987655 }
      }
      if (metodo === 'PATCH') Object.assign(tarefa!, req.postDataJSON())
      dados = tarefa ? [tarefa] : []
    }
    if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) dados = dados[0] || null
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) })
  })

  await loginAs(page, 'gerente')
  await page.getByRole('button', { name: /CRM MF Paris/i }).click()
  await page.getByRole('button', { name: /Funil Comercial/i }).dispatchEvent('click')
  await page.getByRole('button', { name: /Coletar Satisfação/i }).click()
  await expect(page.getByText(`Coletar satisfação — ${cliente.razao_social}`, { exact: true })).toBeVisible()
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  const card = page.locator('.group.relative.rounded-2xl').filter({ hasText: `Coletar satisfação — ${cliente.razao_social}` })
  await expect(card).toHaveCSS('background-color', 'rgb(30, 41, 59)')
  expect(tarefa?.vendedor_id).toBe(2)
  expect(tarefa?.cliente_id).toBe(cliente.id)
  await page.getByRole('button', { name: /Finalizar Tarefa/i }).click()
  await page.getByPlaceholder(/Conclusão de tarefa/).fill(resultado)
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect.poll(() => tarefa?.status).toBe('concluida')
  await expect.poll(() => cliente.feedback_satisfacao).toBe(resultado)
  expect(insercoes).toBe(1)
  expect(cliente.etapa).toBe('follow_up')
  expect(cliente.ultima_interacao).not.toBe('2020-01-01')
})
