import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────
// KV simulado da tabela whatsapp_session
const kvStore = new Map<string, any>()
const insertedNotif: any[] = []
let clienteRow: any = { id: 10, razao_social: 'PADARIA TESTE', whatsapp: '5531999887766', whatsapp_jid: '5531999887766@s.whatsapp.net' }
let clienteComVendedor: any = { vendedor_id: 7, razao_social: 'PADARIA TESTE' }

const mockFrom = vi.fn((table: string) => {
  if (table === 'whatsapp_session') {
    return {
      upsert: vi.fn(async (row: any) => { kvStore.set(row.key, row.value); return { error: null } }),
      select: vi.fn(() => ({
        eq: vi.fn((_c: string, key: string) => ({
          maybeSingle: vi.fn(async () => ({
            data: kvStore.has(key) ? { value: kvStore.get(key) } : null,
            error: null,
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn((_c: string, key: string) => { kvStore.delete(key); return Promise.resolve({ error: null }) }),
      })),
    }
  }
  if (table === 'clientes') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: clienteRow, error: null })),
        })),
      })),
    }
  }
  if (table === 'notificacoes') {
    return { insert: vi.fn(async (row: any) => { insertedNotif.push(row); return { error: null } }) }
  }
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })) })) }
})

vi.mock('../supabase.js', () => ({ supabase: { from: (t: string) => mockFrom(t) } }))

const ocorrencias: any[] = []
vi.mock('../ocorrencias.js', () => ({
  addOcorrencia: vi.fn(async (pedidoId: number, oc: any) => { ocorrencias.push({ pedidoId, ...oc }); return {} }),
}))

const sacSent: { to: string; text: string }[] = []
let sacConnected = true
vi.mock('../whatsapp-sac.js', () => ({
  sendSacText: vi.fn(async (to: string, text: string) => {
    if (!sacConnected) return false
    sacSent.push({ to, text })
    return true
  }),
}))

import { enviarPesquisaSac, registrarNotaSac, getSacConfig, setSacConfig } from '../sac.js'

beforeEach(() => {
  kvStore.clear()
  sacSent.length = 0
  ocorrencias.length = 0
  insertedNotif.length = 0
  sacConnected = true
  clienteRow = { id: 10, razao_social: 'PADARIA TESTE', whatsapp: '5531999887766', whatsapp_jid: '5531999887766@s.whatsapp.net' }
  vi.clearAllMocks()
})

async function ativarSac() {
  await setSacConfig({ ativo: true, template: 'Olá {nome}! Pedido {pedido} entregue. Nota de 1 a 5?' })
}

// ─── Config ──────────────────────────────────────────────────
describe('SAC config', () => {
  it('retorna config padrão (inativo) quando nada salvo', async () => {
    const cfg = await getSacConfig()
    expect(cfg.ativo).toBe(false)
    expect(cfg.template).toContain('{nome}')
  })

  it('persiste e valida config', async () => {
    await setSacConfig({ ativo: true, template: 'Oi {nome}' })
    expect((await getSacConfig()).template).toBe('Oi {nome}')
    await expect(setSacConfig({ ativo: true, template: '' })).rejects.toThrow()
  })
})

// ─── Disparo na entrega ──────────────────────────────────────
describe('enviarPesquisaSac', () => {
  it('não envia quando SAC inativo', async () => {
    await enviarPesquisaSac(1, 10, 'PED-1')
    expect(sacSent).toHaveLength(0)
  })

  it('envia template renderizado e marca pedido como enviado', async () => {
    await ativarSac()
    await enviarPesquisaSac(42, 10, 'PED-42')
    expect(sacSent).toHaveLength(1)
    expect(sacSent[0].to).toBe('5531999887766')
    expect(sacSent[0].text).toContain('PADARIA TESTE')
    expect(sacSent[0].text).toContain('PED-42')
    expect(kvStore.has('sac_sent:42')).toBe(true)
    expect(kvStore.has('sac_pending:5531999887766')).toBe(true)
  })

  it('não reenvia para o mesmo pedido (anti-dupe)', async () => {
    await ativarSac()
    await enviarPesquisaSac(42, 10, 'PED-42')
    await enviarPesquisaSac(42, 10, 'PED-42')
    expect(sacSent).toHaveLength(1)
  })

  it('não envia nem marca como enviado se WhatsApp SAC desconectado', async () => {
    await ativarSac()
    sacConnected = false
    await enviarPesquisaSac(43, 10, 'PED-43')
    expect(sacSent).toHaveLength(0)
    expect(kvStore.has('sac_sent:43')).toBe(false)
  })

  it('pula cliente sem WhatsApp válido', async () => {
    await ativarSac()
    clienteRow = { id: 11, razao_social: 'SEM FONE', whatsapp: null, whatsapp_jid: null }
    await enviarPesquisaSac(44, 11, 'PED-44')
    expect(sacSent).toHaveLength(0)
  })
})

// ─── Resposta com nota ───────────────────────────────────────
describe('registrarNotaSac', () => {
  const replies: { to: string; text: string }[] = []
  const reply = async (to: string, text: string) => { replies.push({ to, text }); return true }

  beforeEach(async () => {
    replies.length = 0
    await ativarSac()
    await enviarPesquisaSac(42, 10, 'PED-42') // cria pendente para 5531999887766
  })

  it('registra nota 1-5 como ocorrência e agradece', async () => {
    await registrarNotaSac('5531999887766', '5', reply)
    expect(ocorrencias).toHaveLength(1)
    expect(ocorrencias[0].pedidoId).toBe(42)
    expect(ocorrencias[0].descricao).toContain('nota 5/5')
    expect(replies).toHaveLength(1)
    expect(kvStore.has('sac_pending:5531999887766')).toBe(false)
  })

  it('aceita nota com comentário ("4 entrega ok")', async () => {
    await registrarNotaSac('5531999887766', '4 entrega ok', reply)
    expect(ocorrencias[0].descricao).toContain('nota 4/5')
    expect(ocorrencias[0].descricao).toContain('entrega ok')
  })

  it('ignora texto sem nota', async () => {
    await registrarNotaSac('5531999887766', 'oi tudo bem?', reply)
    expect(ocorrencias).toHaveLength(0)
    expect(kvStore.has('sac_pending:5531999887766')).toBe(true) // pendente continua
  })

  it('ignora número sem pesquisa pendente', async () => {
    await registrarNotaSac('5511000000000', '5', reply)
    expect(ocorrencias).toHaveLength(0)
  })

  it('nota baixa (<=2) gera notificação para o gerente/vendedor', async () => {
    await registrarNotaSac('5531999887766', '1', reply)
    expect(insertedNotif).toHaveLength(1)
    expect(insertedNotif[0].mensagem).toContain('nota 1/5')
  })

  it('pendente expirado é descartado', async () => {
    const p = JSON.parse(kvStore.get('sac_pending:5531999887766'))
    p.expiresAt = Date.now() - 1000
    kvStore.set('sac_pending:5531999887766', JSON.stringify(p))
    await registrarNotaSac('5531999887766', '5', reply)
    expect(ocorrencias).toHaveLength(0)
    expect(kvStore.has('sac_pending:5531999887766')).toBe(false)
  })
})
