import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Estado em memória simulando o banco Supabase para testar todos os fluxos de ponta a ponta
let nextId = 100
const mockDb: Record<string, any[]> = {
  vendedores: [],
  clientes: [],
  missoes: [],
  missao_roteiro_visitas: [],
  missao_despesas: [],
  missao_parametros: [{ id: 1, valor_km: 1.5, valor_diaria: 120, raio_checkin_metros: 300, cidade_base: 'Belo Horizonte - MG' }],
  interacoes: [],
  atividades: [],
  tarefas: [],
}

function createQueryBuilder(table: string) {
  let filters: ((row: any) => boolean)[] = []
  let pendingUpdate: any = null
  let pendingDelete = false
  let pendingInsert: any[] | null = null
  let pendingUpsert: any[] | null = null

  const applyFilters = () => (mockDb[table] || []).filter((r: any) => filters.every(fn => fn(r)))

  const exec = () => {
    if (pendingInsert) {
      const created = pendingInsert.map(item => ({ id: ++nextId, created_at: new Date().toISOString(), ...item }))
      mockDb[table].push(...created)
      return { data: created, error: null }
    }
    if (pendingUpsert) {
      const out: any[] = []
      for (const item of pendingUpsert) {
        const idx = mockDb[table].findIndex((r: any) => r.id === item.id)
        if (idx >= 0) {
          mockDb[table][idx] = { ...mockDb[table][idx], ...item }
          out.push(mockDb[table][idx])
        } else {
          const novo = { id: item.id ?? ++nextId, ...item }
          mockDb[table].push(novo)
          out.push(novo)
        }
      }
      return { data: out, error: null }
    }
    const matched = applyFilters()
    if (pendingDelete) {
      const ids = new Set(matched.map((r: any) => r.id))
      mockDb[table] = mockDb[table].filter((r: any) => !ids.has(r.id))
      return { data: null, error: null }
    }
    if (pendingUpdate) {
      const updated: any[] = []
      for (const r of matched) {
        Object.assign(r, pendingUpdate)
        updated.push({ ...r })
      }
      return { data: updated, error: null }
    }
    return { data: matched.map((r: any) => ({ ...r })), error: null }
  }

  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => { filters.push(r => r[col] === val); return builder },
    neq: (col: string, val: any) => { filters.push(r => r[col] !== val); return builder },
    in: (col: string, vals: any[]) => { filters.push(r => vals.includes(r[col])); return builder },
    not: (col: string, _op: string, val: any) => { filters.push(r => r[col] !== val); return builder },
    or: () => builder,
    order: () => builder,
    limit: () => builder,
    range: (from: number, to: number) => {
      const res = exec()
      return Promise.resolve({ data: (res.data || []).slice(from, to + 1), error: null })
    },
    insert: (rows: any) => {
      pendingInsert = Array.isArray(rows) ? rows : [rows]
      return builder
    },
    upsert: (rows: any) => {
      pendingUpsert = Array.isArray(rows) ? rows : [rows]
      return builder
    },
    update: (patch: any) => {
      pendingUpdate = patch
      return builder
    },
    delete: () => {
      pendingDelete = true
      return builder
    },
    single: () => {
      const res = exec()
      const row = Array.isArray(res.data) ? res.data[0] : res.data
      if (!row) return Promise.resolve({ data: null, error: { message: 'Not found' } })
      if (table === 'missao_roteiro_visitas') {
        const m = mockDb.missoes.find(x => x.id === row.missao_id)
        return Promise.resolve({ data: { ...row, missoes: m }, error: null })
      }
      return Promise.resolve({ data: row, error: null })
    },
    maybeSingle: () => {
      const res = exec()
      const row = Array.isArray(res.data) ? res.data[0] || null : res.data
      return Promise.resolve({ data: row, error: null })
    },
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(exec()).then(onFulfilled, onRejected),
  }
  return builder
}

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (t: string) => createQueryBuilder(t),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'ok' }, error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
      }),
    },
  },
}))

vi.mock('../database.js', () => ({
  getVendedorByAuthId: vi.fn(async (authId: string) => {
    return mockDb.vendedores.find(v => v.auth_id === authId) || null
  }),
}))

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-auth-uid'] || 'uid-vendedor-1'
    const v = mockDb.vendedores.find(x => x.auth_id === req.userId)
    req.vendedor = v || null
    next()
  },
  requireGerente: (req: any, res: any, next: any) => {
    const v = mockDb.vendedores.find(x => x.auth_id === req.userId)
    if (!v || v.cargo !== 'gerente') {
      res.status(403).json({ success: false, error: 'Apenas gestor' })
      return
    }
    next()
  },
}))

import { missoesRouter } from '../routes/missoes.js'

function buildApp() {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use('/api/missoes', missoesRouter)
  return app
}

