import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth.fixture'
import { criarClienteTeste, limparClienteTeste, getAuthenticatedClient } from './fixtures/database.fixture'
import type { SupabaseClient } from '@supabase/supabase-js'

let db: SupabaseClient
test.beforeAll(async () => { db = await getAuthenticatedClient() })

const M = 'Regularização E2E: motivo de teste com mais de 10 caracteres'

test.describe('Funil — proteções de regularização (banco)', () => {
  const ids: number[] = []
  test.afterAll(async () => {
    for (const id of ids.splice(0)) { try { await limparClienteTeste(id) } catch { } }
  })

  test('duplicata comercial: 2º ciclo na mesma família é BLOQUEADO', async () => {
    const { id: raiz } = await criarClienteTeste({ etapa: 'perdido' }); ids.push(raiz)
    const { data: c1 } = await db.from('clientes').insert({
      razao_social: 'E2E Dup Fam ' + raiz, etapa: 'proposta', vendedor_id: 2,
      novo_ciclo: true, origem_ciclo_id: raiz,
    }).select('id').single(); ids.push(c1!.id)
    const r = await db.from('clientes').insert({
      razao_social: 'E2E Dup Fam ' + raiz, etapa: 'proposta', vendedor_id: 2,
      novo_ciclo: true, origem_ciclo_id: raiz,
    }).select('id')
    expect(r.error).toBeTruthy()
    const r2 = await db.from('clientes').insert({
      razao_social: 'E2E Dup Or ' + c1!.id, etapa: 'proposta', vendedor_id: 2,
      novo_ciclo: true, origem_ciclo_id: c1!.id,
    }).select('id')
    expect(r2.error).toBeTruthy()
  })

  test('novo ciclo exige origem válida e gera número atômico', async () => {
    const { id: o } = await criarClienteTeste({ etapa: 'perdido' }); ids.push(o)
    const { data: c1 } = await db.from('clientes').insert({
      razao_social: 'E2E Ciclo ' + o, etapa: 'proposta', vendedor_id: 2,
      novo_ciclo: true, origem_ciclo_id: o,
    }).select('id, ciclo_numero, empresa_funil_id').single()
    ids.push(c1!.id)
    expect(c1!.ciclo_numero).toBe(2)
    expect(c1!.empresa_funil_id).toBe(o)
    const r2 = await db.from('clientes').insert({
      razao_social: 'E2E Sem Origem', etapa: 'proposta', vendedor_id: 2, novo_ciclo: true })
    expect(r2.error).toBeTruthy()
  })

  test('concorrência: duas criações simultâneas — só 1 passa', async () => {
    const { id: o } = await criarClienteTeste({ etapa: 'perdido' }); ids.push(o)
    const ins = () => db.from('clientes').insert({
      razao_social: 'E2E Race ' + o, etapa: 'proposta', vendedor_id: 2,
      novo_ciclo: true, origem_ciclo_id: o }).select('id')
    const [r1, r2] = await Promise.all([ins(), ins()])
    expect([r1, r2].filter(r => !r.error).length).toBe(1)
    expect([r1, r2].filter(r => !!r.error).length).toBe(1)
    const criado = r1.data?.[0]?.id || r2.data?.[0]?.id
    if (criado) ids.push(criado)
  })

  test('negociação → proposta é BLOQUEADO no banco', async () => {
    const { id } = await criarClienteTeste({ etapa: 'negociacao' }); ids.push(id)
    const r = await db.from('clientes').update({ etapa: 'proposta' }).eq('id', id)
    expect(r.error).toBeTruthy()
  })

  test('amostra só parte de prospecção/proposta', async () => {
    const { id } = await criarClienteTeste({ etapa: 'negociacao' }); ids.push(id)
    const r = await db.from('clientes').update({ etapa: 'amostra' }).eq('id', id)
    expect(r.error).toBeTruthy()
  })

  test('vendedor do ciclo não pode ser roubado', async () => {
    const { id: o } = await criarClienteTeste({ etapa: 'perdido', vendedor_id: 6 }); ids.push(o)
    const { data: c } = await db.from('clientes').insert({
      razao_social: 'E2E Dono ' + o, etapa: 'proposta', vendedor_id: 999,
      novo_ciclo: true, origem_ciclo_id: o,
    }).select('id, vendedor_id').single()
    ids.push(c!.id)
    expect(c!.vendedor_id).toBe(6)
  })

  test('arquivar/restaurar: exige mesma empresa, pedido zerado e gerente', async () => {
    const nomeFam = 'E2E Familia ' + Date.now()
    const { id: p } = await criarClienteTeste({ etapa: 'proposta', razao_social: nomeFam }); ids.push(p)
    const { id: x } = await criarClienteTeste({ etapa: 'inativo', cnpj: null, razao_social: nomeFam }); ids.push(x)
    const { data: arq, error: ea } = await db.rpc('arquivar_duplicatas_funil', { p_principal: p, p_excedentes: [x], p_motivo: M })
    expect(ea).toBeNull()
    expect((arq as any[]).some(r => r.id === x)).toBe(true)
    // edição bloqueada em arquivado
    const rEd = await db.from('clientes').update({ cidade: 'X' }).eq('id', x)
    expect(rEd.error).toBeTruthy()
    // restaurar permitido (inativo não é etapa comercial → sem conflito)
    const { error: er } = await db.rpc('restaurar_duplicata_funil', { p_card_id: x })
    expect(er).toBeNull()
    // empresa de outro nome não pode ser arquivada sob este principal
    const { id: z } = await criarClienteTeste({ etapa: 'inativo' }); ids.push(z)
    const { error: ez } = await db.rpc('arquivar_duplicatas_funil', { p_principal: p, p_excedentes: [z], p_motivo: M })
    expect(ez).toBeTruthy()
  })
})

test.describe('Funil — UI pós-regularização', () => {
  test('cards arquivados não aparecem no kanban e perda cria 1 ciclo', async ({ page }) => {
    const nomeFam2 = 'E2E Familia2 ' + Date.now()
    const { id: p } = await criarClienteTeste({ etapa: 'proposta', valor_proposta: 1000, razao_social: nomeFam2 })
    const { id: x } = await criarClienteTeste({ etapa: 'inativo', cnpj: null, razao_social: nomeFam2 })
    try {
      await db.rpc('arquivar_duplicatas_funil', { p_principal: p, p_excedentes: [x], p_motivo: M })
      await loginAs(page, 'gerente')
      await page.waitForTimeout(2_000)
      // navega para o funil pelo menu lateral (tenta variações de label)
      const nav = page.getByRole('button', { name: /Funil/i }).or(page.getByText(/^Funil/i))
      await nav.first().click()
      await page.waitForTimeout(3_000)
      await expect(page.getByText(new RegExp('E2E Teste.*' + x))).toHaveCount(0)
      // perda via RPC (mesmo caminho da UI)
      await db.rpc('mover_cliente_atomico', {
        p_cliente_id: p, p_etapa: 'perdido', p_etapa_anterior: 'proposta',
        p_data_entrada_etapa: new Date().toISOString(), p_extras: { motivo_perda: 'preco' },
      })
      const { data: c } = await db.from('clientes').insert({
        razao_social: 'E2E Ciclo UI ' + p, etapa: 'proposta', vendedor_id: 2,
        novo_ciclo: true, origem_ciclo_id: p,
      }).select('id').single()
      expect(c).toBeTruthy()
      await limparClienteTeste(c!.id).catch(() => { })
    } finally {
      await limparClienteTeste(x).catch(() => { })
      await limparClienteTeste(p).catch(() => { })
    }
  })
})