describe('API /api/missoes — Fluxo completo e Critérios de Aceite', () => {
  beforeEach(() => {
    mockDb.vendedores = [
      { id: 1, auth_id: 'uid-gerente', nome: 'Rogério Gestor', email: 'gerente@mfparis.com.br', cargo: 'gerente', ativo: true },
      { id: 2, auth_id: 'uid-v1', nome: 'Wiliam Vendedor', email: 'wiliam@mfparis.com.br', cargo: 'vendedor', ativo: true },
      { id: 3, auth_id: 'uid-v2', nome: 'Flavia Vendedora', email: 'flavia@mfparis.com.br', cargo: 'vendedor', ativo: true },
    ]
    mockDb.clientes = [
      {
        id: 10,
        razao_social: 'SORVETERIA PORTA LTDA',
        cnpj: '02.687.843/0001-33',
        vendedor_id: 2,
        etapa: 'prospecção',
        latitude: -18.9186,
        longitude: -48.2772,
        ultima_interacao: '2026-10-01',
      },
    ]
    mockDb.missoes = []
    mockDb.missao_roteiro_visitas = []
    mockDb.missao_despesas = []
    mockDb.interacoes = []
    mockDb.atividades = []
    process.env.GEMINI_API_KEY = 'test-gemini-key'
  })

  it('Aceite 1: importa planilha de leads vinculando ao vendedor dono sem duplicar CNPJ já existente no CRM', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/missoes/importar-leads')
      .set('x-auth-uid', 'uid-v1')
      .send({
        leads: [
          { cnpj: '02687843000133', razaoSocial: 'DUPLICADO JA NO CRM' },
          { cnpj: '22.165.179/0017-37', razaoSocial: 'NOVO PROSPECTO UBERLANDIA', enderecoCidade: 'Uberlândia', enderecoEstado: 'MG' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.data.inseridos).toBe(1)
    expect(res.body.data.duplicadosNoCrm).toBe(1)
    expect(mockDb.clientes).toHaveLength(2)
    expect(mockDb.clientes[1].vendedor_id).toBe(2)
    expect(mockDb.clientes[1].etapa).toBe('prospecção')
  })

  it('Aceite 5 + Item 8: vendedor vê apenas as próprias missões e recebe 403 na missão de outro vendedor; gestor vê todas e aprova/recusa com motivo', async () => {
    const app = buildApp()

    // Vendedor 1 cria missão
    const m1 = await request(app)
      .post('/api/missoes')
      .set('x-auth-uid', 'uid-v1')
      .send({ nome: 'Missão Wiliam', dataSaida: '2026-12-01', dataRetorno: '2026-12-02', kmTotal: 200, hospedagemPrevista: 300 })
    expect(m1.status).toBe(200)

    // Vendedor 2 cria missão própria
    const m2 = await request(app)
      .post('/api/missoes')
      .set('x-auth-uid', 'uid-v2')
      .send({ nome: 'Missão Flavia', dataSaida: '2026-12-05', dataRetorno: '2026-12-06' })
    expect(m2.status).toBe(200)

    // Vendedor 1 lista: SÓ aparece a dele, nunca a da Flavia
    const listV1 = await request(app).get('/api/missoes').set('x-auth-uid', 'uid-v1')
    expect(listV1.body.data).toHaveLength(1)
    expect(listV1.body.data[0].nome).toBe('Missão Wiliam')
    // Custo previsto calculado: 200*1.5 (=300) + 120*2 (=240) + 300 = 840
    expect(listV1.body.data[0].custoPrevisto).toBe(840)

    // Vendedor 1 tenta abrir a missão da Flavia direto pelo ID → bloqueado com 403
    const forbid = await request(app).get(`/api/missoes/${m2.body.data.id}`).set('x-auth-uid', 'uid-v1')
    expect(forbid.status).toBe(403)

    // Gestor vê as 2 missões
    const listGer = await request(app).get('/api/missoes').set('x-auth-uid', 'uid-gerente')
    expect(listGer.body.data).toHaveLength(2)

    // Recusa sem motivo falha (400); com motivo funciona
    const recusaSemMotivo = await request(app)
      .post(`/api/missoes/${m1.body.data.id}/aprovar`)
      .set('x-auth-uid', 'uid-gerente')
      .send({ acao: 'recusar', motivo: '' })
    expect(recusaSemMotivo.status).toBe(400)

    const recusaOk = await request(app)
      .post(`/api/missoes/${m1.body.data.id}/aprovar`)
      .set('x-auth-uid', 'uid-gerente')
      .send({ acao: 'recusar', motivo: 'Ajustar roteiro do dia 2' })
    expect(recusaOk.status).toBe(200)
    expect(recusaOk.body.data.status).toBe('reprovada')
    expect(recusaOk.body.data.motivoReprovacao).toBe('Ajustar roteiro do dia 2')
  })

  it('Aceite 3 e 4: check-in na porta (válido) vs a 2 km ("Fora do local") + gravação 10 min virando resumo editável que atualiza último contato ao salvar + privacidade da transcrição', async () => {
    const app = buildApp()

    // Criar missão com 1 visita para cliente #10 (dono: vendedor 2)
    const mRes = await request(app)
      .post('/api/missoes')
      .set('x-auth-uid', 'uid-v1')
      .send({
        nome: 'Viagem Uberlândia',
        dataSaida: '2026-12-01',
        dataRetorno: '2026-12-01',
        visitas: [{ clienteId: 10, diaNumero: 1, ordem: 1 }],
      })
    const missaoId = mRes.body.data.id
    const det = await request(app).get(`/api/missoes/${missaoId}`).set('x-auth-uid', 'uid-v1')
    const visitaId = det.body.data.visitas[0].id

    // 1) Check-in na porta (~30m): válido
    const ckPorta = await request(app)
      .post(`/api/missoes/visitas/${visitaId}/checkin`)
      .set('x-auth-uid', 'uid-v1')
      .send({ lat: -18.9184, lon: -48.2772 })
    expect(ckPorta.status).toBe(200)
    expect(ckPorta.body.data.foraDoLocal).toBe(false)
    expect(ckPorta.body.data.distanciaMetros).toBeLessThanOrEqual(300)

    // 2) Check-in a 2 km (~2000m): aceito e marcado "Fora do local" com distância
    const ck2km = await request(app)
      .post(`/api/missoes/visitas/${visitaId}/checkin`)
      .set('x-auth-uid', 'uid-v1')
      .send({ lat: -18.9006, lon: -48.2772 })
    expect(ck2km.status).toBe(200)
    expect(ck2km.body.data.foraDoLocal).toBe(true)
    expect(ck2km.body.data.distanciaMetros).toBeGreaterThan(1900)

    // Resetar ultima_interacao para provar que a gravação só atualiza DEPOIS da confirmação do vendedor
    mockDb.clientes[0].ultima_interacao = '2026-10-01'

    // 3) Gravação de 10 minutos (600s) processada via Gemini (mock fetch global)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                transcricao: 'Vendedor: Bom dia! Cliente: Preciso de 500kg de composto lácteo.',
                conversado: 'Apresentada linha láctea para sorvete.',
                produtosInteresse: 'Composto Lácteo 25kg',
                objecoes: 'Prazo de boleto 28 dias',
                proximoPasso: 'Enviar proposta formal',
                proximoPrazo: '2026-12-05',
              }),
            }],
          },
        }],
      }),
    } as any)

    const gravRes = await request(app)
      .post(`/api/missoes/visitas/${visitaId}/gravacao`)
      .set('x-auth-uid', 'uid-v1')
      .send({
        audioBase64: Buffer.from('fake-10min-audio').toString('base64'),
        mimeType: 'audio/webm',
        duracaoSeg: 600,
      })
    expect(gravRes.status).toBe(200)
    expect(gravRes.body.data.resumoConfirmado).toBe(false)
    expect(gravRes.body.data.resumoIa.produtosInteresse).toBe('Composto Lácteo 25kg')
    // ANTES da confirmação do vendedor, NÃO conta como contato ainda!
    expect(mockDb.clientes[0].ultima_interacao).toBe('2026-10-01')

    // 4) Vendedor revisa, edita e confirma o resumo → agora vale e atualiza último contato!
    const confRes = await request(app)
      .post(`/api/missoes/visitas/${visitaId}/confirmar-resumo`)
      .set('x-auth-uid', 'uid-v1')
      .send({
        conversado: 'Apresentada linha láctea — cliente validou amostra.',
        produtosInteresse: 'Composto Lácteo 25kg (500kg/mês)',
        objecoes: 'Prazo 28 dias',
        proximoPasso: 'Enviar proposta formal hoje',
        proximoPrazo: '2026-12-05',
      })
    expect(confRes.status).toBe(200)
    expect(confRes.body.data.resumoConfirmado).toBe(true)
    const hojeISO = new Date().toISOString().slice(0, 10)
    expect(mockDb.clientes[0].ultima_interacao).toBe(hojeISO)
    expect(mockDb.interacoes).toHaveLength(1)

    // 5) Transcrição no histórico do cliente: dono (vendedor 1) e gestor veem; outro vendedor (vendedor 2 / Flavia) recebe 403!
    const trDono = await request(app).get('/api/missoes/cliente/10/transcricoes').set('x-auth-uid', 'uid-v1')
    expect(trDono.status).toBe(200)
    expect(trDono.body.data[0].transcricao).toContain('500kg')

    const trGestor = await request(app).get('/api/missoes/cliente/10/transcricoes').set('x-auth-uid', 'uid-gerente')
    expect(trGestor.status).toBe(200)

    const trOutroVendedor = await request(app).get('/api/missoes/cliente/10/transcricoes').set('x-auth-uid', 'uid-v2')
    expect(trOutroVendedor.status).toBe(403)

    fetchSpy.mockRestore()
  })
})
