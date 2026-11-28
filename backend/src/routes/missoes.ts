import { Router } from 'express'
import { supabase } from '../supabase.js'
import { log } from '../logger.js'
import { CONFIG } from '../config.js'
import { getVendedorByAuthId } from '../database.js'
import { requireAuth, requireGerente } from '../middleware/auth.js'

export const missoesRouter = Router()
missoesRouter.use(requireAuth)

// ─── Utilitários determinísticos (espelhados de frontend/src/utils/missaoCalculos.ts) ───

export function distanciaMetrosHaversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  return Math.round(R * c)
}

export function calcularDiasMissao(dataSaida?: string, dataRetorno?: string): number {
  if (!dataSaida || !dataRetorno) return 1
  const ini = Date.parse(`${String(dataSaida).slice(0, 10)}T00:00:00Z`)
  const fim = Date.parse(`${String(dataRetorno).slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return 1
  return Math.floor((fim - ini) / 86400000) + 1
}

export function calcularCustoPrevisto(params: {
  kmTotal: number
  valorKm: number
  valorDiaria: number
  dias: number
  hospedagem: number
}): number {
  const km = Math.max(0, Number(params.kmTotal) || 0)
  const vKm = Math.max(0, Number(params.valorKm) || 0)
  const vDia = Math.max(0, Number(params.valorDiaria) || 0)
  const dias = Math.max(1, Math.floor(Number(params.dias) || 1))
  const hosp = Math.max(0, Number(params.hospedagem) || 0)
  return Math.round((km * vKm + vDia * dias + hosp) * 100) / 100
}

function limparDigitosCnpj(raw?: string | null): string {
  return String(raw || '').replace(/\D/g, '')
}

function formatarCnpj14(d: string): string {
  const clean = limparDigitosCnpj(d)
  if (clean.length !== 14) return clean
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`
}

async function obterParametrosMissao() {
  try {
    const { data } = await supabase.from('missao_parametros').select('*').eq('id', 1).maybeSingle()
    return {
      valorKm: data?.valor_km != null ? Number(data.valor_km) : 1.5,
      valorDiaria: data?.valor_diaria != null ? Number(data.valor_diaria) : 120,
      raioCheckinMetros: data?.raio_checkin_metros != null ? Number(data.raio_checkin_metros) : 300,
      cidadeBase: data?.cidade_base || '',
      atualizadoPor: data?.atualizado_por || null,
      atualizadoEm: data?.atualizado_em || null,
    }
  } catch {
    return { valorKm: 1.5, valorDiaria: 120, raioCheckinMetros: 300, cidadeBase: '', atualizadoPor: null, atualizadoEm: null }
  }
}

async function geocodificarEnderecoBackend(endereco: string): Promise<{ lat: number; lon: number } | null> {
  const texto = String(endereco || '').trim()
  if (!texto) return null

  const gKey = CONFIG.googleMapsApiKey || CONFIG.googlePlacesKey
  if (gKey) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.set('address', `${texto}, Brasil`)
      url.searchParams.set('language', 'pt-BR')
      url.searchParams.set('region', 'br')
      url.searchParams.set('key', gKey)
      const r = await fetch(url.toString())
      const j = await r.json() as any
      const loc = j?.results?.[0]?.geometry?.location
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        return { lat: Number(loc.lat), lon: Number(loc.lng) }
      }
    } catch {
      // fallback abaixo
    }
  }

  // Fallback público OpenStreetMap Nominatim (respeitando User-Agent identificável)
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', `${texto}, Brasil`)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    const r = await fetch(url.toString(), {
      headers: { 'User-Agent': 'GrupoMFParisCRM/1.0 (comercial@mfparis.com.br)' },
    })
    if (r.ok) {
      const arr = await r.json() as any[]
      if (arr?.[0]?.lat && arr?.[0]?.lon) {
        return { lat: Number(arr[0].lat), lon: Number(arr[0].lon) }
      }
    }
  } catch {
    // ignore
  }
  return null
}

// ─── Mapeamento DB ↔ API ─────────────────────────────────────────────────────

function missaoFromDb(row: any, extras?: { visitasPlanejadasCount?: number; visitasRealizadasCount?: number; custoRealizadoTotal?: number }) {
  return {
    id: row.id,
    nome: row.nome,
    objetivo: row.objetivo || '',
    vendedorId: row.vendedor_id,
    estado: row.estado || '',
    cidades: row.cidades || [],
    dataSaida: row.data_saida,
    dataRetorno: row.data_retorno,
    veiculo: row.veiculo || '',
    hotel: row.hotel || '',
    status: row.status,
    metas: row.metas || {},
    custoEstimado: Number(row.custo_estimado) || 0,
    cidadeOrigem: row.cidade_origem || '',
    cidadeRetorno: row.cidade_retorno || '',
    hospedagemPrevista: row.hospedagem_prevista != null ? Number(row.hospedagem_prevista) : 0,
    kmTotal: row.km_total != null ? Number(row.km_total) : 0,
    valorKmAplicado: row.valor_km_aplicado != null ? Number(row.valor_km_aplicado) : undefined,
    valorDiariaAplicado: row.valor_diaria_aplicado != null ? Number(row.valor_diaria_aplicado) : undefined,
    diasViagem: row.dias_viagem != null ? Number(row.dias_viagem) : calcularDiasMissao(row.data_saida, row.data_retorno),
    custoPrevisto: row.custo_previsto != null ? Number(row.custo_previsto) : (Number(row.custo_estimado) || 0),
    visitasPlanejadasCount: extras?.visitasPlanejadasCount ?? 0,
    visitasRealizadasCount: extras?.visitasRealizadasCount ?? 0,
    custoRealizadoTotal: extras?.custoRealizadoTotal ?? 0,
    orcamentoPrevisto: row.orcamento_previsto || null,
    meta: row.meta || null,
    resultadoEsperado: row.resultado_esperado || '',
    aprovadoPor: row.aprovado_por,
    aprovadoEm: row.aprovado_em,
    motivoReprovacao: row.motivo_reprovacao || '',
    solicitanteId: row.solicitante_id,
    resumoIa: row.resumo_ia || '',
    iem: row.iem != null ? Number(row.iem) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function despesaFromDb(row: any) {
  return {
    id: row.id,
    missaoId: row.missao_id,
    vendedorId: row.vendedor_id,
    tipo: row.tipo,
    valor: Number(row.valor),
    data: row.data,
    comprovanteUrl: row.comprovante_url,
    observacao: row.observacao || '',
    createdAt: row.created_at,
  }
}

function visitaRoteiroFromDb(row: any, podeVerTranscricao = true) {
  return {
    id: row.id,
    missaoId: row.missao_id,
    clienteId: row.cliente_id,
    diaNumero: row.dia_numero ?? 1,
    dataVisita: row.data_visita || undefined,
    ordem: row.ordem ?? 1,
    planejada: row.planejada !== false,
    status: row.status || 'pendente',
    checkinEm: row.checkin_em || undefined,
    checkinLat: row.checkin_lat != null ? Number(row.checkin_lat) : undefined,
    checkinLon: row.checkin_lon != null ? Number(row.checkin_lon) : undefined,
    clienteLat: row.cliente_lat != null ? Number(row.cliente_lat) : undefined,
    clienteLon: row.cliente_lon != null ? Number(row.cliente_lon) : undefined,
    distanciaMetros: row.distancia_metros != null ? Number(row.distancia_metros) : null,
    foraDoLocal: Boolean(row.fora_do_local),
    raioAplicadoMetros: row.raio_aplicado_metros != null ? Number(row.raio_aplicado_metros) : undefined,
    motivoNaoRealizada: row.motivo_nao_realizada || undefined,
    decisaoGestorDescarte: row.decisao_gestor_descarte || null,
    decisaoGestorPor: row.decisao_gestor_por || undefined,
    decisaoGestorEm: row.decisao_gestor_em || undefined,
    decisaoGestorObs: row.decisao_gestor_obs || undefined,
    audioPath: podeVerTranscricao ? (row.audio_path || undefined) : undefined,
    audioUrl: podeVerTranscricao ? (row.audio_url || undefined) : undefined,
    audioDuracaoSeg: row.audio_duracao_seg != null ? Number(row.audio_duracao_seg) : undefined,
    transcricao: podeVerTranscricao ? (row.transcricao || null) : null,
    resumoIa: row.resumo_ia || null,
    resumoConfirmado: Boolean(row.resumo_confirmado),
    resumoConfirmadoEm: row.resumo_confirmado_em || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function tarefaFromDb(row: any) {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || '',
    data: row.data,
    hora: row.hora || '',
    tipo: row.tipo,
    status: row.status,
    prioridade: row.prioridade,
    clienteId: row.cliente_id,
    vendedorId: row.vendedor_id,
    missaoId: row.missao_id,
    diaMissao: row.dia_missao,
    ordem: row.ordem,
    chegadaEm: row.chegada_em,
    saidaEm: row.saida_em,
    localizacaoChegada: row.localizacao_chegada,
    localizacaoSaida: row.localizacao_saida,
    resultado: row.resultado,
    interesse: row.interesse,
    produtosApresentados: row.produtos_apresentados || [],
    proximosPassos: row.proximos_passos,
    amostrasEntregues: row.amostras_entregues,
    conclusao: row.conclusao,
  }
}

async function currentVendedor(req: any) {
  const userId = req.userId
  return userId ? getVendedorByAuthId(userId) : null
}

function canAccessMission(vendedor: any, missao: any): boolean {
  return !!vendedor && (vendedor.cargo === 'gerente' || Number(missao.vendedor_id) === Number(vendedor.id))
}

async function uploadArquivoMissao(
  pasta: string,
  extensao: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ path: string; publicUrl: string } | null> {
  const filePath = `${pasta}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensao}`
  for (const bucket of ['missao-arquivos', 'call-recordings']) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
        contentType,
        upsert: true,
      })
      if (!error) {
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath)
        return { path: `${bucket}:${filePath}`, publicUrl: pub.publicUrl }
      }
    } catch {
      // tenta próximo bucket
    }
  }
  return null
}

// ─── Parâmetros globais de Missões (Item 3, 4 e 8) ───────────────────────────

missoesRouter.get('/parametros', async (_req: any, res: any) => {
  try {
    const params = await obterParametrosMissao()
    res.json({ success: true, data: params })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erro ao buscar parâmetros' })
  }
})

missoesRouter.put('/parametros', requireGerente, async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const valorKm = Math.max(0, Number(req.body?.valorKm ?? 1.5))
    const valorDiaria = Math.max(0, Number(req.body?.valorDiaria ?? 120))
    const raioCheckinMetros = Math.max(30, Math.round(Number(req.body?.raioCheckinMetros ?? 300)))
    const cidadeBase = String(req.body?.cidadeBase || '').trim()
    const agora = new Date().toISOString()

    const { data, error } = await supabase
      .from('missao_parametros')
      .upsert({
        id: 1,
        valor_km: valorKm,
        valor_diaria: valorDiaria,
        raio_checkin_metros: raioCheckinMetros,
        cidade_base: cidadeBase,
        atualizado_por: vendedor.nome || vendedor.email,
        atualizado_em: agora,
      })
      .select()
      .single()

    if (error) throw error
    res.json({
      success: true,
      data: {
        valorKm: Number(data.valor_km),
        valorDiaria: Number(data.valor_diaria),
        raioCheckinMetros: Number(data.raio_checkin_metros),
        cidadeBase: data.cidade_base || '',
        atualizadoPor: data.atualizado_por,
        atualizadoEm: data.atualizado_em,
      },
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao salvar parâmetros de Missões')
    res.status(500).json({ success: false, error: err.message || 'Erro ao salvar parâmetros' })
  }
})

// ─── Geocodificação auxiliar (raio em km + check-in) ─────────────────────────

missoesRouter.get('/geocode', async (req: any, res: any) => {
  try {
    const q = String(req.query?.q || '').trim()
    if (!q) { res.status(400).json({ success: false, error: 'Parâmetro q obrigatório' }); return }
    const coord = await geocodificarEnderecoBackend(q)
    res.json({ success: Boolean(coord), data: coord })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Item 1: Importação da base de leads por vendedor (sem duplicar CNPJ) ────

missoesRouter.post('/importar-leads', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const leadsInput: any[] = Array.isArray(req.body?.leads) ? req.body.leads : []
    if (leadsInput.length === 0) {
      res.status(400).json({ success: false, error: 'Nenhum lead enviado na planilha.' })
      return
    }

    // Vendedor só importa para si mesmo; gestor pode escolher o vendedor dono da planilha
    const donoId = vendedor.cargo === 'gerente' && req.body?.vendedorId
      ? Number(req.body.vendedorId)
      : Number(vendedor.id)

    // Carregar TODOS os CNPJs já cadastrados no CRM inteiro (para nunca duplicar CNPJ existente)
    const cnpjsExistentes = new Set<string>()
    let from = 0
    const PAGE = 1000
    for (;;) {
      const { data: rows, error } = await supabase
        .from('clientes')
        .select('cnpj, cnpj2')
        .range(from, from + PAGE - 1)
      if (error) throw error
      if (!rows || rows.length === 0) break
      for (const r of rows) {
        const d1 = limparDigitosCnpj(r.cnpj)
        const d2 = limparDigitosCnpj(r.cnpj2)
        if (d1.length >= 11) cnpjsExistentes.add(d1)
        if (d2.length >= 11) cnpjsExistentes.add(d2)
      }
      if (rows.length < PAGE) break
      from += PAGE
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const vistosNoLote = new Set<string>()
    const paraInserir: any[] = []
    let duplicadosNoCrm = 0
    let duplicadosNaPlanilha = 0
    let invalidos = 0

    for (const item of leadsInput) {
      const cnpjDig = limparDigitosCnpj(item.cnpjDigitos || item.cnpj)
      const razao = String(item.razaoSocial || item.nomeFantasia || '').trim()
      if (cnpjDig.length !== 14 || !razao) {
        invalidos++
        continue
      }
      if (vistosNoLote.has(cnpjDig)) {
        duplicadosNaPlanilha++
        continue
      }
      vistosNoLote.add(cnpjDig)

      if (cnpjsExistentes.has(cnpjDig)) {
        duplicadosNoCrm++
        continue
      }

      paraInserir.push({
        razao_social: razao,
        nome_fantasia: String(item.nomeFantasia || razao).trim(),
        cnpj: formatarCnpj14(cnpjDig),
        segmento: String(item.segmento || '').trim() || null,
        cnae_primario: String(item.cnaePrimario || '').trim() || null,
        endereco_rua: String(item.enderecoRua || '').trim(),
        endereco_bairro: String(item.enderecoBairro || '').trim(),
        endereco_cidade: String(item.enderecoCidade || '').trim(),
        endereco_estado: String(item.enderecoEstado || '').trim().slice(0, 2).toUpperCase(),
        endereco_cep: String(item.enderecoCep || '').trim(),
        contato_telefone: String(item.contatoTelefone || '').trim(),
        contato_email: String(item.contatoEmail || '').trim(),
        contato_nome: String(item.contatoNome || '').trim(),
        latitude: item.latitude != null && Number.isFinite(Number(item.latitude)) ? Number(item.latitude) : null,
        longitude: item.longitude != null && Number.isFinite(Number(item.longitude)) ? Number(item.longitude) : null,
        etapa: 'prospecção',
        data_entrada_etapa: hoje,
        vendedor_id: donoId,
        origem_lead: 'Planilha Missão',
        status_faturamento: 'a_faturar',
      })
    }

    const inseridosRows: any[] = []
    for (let i = 0; i < paraInserir.length; i += 200) {
      const chunk = paraInserir.slice(i, i + 200)
      const { data: ins, error: insErr } = await supabase.from('clientes').insert(chunk).select('*')
      if (insErr) throw insErr
      if (ins) inseridosRows.push(...ins)
    }

    res.json({
      success: true,
      data: {
        vendedorId: donoId,
        inseridos: inseridosRows.length,
        duplicadosNoCrm,
        duplicadosNaPlanilha,
        invalidos,
        clientes: inseridosRows,
      },
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao importar planilha de leads na Missão')
    res.status(500).json({ success: false, error: err.message || 'Erro ao importar leads' })
  }
})

// ─── Fila do gestor: leads "Estabelecimento não localizado" (Item 4) ─────────

missoesRouter.get('/leads-nao-localizados', requireGerente, async (_req: any, res: any) => {
  try {
    const { data, error } = await supabase
      .from('missao_roteiro_visitas')
      .select('*, missoes(id, nome, vendedor_id), clientes(id, razao_social, nome_fantasia, cnpj, endereco_cidade, endereco_estado, etapa)')
      .eq('status', 'nao_localizado')
      .or('decisao_gestor_descarte.is.null,decisao_gestor_descarte.eq.pendente')
      .order('updated_at', { ascending: false })

    if (error) throw error
    res.json({ success: true, data: data || [] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Privacidade da transcrição no histórico do cliente (Item 5) ─────────────

missoesRouter.get('/cliente/:clienteId/transcricoes', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const clienteId = Number(req.params.clienteId)
    const { data: cli } = await supabase.from('clientes').select('id, vendedor_id').eq('id', clienteId).maybeSingle()
    if (!cli) { res.status(404).json({ success: false, error: 'Cliente não encontrado' }); return }

    // Estritamente visível só ao vendedor dono da carteira e ao gestor
    const autorizado = vendedor.cargo === 'gerente' || Number(cli.vendedor_id) === Number(vendedor.id)
    if (!autorizado) {
      res.status(403).json({ success: false, error: 'Transcrição restrita ao vendedor dono da carteira e ao gestor.' })
      return
    }

    const { data: rows, error } = await supabase
      .from('missao_roteiro_visitas')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('resumo_confirmado', true)
      .not('transcricao', 'is', null)
      .order('resumo_confirmado_em', { ascending: false })

    if (error) throw error
    res.json({ success: true, data: (rows || []).map(r => visitaRoteiroFromDb(r, true)) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Dashboard / Relatório do gerente (rota estática ANTES de /:id) ──────────

missoesRouter.get('/dashboard', requireGerente, async (_req: any, res: any) => {
  try {
    const { data: missoes, error } = await supabase.from('missoes').select('*, tarefas:tarefas(*)')
    if (error) throw error

    const ativas = (missoes || []).filter((m: any) => m.status === 'em_andamento')
    const totalVisitas = ativas.reduce((s: number, m: any) => s + (m.tarefas?.length || 0), 0)
    const visitasConcluidas = ativas.reduce((s: number, m: any) => s + (m.tarefas?.filter((t: any) => t.status === 'concluida').length || 0), 0)
    const vendedoresEmCampo = new Set(ativas.map((m: any) => m.vendedor_id)).size

    res.json({
      success: true,
      data: {
        missoesAtivas: ativas.length,
        vendedoresEmCampo,
        totalVisitas,
        visitasConcluidas,
        despesas: ativas.length,
        missoes: (missoes || []).map((m: any) => missaoFromDb(m)),
      },
    })
  } catch (err: any) {
    log.error({ err }, 'Erro no dashboard')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Missões CRUD + Acompanhamento (Item 2, 3, 7, 8) ─────────────────────────

missoesRouter.get('/', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const { status } = req.query
    let query = supabase.from('missoes').select('*').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    // Isolamento estrito na própria query SQL para vendedor (Item 8 + Aceite)
    if (vendedor.cargo !== 'gerente') {
      query = query.eq('vendedor_id', vendedor.id)
    }

    const { data, error } = await query
    if (error) throw error

    const list = (data || []).filter((m: any) => canAccessMission(vendedor, m))
    const missaoIds = list.map((m: any) => m.id)

    // Carregar contadores de visitas realizadas/planejadas e custo realizado por missão (Item 7)
    const visitasPorMissao = new Map<number, { planejadas: number; realizadas: number }>()
    const despesasPorMissao = new Map<number, number>()

    if (missaoIds.length > 0) {
      const [visRes, despRes] = await Promise.all([
        supabase.from('missao_roteiro_visitas').select('missao_id, status').in('missao_id', missaoIds),
        supabase.from('missao_despesas').select('missao_id, valor').in('missao_id', missaoIds),
      ])

      for (const v of visRes.data || []) {
        if (v.status === 'removida') continue
        const cur = visitasPorMissao.get(v.missao_id) || { planejadas: 0, realizadas: 0 }
        cur.planejadas++
        if (v.status === 'visitado') cur.realizadas++
        visitasPorMissao.set(v.missao_id, cur)
      }

      for (const d of despRes.data || []) {
        const cur = despesasPorMissao.get(d.missao_id) || 0
        despesasPorMissao.set(d.missao_id, Math.round((cur + Number(d.valor || 0)) * 100) / 100)
      }
    }

    res.json({
      success: true,
      data: list.map((m: any) => {
        const vc = visitasPorMissao.get(m.id) || { planejadas: 0, realizadas: 0 }
        return missaoFromDb(m, {
          visitasPlanejadasCount: vc.planejadas,
          visitasRealizadasCount: vc.realizadas,
          custoRealizadoTotal: despesasPorMissao.get(m.id) || 0,
        })
      }),
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao listar missões')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const body = req.body || {}
    if (!body.nome || !body.dataSaida || !body.dataRetorno) {
      res.status(400).json({ success: false, error: 'nome, dataSaida e dataRetorno são obrigatórios' })
      return
    }

    // Uma missão por vendedor: vendedor só cria para si; gestor escolhe 1 vendedor
    const vendedorId = vendedor.cargo === 'gerente' ? Number(body.vendedorId || vendedor.id) : Number(vendedor.id)
    const params = await obterParametrosMissao()
    const diasViagem = calcularDiasMissao(body.dataSaida, body.dataRetorno)
    const kmTotal = Math.max(0, Number(body.kmTotal) || 0)
    const hospedagemPrevista = Math.max(0, Number(body.hospedagemPrevista ?? body.custoHospedagem ?? 0))
    const custoPrevisto = calcularCustoPrevisto({
      kmTotal,
      valorKm: params.valorKm,
      valorDiaria: params.valorDiaria,
      dias: diasViagem,
      hospedagem: hospedagemPrevista,
    })
    const custoEstimadoInformado = body.custoEstimado !== undefined && body.custoEstimado !== '' && body.custoEstimado !== null
      ? Number(body.custoEstimado)
      : custoPrevisto

    const payloadInsert: Record<string, any> = {
      nome: body.nome,
      objetivo: body.objetivo || '',
      vendedor_id: vendedorId,
      estado: body.estado || '',
      cidades: Array.isArray(body.cidades) ? body.cidades : [],
      data_saida: body.dataSaida,
      data_retorno: body.dataRetorno,
      veiculo: body.veiculo || '',
      hotel: body.hotel || '',
      status: body.status || 'aguardando_aprovacao',
      solicitante_id: vendedor.id,
      metas: body.metas || null,
      custo_estimado: custoEstimadoInformado,
      cidade_origem: body.cidadeOrigem ?? params.cidadeBase ?? '',
      cidade_retorno: body.cidadeRetorno ?? body.cidadeOrigem ?? params.cidadeBase ?? '',
      hospedagem_prevista: hospedagemPrevista,
      km_total: kmTotal,
      valor_km_aplicado: params.valorKm,
      valor_diaria_aplicado: params.valorDiaria,
      dias_viagem: diasViagem,
      custo_previsto: custoPrevisto,
    }

    const { data, error } = await supabase.from('missoes').insert(payloadInsert).select().single()
    if (error || !data) { res.status(400).json({ success: false, error: error?.message || 'Erro ao criar missão' }); return }

    // Se já vieram visitas iniciais na criação, gravar no roteiro
    const visitasIniciais: any[] = Array.isArray(body.visitas) ? body.visitas : []
    if (visitasIniciais.length > 0) {
      const rows = visitasIniciais.map((v: any, idx: number) => ({
        missao_id: data.id,
        cliente_id: Number(v.clienteId),
        dia_numero: Number(v.diaNumero || 1),
        data_visita: v.dataVisita || body.dataSaida,
        ordem: Number(v.ordem || idx + 1),
        planejada: true,
        status: 'pendente',
      }))
      await supabase.from('missao_roteiro_visitas').insert(rows)
    }

    res.json({
      success: true,
      data: missaoFromDb(data, {
        visitasPlanejadasCount: visitasIniciais.length,
        visitasRealizadasCount: 0,
        custoRealizadoTotal: 0,
      }),
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.get('/:id', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const [{ data: tarefas }, { data: despesas }, { data: visitasRoteiro }, params] = await Promise.all([
      supabase.from('tarefas').select('*').eq('missao_id', id).order('dia_missao', { ascending: true }).order('ordem', { ascending: true }),
      supabase.from('missao_despesas').select('*').eq('missao_id', id).order('data', { ascending: false }),
      supabase.from('missao_roteiro_visitas').select('*').eq('missao_id', id).neq('status', 'removida').order('dia_numero', { ascending: true }).order('ordem', { ascending: true }),
      obterParametrosMissao(),
    ])

    // Verificar donos dos clientes das visitas para privacidade estrita da transcrição
    const cliIds = [...new Set((visitasRoteiro || []).map((v: any) => v.cliente_id).filter(Boolean))]
    const donoPorCliente = new Map<number, number | null>()
    if (cliIds.length > 0) {
      const { data: clis } = await supabase.from('clientes').select('id, vendedor_id').in('id', cliIds)
      for (const c of clis || []) donoPorCliente.set(c.id, c.vendedor_id)
    }

    const visitasFormatadas = (visitasRoteiro || []).map((v: any) => {
      const donoCli = donoPorCliente.get(v.cliente_id)
      const podeVerTranscricao = vendedor.cargo === 'gerente' || Number(donoCli) === Number(vendedor.id) || Number(missao.vendedor_id) === Number(vendedor.id)
      return visitaRoteiroFromDb(v, podeVerTranscricao)
    })

    const custoRealizadoTotal = (despesas || []).reduce((s: number, d: any) => s + Number(d.valor || 0), 0)

    res.json({
      success: true,
      data: {
        missao: missaoFromDb(missao, {
          visitasPlanejadasCount: visitasFormatadas.length,
          visitasRealizadasCount: visitasFormatadas.filter((v: any) => v.status === 'visitado').length,
          custoRealizadoTotal: Math.round(custoRealizadoTotal * 100) / 100,
        }),
        visitas: visitasFormatadas,
        tarefas: (tarefas || []).map(tarefaFromDb),
        despesas: (despesas || []).map(despesaFromDb),
        parametros: params,
      },
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.put('/:id', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: missao, error: findError } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (findError || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const body = req.body || {}
    const payload: any = {}
    if (body.nome !== undefined) payload.nome = body.nome
    if (body.objetivo !== undefined) payload.objetivo = body.objetivo
    if (body.vendedorId !== undefined && vendedor.cargo === 'gerente') payload.vendedor_id = Number(body.vendedorId)
    if (body.estado !== undefined) payload.estado = body.estado
    if (body.cidades !== undefined) payload.cidades = body.cidades
    if (body.dataSaida !== undefined) payload.data_saida = body.dataSaida
    if (body.dataRetorno !== undefined) payload.data_retorno = body.dataRetorno
    if (body.veiculo !== undefined) payload.veiculo = body.veiculo
    if (body.hotel !== undefined) payload.hotel = body.hotel
    if (body.status !== undefined) payload.status = body.status
    if (body.metas !== undefined) payload.metas = body.metas
    if (body.custoEstimado !== undefined) payload.custo_estimado = Number(body.custoEstimado)
    if (body.cidadeOrigem !== undefined) payload.cidade_origem = body.cidadeOrigem
    if (body.cidadeRetorno !== undefined) payload.cidade_retorno = body.cidadeRetorno
    if (body.hospedagemPrevista !== undefined) payload.hospedagem_prevista = Number(body.hospedagemPrevista)
    if (body.kmTotal !== undefined) payload.km_total = Number(body.kmTotal)

    const params = await obterParametrosMissao()
    const dataSaidaEfetiva = payload.data_saida ?? missao.data_saida
    const dataRetornoEfetiva = payload.data_retorno ?? missao.data_retorno
    const diasViagem = calcularDiasMissao(dataSaidaEfetiva, dataRetornoEfetiva)
    const kmEfetivo = payload.km_total !== undefined ? Number(payload.km_total) : Number(missao.km_total || 0)
    const hospEfetiva = payload.hospedagem_prevista !== undefined ? Number(payload.hospedagem_prevista) : Number(missao.hospedagem_prevista || 0)
    const valorKm = Number(missao.valor_km_aplicado ?? params.valorKm)
    const valorDiaria = Number(missao.valor_diaria_aplicado ?? params.valorDiaria)

    payload.dias_viagem = diasViagem
    payload.valor_km_aplicado = valorKm
    payload.valor_diaria_aplicado = valorDiaria
    payload.custo_previsto = calcularCustoPrevisto({
      kmTotal: kmEfetivo,
      valorKm,
      valorDiaria,
      dias: diasViagem,
      hospedagem: hospEfetiva,
    })
    payload.updated_at = new Date().toISOString()

    const { data, error } = await supabase.from('missoes').update(payload).eq('id', id).select().single()
    if (error || !data) { res.status(400).json({ success: false, error: error?.message || 'Erro ao atualizar' }); return }
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao atualizar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.delete('/:id', requireGerente, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id)
    const { error } = await supabase.from('missoes').delete().eq('id', id)
    if (error) { res.status(400).json({ success: false, error: error.message }); return }
    res.json({ success: true })
  } catch (err: any) {
    log.error({ err }, 'Erro ao deletar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Sincronização e Reordenação do Roteiro de Visitas (Item 2 e 3) ──────────

missoesRouter.put('/:id/visitas-plano', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: missao, error: mErr } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (mErr || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const itens: any[] = Array.isArray(req.body?.visitas) ? req.body.visitas : []
    const kmTotalNovo = req.body?.kmTotal !== undefined ? Math.max(0, Number(req.body.kmTotal) || 0) : Number(missao.km_total || 0)
    const cidadeOrigemNova = req.body?.cidadeOrigem !== undefined ? String(req.body.cidadeOrigem) : missao.cidade_origem
    const cidadeRetornoNova = req.body?.cidadeRetorno !== undefined ? String(req.body.cidadeRetorno) : missao.cidade_retorno
    const hospedagemNova = req.body?.hospedagemPrevista !== undefined ? Math.max(0, Number(req.body.hospedagemPrevista) || 0) : Number(missao.hospedagem_prevista || 0)

    const { data: atuais } = await supabase
      .from('missao_roteiro_visitas')
      .select('*')
      .eq('missao_id', id)
      .neq('status', 'removida')

    const atuaisPorId = new Map<number, any>((atuais || []).map((r: any) => [r.id, r]))
    const idsMantidos = new Set<number>()
    const emViagem = missao.status === 'em_andamento'

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i]
      const visitaId = it.id ? Number(it.id) : null
      if (visitaId && atuaisPorId.has(visitaId)) {
        idsMantidos.add(visitaId)
        await supabase
          .from('missao_roteiro_visitas')
          .update({
            dia_numero: Number(it.diaNumero || 1),
            data_visita: it.dataVisita || null,
            ordem: Number(it.ordem || i + 1),
            updated_at: new Date().toISOString(),
          })
          .eq('id', visitaId)
      } else if (it.clienteId) {
        const { data: criada } = await supabase
          .from('missao_roteiro_visitas')
          .insert({
            missao_id: id,
            cliente_id: Number(it.clienteId),
            dia_numero: Number(it.diaNumero || 1),
            data_visita: it.dataVisita || missao.data_saida,
            ordem: Number(it.ordem || i + 1),
            planejada: !emViagem,
            status: 'pendente',
          })
          .select('id')
          .single()
        if (criada?.id) idsMantidos.add(criada.id)
      }
    }

    // Marcar como removida qualquer visita pendente que foi retirada da lista (preservando as já visitadas)
    for (const r of atuais || []) {
      if (!idsMantidos.has(r.id) && r.status === 'pendente') {
        await supabase
          .from('missao_roteiro_visitas')
          .update({ status: 'removida', updated_at: new Date().toISOString() })
          .eq('id', r.id)
      }
    }

    const params = await obterParametrosMissao()
    const valorKm = Number(missao.valor_km_aplicado ?? params.valorKm)
    const valorDiaria = Number(missao.valor_diaria_aplicado ?? params.valorDiaria)
    const diasViagem = calcularDiasMissao(missao.data_saida, missao.data_retorno)
    const custoPrevisto = calcularCustoPrevisto({
      kmTotal: kmTotalNovo,
      valorKm,
      valorDiaria,
      dias: diasViagem,
      hospedagem: hospedagemNova,
    })

    const { data: missaoUpd } = await supabase
      .from('missoes')
      .update({
        km_total: kmTotalNovo,
        cidade_origem: cidadeOrigemNova,
        cidade_retorno: cidadeRetornoNova,
        hospedagem_prevista: hospedagemNova,
        valor_km_aplicado: valorKm,
        valor_diaria_aplicado: valorDiaria,
        dias_viagem: diasViagem,
        custo_previsto: custoPrevisto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    const { data: visitasFinais } = await supabase
      .from('missao_roteiro_visitas')
      .select('*')
      .eq('missao_id', id)
      .neq('status', 'removida')
      .order('dia_numero', { ascending: true })
      .order('ordem', { ascending: true })

    res.json({
      success: true,
      data: {
        missao: missaoFromDb(missaoUpd || missao),
        visitas: (visitasFinais || []).map((v: any) => visitaRoteiroFromDb(v, true)),
      },
    })
  } catch (err: any) {
    log.error({ err }, 'Erro ao sincronizar roteiro da missão')
    res.status(500).json({ success: false, error: err.message || 'Erro ao salvar roteiro' })
  }
})

// ─── Item 4: Check-in GPS, Não localizado, Não realizada e Decisão do Gestor ──

missoesRouter.post('/visitas/:visitaId/checkin', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const visitaId = Number(req.params.visitaId)
    const lat = Number(req.body?.lat ?? req.body?.location?.lat)
    const lon = Number(req.body?.lon ?? req.body?.location?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ success: false, error: 'Localização GPS do aparelho é obrigatória para o check-in.' })
      return
    }

    const { data: visita, error: vErr } = await supabase
      .from('missao_roteiro_visitas')
      .select('*, missoes(*)')
      .eq('id', visitaId)
      .single()
    if (vErr || !visita) { res.status(404).json({ success: false, error: 'Visita não encontrada' }); return }
    if (!canAccessMission(vendedor, visita.missoes)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data: cliente } = await supabase.from('clientes').select('*').eq('id', visita.cliente_id).single()
    if (!cliente) { res.status(404).json({ success: false, error: 'Cliente não encontrado' }); return }

    let cliLat: number | null = cliente.latitude != null ? Number(cliente.latitude) : null
    let cliLon: number | null = cliente.longitude != null ? Number(cliente.longitude) : null

    // Se o cliente ainda não tiver coordenadas gravadas, geocodificar pelo endereço do cadastro
    if (cliLat == null || cliLon == null || !Number.isFinite(cliLat) || !Number.isFinite(cliLon)) {
      const partesEnd = [
        cliente.endereco_rua && cliente.endereco_numero ? `${cliente.endereco_rua}, ${cliente.endereco_numero}` : (cliente.endereco_rua || cliente.endereco || ''),
        cliente.endereco_bairro || '',
        cliente.endereco_cidade || '',
        cliente.endereco_estado || '',
        cliente.endereco_cep || '',
      ].filter(Boolean).join(', ')
      const geocoded = await geocodificarEnderecoBackend(partesEnd)
      if (geocoded) {
        cliLat = geocoded.lat
        cliLon = geocoded.lon
        await supabase.from('clientes').update({ latitude: cliLat, longitude: cliLon }).eq('id', cliente.id)
      }
    }

    const params = await obterParametrosMissao()
    const raio = params.raioCheckinMetros || 300
    let distanciaMetros: number | null = null
    let foraDoLocal = false

    if (cliLat != null && cliLon != null && Number.isFinite(cliLat) && Number.isFinite(cliLon)) {
      distanciaMetros = distanciaMetrosHaversine({ lat, lon }, { lat: cliLat, lon: cliLon })
      foraDoLocal = distanciaMetros > raio
    }

    const agora = new Date().toISOString()
    const { data: atualizada, error: updErr } = await supabase
      .from('missao_roteiro_visitas')
      .update({
        status: 'visitado',
        checkin_em: agora,
        checkin_lat: lat,
        checkin_lon: lon,
        cliente_lat: cliLat,
        cliente_lon: cliLon,
        distancia_metros: distanciaMetros,
        fora_do_local: foraDoLocal,
        raio_aplicado_metros: raio,
        updated_at: agora,
      })
      .eq('id', visitaId)
      .select('*')
      .single()

    if (updErr) throw updErr

    // Atualizar último contato do cliente ao realizar visita presencial com check-in
    const hojeISO = agora.slice(0, 10)
    await supabase.from('clientes').update({ ultima_interacao: hojeISO }).eq('id', cliente.id)

    res.json({ success: true, data: visitaRoteiroFromDb(atualizada, true) })
  } catch (err: any) {
    log.error({ err }, 'Erro no check-in da visita de missão')
    res.status(500).json({ success: false, error: err.message || 'Erro no check-in' })
  }
})

missoesRouter.post('/visitas/:visitaId/nao-localizado', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const visitaId = Number(req.params.visitaId)
    const { data: visita } = await supabase.from('missao_roteiro_visitas').select('*, missoes(*)').eq('id', visitaId).single()
    if (!visita) { res.status(404).json({ success: false, error: 'Visita não encontrada' }); return }
    if (!canAccessMission(vendedor, visita.missoes)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const obs = String(req.body?.observacao || '').trim()
    const lat = req.body?.lat != null ? Number(req.body.lat) : null
    const lon = req.body?.lon != null ? Number(req.body.lon) : null
    const agora = new Date().toISOString()

    const { data: upd, error } = await supabase
      .from('missao_roteiro_visitas')
      .update({
        status: 'nao_localizado',
        checkin_em: agora,
        checkin_lat: Number.isFinite(lat) ? lat : null,
        checkin_lon: Number.isFinite(lon) ? lon : null,
        motivo_nao_realizada: obs || 'Estabelecimento não localizado ou fechado definitivamente',
        decisao_gestor_descarte: 'pendente',
        updated_at: agora,
      })
      .eq('id', visitaId)
      .select('*')
      .single()

    if (error) throw error
    res.json({ success: true, data: visitaRoteiroFromDb(upd, true) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

missoesRouter.post('/visitas/:visitaId/nao-realizada', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const visitaId = Number(req.params.visitaId)
    const motivo = String(req.body?.motivo || '').trim()
    if (!motivo) {
      res.status(400).json({ success: false, error: 'Informe obrigatoriamente o motivo da visita não realizada.' })
      return
    }
    const { data: visita } = await supabase.from('missao_roteiro_visitas').select('*, missoes(*)').eq('id', visitaId).single()
    if (!visita) { res.status(404).json({ success: false, error: 'Visita não encontrada' }); return }
    if (!canAccessMission(vendedor, visita.missoes)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data: upd, error } = await supabase
      .from('missao_roteiro_visitas')
      .update({
        status: 'nao_realizada',
        motivo_nao_realizada: motivo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visitaId)
      .select('*')
      .single()

    if (error) throw error
    res.json({ success: true, data: visitaRoteiroFromDb(upd, true) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

missoesRouter.post('/visitas/:visitaId/decidir-descarte', requireGerente, async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const visitaId = Number(req.params.visitaId)
    const decisao = req.body?.decisao === 'descartado' ? 'descartado' : 'mantido'
    const obs = String(req.body?.observacao || '').trim()

    const { data: visita } = await supabase.from('missao_roteiro_visitas').select('*').eq('id', visitaId).single()
    if (!visita) { res.status(404).json({ success: false, error: 'Visita não encontrada' }); return }

    const agora = new Date().toISOString()
    const { data: upd, error } = await supabase
      .from('missao_roteiro_visitas')
      .update({
        decisao_gestor_descarte: decisao,
        decisao_gestor_por: vendedor.nome || vendedor.email,
        decisao_gestor_em: agora,
        decisao_gestor_obs: obs || null,
        updated_at: agora,
      })
      .eq('id', visitaId)
      .select('*')
      .single()

    if (error) throw error

    // Registrar no histórico do cliente (e se descartado em prospecção, marcar perdido por estabelecimento fechado)
    if (visita.cliente_id) {
      await supabase.from('interacoes').insert({
        cliente_id: visita.cliente_id,
        tipo: 'nota',
        data: agora,
        assunto: decisao === 'descartado'
          ? 'Lead descartado pelo gestor (Estabelecimento não localizado)'
          : 'Estabelecimento não localizado — gestor manteve o lead',
        descricao: `Decisão do gestor (${vendedor.nome}) sobre apontamento de visita em missão: ${decisao === 'descartado' ? 'Descartar lead' : 'Manter na carteira'}.${obs ? `\nObservação: ${obs}` : ''}`,
        automatico: true,
      })

      if (decisao === 'descartado') {
        const { data: cli } = await supabase.from('clientes').select('etapa').eq('id', visita.cliente_id).maybeSingle()
        if (cli && (cli.etapa === 'prospecção' || cli.etapa === 'lead')) {
          await supabase.from('clientes').update({
            etapa: 'perdido',
            etapa_anterior: cli.etapa,
            motivo_perda: `Estabelecimento não localizado em missão${obs ? `: ${obs}` : ''}`,
            categoria_perda: 'outro',
            data_perda: agora.slice(0, 10),
          }).eq('id', visita.cliente_id)
        }
      }
    }

    res.json({ success: true, data: visitaRoteiroFromDb(upd, true) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Item 5: Gravação de Visita + Transcrição e Resumo IA + Confirmação ──────

missoesRouter.post('/visitas/:visitaId/gravacao', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const visitaId = Number(req.params.visitaId)
    const { data: visita } = await supabase
      .from('missao_roteiro_visitas')
      .select('*, missoes(*)')
      .eq('id', visitaId)
      .single()
    if (!visita) { res.status(404).json({ success: false, error: 'Visita não encontrada' }); return }
    if (!canAccessMission(vendedor, visita.missoes)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const audioBase64 = String(req.body?.audioBase64 || '').trim()
    const mimeType = String(req.body?.mimeType || 'audio/webm').split(';')[0].trim()
    const duracaoSeg = Math.max(1, Math.round(Number(req.body?.duracaoSeg || 0)))
    if (!audioBase64) {
      res.status(400).json({ success: false, error: 'Áudio não recebido.' })
      return
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      res.status(500).json({ success: false, error: 'GEMINI_API_KEY não configurada no servidor.' })
      return
    }

    // 1. Salvar áudio no Storage (best-effort)
    const buffer = Buffer.from(audioBase64, 'base64')
    const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'mp4' : 'webm'
    const uploaded = await uploadArquivoMissao(`visitas/missao_${visita.missao_id}`, ext, buffer, mimeType)

    // 2. Transcrever e gerar resumo estruturado via Gemini 2.5 Flash (mesma estrutura de IA do CRM)
    const prompt = `Você está processando o áudio de uma visita presencial de vendas B2B do Grupo MF Paris.
1) Transcreva fielmente a conversa em português do Brasil, identificando "Vendedor:" e "Cliente:" quando possível.
2) Gere um resumo estruturado exatamente nos campos solicitados.
Responda APENAS com um JSON válido (sem markdown \`\`\`) neste formato exato:
{
  "transcricao": "transcrição completa aqui...",
  "conversado": "resumo objetivo do que foi conversado",
  "produtosInteresse": "produtos citados ou de interesse do cliente (ou 'Não mencionado')",
  "objecoes": "objeções de preço, prazo, qualidade, estoque ou concorrência (ou 'Nenhuma objeção registrada')",
  "proximoPasso": "ação combinada para dar sequência",
  "proximoPrazo": "YYYY-MM-DD se houver data/prazo mencionado, ou vazio"
}`

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: audioBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!geminiRes.ok) {
      const errTxt = await geminiRes.text()
      log.error({ errTxt, visitaId }, 'Erro Gemini ao transcrever visita de missão')
      res.status(502).json({ success: false, error: 'Falha ao transcrever áudio na IA. Tente novamente.' })
      return
    }

    const geminiData = await geminiRes.json() as any
    const rawText = String(geminiData?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '{}').trim()

    let parsed: any = {}
    try {
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = {
        transcricao: rawText,
        conversado: rawText.slice(0, 500),
        produtosInteresse: '',
        objecoes: '',
        proximoPasso: '',
        proximoPrazo: '',
      }
    }

    const resumoIa = {
      conversado: String(parsed.conversado || '').trim(),
      produtosInteresse: String(parsed.produtosInteresse || '').trim(),
      objecoes: String(parsed.objecoes || '').trim(),
      proximoPasso: String(parsed.proximoPasso || '').trim(),
      proximoPrazo: String(parsed.proximoPrazo || '').trim(),
    }
    const transcricao = String(parsed.transcricao || '').trim()

    // Salvar apenas como rascunho pendente de revisão — o resumo SÓ vale depois de confirmado pelo vendedor!
    const { data: upd, error: updErr } = await supabase
      .from('missao_roteiro_visitas')
      .update({
        audio_path: uploaded?.path || null,
        audio_url: uploaded?.publicUrl || null,
        audio_duracao_seg: duracaoSeg,
        transcricao,
        resumo_ia: resumoIa,
        resumo_confirmado: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visitaId)
      .select('*')
      .single()

    if (updErr) throw updErr
    res.json({ success: true, data: visitaRoteiroFromDb(upd, true) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao processar gravação de visita')
    res.status(500).json({ success: false, error: err.message || 'Erro ao processar gravação' })
  }
})

missoesRouter.post('/visitas/:visitaId/confirmar-resumo', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const visitaId = Number(req.params.visitaId)
    const { data: visita } = await supabase
      .from('missao_roteiro_visitas')
      .select('*, missoes(*)')
      .eq('id', visitaId)
      .single()
    if (!visita) { res.status(404).json({ success: false, error: 'Visita não encontrada' }); return }
    if (!canAccessMission(vendedor, visita.missoes)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const resumoConfirmadoObj = {
      conversado: String(req.body?.conversado || '').trim(),
      produtosInteresse: String(req.body?.produtosInteresse || '').trim(),
      objecoes: String(req.body?.objecoes || '').trim(),
      proximoPasso: String(req.body?.proximoPasso || '').trim(),
      proximoPrazo: String(req.body?.proximoPrazo || '').trim(),
    }
    if (!resumoConfirmadoObj.conversado) {
      res.status(400).json({ success: false, error: 'Preencha o campo "O que foi conversado" antes de confirmar.' })
      return
    }

    const transcricaoRevisada = req.body?.transcricao !== undefined
      ? String(req.body.transcricao || '').trim()
      : visita.transcricao

    const agora = new Date().toISOString()
    const hojeISO = agora.slice(0, 10)

    const { data: upd, error: updErr } = await supabase
      .from('missao_roteiro_visitas')
      .update({
        status: visita.status === 'pendente' ? 'visitado' : visita.status,
        transcricao: transcricaoRevisada,
        resumo_ia: resumoConfirmadoObj,
        resumo_confirmado: true,
        resumo_confirmado_em: agora,
        updated_at: agora,
      })
      .eq('id', visitaId)
      .select('*')
      .single()

    if (updErr) throw updErr

    // Atualizar data do último contato do cliente para cadência + gravar resumo no histórico do cliente
    if (visita.cliente_id) {
      await supabase
        .from('clientes')
        .update({ ultima_interacao: hojeISO })
        .eq('id', visita.cliente_id)

      const linhasResumo = [
        `O que foi conversado: ${resumoConfirmadoObj.conversado}`,
        resumoConfirmadoObj.produtosInteresse ? `Produtos de interesse: ${resumoConfirmadoObj.produtosInteresse}` : '',
        resumoConfirmadoObj.objecoes ? `Objeções: ${resumoConfirmadoObj.objecoes}` : '',
        resumoConfirmadoObj.proximoPasso ? `Próximo passo: ${resumoConfirmadoObj.proximoPasso}${resumoConfirmadoObj.proximoPrazo ? ` (prazo: ${resumoConfirmadoObj.proximoPrazo.split('-').reverse().join('/')})` : ''}` : '',
        `[VISITA_MISSAO_ID:${visita.id}]`,
      ].filter(Boolean).join('\n')

      await supabase.from('interacoes').insert({
        cliente_id: visita.cliente_id,
        tipo: 'reuniao',
        data: agora,
        assunto: `Visita em missão — ${visita.missoes?.nome || 'Viagem comercial'}`,
        descricao: linhasResumo,
        automatico: false,
      })

      await supabase.from('atividades').insert({
        tipo: 'visita',
        descricao: `Visita registrada na missão "${visita.missoes?.nome || ''}": ${resumoConfirmadoObj.conversado.slice(0, 140)}`,
        vendedor_nome: vendedor.nome || 'Vendedor',
      })
    }

    res.json({ success: true, data: visitaRoteiroFromDb(upd, true), ultimaInteracaoAtualizada: hojeISO })
  } catch (err: any) {
    log.error({ err }, 'Erro ao confirmar resumo da visita')
    res.status(500).json({ success: false, error: err.message || 'Erro ao confirmar resumo' })
  }
})

// ─── Status / Roteiro legado ──────────────────────────────────────────────────

missoesRouter.post('/:id/iniciar', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    if (vendedor.cargo !== 'gerente' && missao.status !== 'aprovada') {
      res.status(400).json({ success: false, error: 'A missão precisa ser aprovada pelo gestor antes do início da viagem.' })
      return
    }

    const { data, error: updError } = await supabase.from('missoes').update({ status: 'em_andamento', updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (updError || !data) { res.status(400).json({ success: false, error: updError?.message || 'Erro' }); return }
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao iniciar missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/:id/concluir', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data, error: updError } = await supabase.from('missoes').update({ status: 'concluida', updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (updError || !data) { res.status(400).json({ success: false, error: updError?.message || 'Erro' }); return }
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao concluir missão')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/:id/roteiro', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const visitas: any[] = req.body.visitas
    if (!Array.isArray(visitas) || visitas.length === 0) {
      res.status(400).json({ success: false, error: 'visitas (array) é obrigatório' })
      return
    }

    const inserts = visitas.map((v: any) => ({
      titulo: v.titulo || 'Visita',
      descricao: v.descricao || '',
      data: v.data,
      hora: v.hora || null,
      tipo: 'visita',
      status: 'pendente',
      prioridade: 'alta',
      cliente_id: v.clienteId || null,
      vendedor_id: missao.vendedor_id,
      missao_id: id,
      dia_missao: v.dia,
      ordem: v.ordem,
      amostras_entregues: 0,
    }))

    const { data: tarefas, error: insertError } = await supabase.from('tarefas').insert(inserts).select()
    if (insertError) { res.status(400).json({ success: false, error: insertError.message }); return }

    await supabase.from('missoes').update({ updated_at: new Date().toISOString() }).eq('id', id)
    res.json({ success: true, data: (tarefas || []).map(tarefaFromDb) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar roteiro')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Despesas (Item 6: 8 classes + foto do comprovante) ───────────────────────

missoesRouter.get('/:id/despesas', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('vendedor_id').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data, error: qError } = await supabase.from('missao_despesas').select('*').eq('missao_id', id).order('data', { ascending: false })
    if (qError) throw qError
    res.json({ success: true, data: (data || []).map(despesaFromDb) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao listar despesas')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/:id/despesas', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao, error } = await supabase.from('missoes').select('vendedor_id').eq('id', id).single()
    if (error || !missao) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const body = req.body || {}
    if (!body.tipo || body.valor === undefined || !body.data) {
      res.status(400).json({ success: false, error: 'classe, valor e data são obrigatórios' })
      return
    }

    let comprovanteUrl: string | null = body.comprovanteUrl || null
    if (!comprovanteUrl && body.comprovanteBase64) {
      const mime = String(body.comprovanteMime || 'image/jpeg')
      const ext = mime.includes('png') ? 'png' : mime.includes('pdf') ? 'pdf' : 'jpg'
      const buf = Buffer.from(String(body.comprovanteBase64), 'base64')
      const up = await uploadArquivoMissao(`comprovantes/missao_${id}`, ext, buf, mime)
      comprovanteUrl = up?.publicUrl || `data:${mime};base64,${body.comprovanteBase64}`
    }

    const { data, error: insertError } = await supabase.from('missao_despesas').insert({
      missao_id: id,
      vendedor_id: vendedor.id,
      tipo: String(body.tipo).toUpperCase(),
      valor: Number(body.valor),
      data: body.data,
      comprovante_url: comprovanteUrl,
      observacao: body.observacao || '',
    }).select().single()

    if (insertError || !data) { res.status(400).json({ success: false, error: insertError?.message || 'Erro' }); return }
    res.json({ success: true, data: despesaFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar despesa')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.delete('/:id/despesas/:despesaId', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const despesaId = Number(req.params.despesaId)
    const { data: missao } = await supabase.from('missoes').select('vendedor_id').eq('id', id).single()
    if (!missao || !canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }
    const { error } = await supabase.from('missao_despesas').delete().eq('id', despesaId).eq('missao_id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Check-in / Check-out legado em tarefas ───────────────────────────────────

missoesRouter.post('/tarefas/:id/checkin', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: tarefa, error } = await supabase.from('tarefas').select('*').eq('id', id).single()
    if (error || !tarefa) { res.status(404).json({ success: false, error: 'Tarefa não encontrada' }); return }
    if (vendedor.cargo !== 'gerente' && tarefa.vendedor_id !== vendedor.id) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const { data, error: upd } = await supabase.from('tarefas').update({
      chegada_em: new Date().toISOString(),
      localizacao_chegada: req.body.location || null,
      status: 'em_andamento' as any,
    }).eq('id', id).select().single()
    if (upd || !data) { res.status(400).json({ success: false, error: upd?.message || 'Erro' }); return }
    res.json({ success: true, data: tarefaFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro no check-in')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

missoesRouter.post('/tarefas/:id/checkout', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }

    const id = Number(req.params.id)
    const { data: tarefa, error } = await supabase.from('tarefas').select('*').eq('id', id).single()
    if (error || !tarefa) { res.status(404).json({ success: false, error: 'Tarefa não encontrada' }); return }
    if (vendedor.cargo !== 'gerente' && tarefa.vendedor_id !== vendedor.id) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const body = req.body
    if (!body.resultado?.trim()) {
      res.status(400).json({ success: false, error: 'Para concluir a visita, informe o resultado.' })
      return
    }

    const agora = new Date().toISOString()
    const baseDesc = String(tarefa.descricao || '').split('\n[CONCLUSAO]\n')[0] || ''
    const descricaoComConclusao = `${baseDesc}\n[CONCLUSAO]\n${body.resultado.trim()}`
    const { data, error: upd } = await supabase.from('tarefas').update({
      saida_em: agora,
      localizacao_saida: body.location || null,
      resultado: body.resultado || null,
      descricao: descricaoComConclusao,
      interesse: body.interesse || null,
      produtos_apresentados: body.produtosApresentados || [],
      proximos_passos: body.proximosPassos || null,
      amostras_entregues: body.amostrasEntregues ?? 0,
      status: 'concluida',
      canal_usado: 'visita',
      concluida_em: agora,
      concluida_por: vendedor.nome,
    }).eq('id', id).select().single()
    if (upd || !data) { res.status(400).json({ success: false, error: upd?.message || 'Erro' }); return }
    res.json({ success: true, data: tarefaFromDb(data) })
  } catch (err: any) {
    log.error({ err }, 'Erro no check-out')
    res.status(500).json({ success: false, error: err.message || 'Erro interno' })
  }
})

// ─── Workflow de aprovação (Item 2 e 8) ───────────────────────────────────────

missoesRouter.post('/:id/solicitar-aprovacao', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: m } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (!m) { res.status(404).json({ success: false, error: 'Missão não encontrada' }); return }
    if (!canAccessMission(vendedor, m)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }
    const { error } = await supabase.from('missoes').update({
      status: 'aguardando_aprovacao',
      motivo_reprovacao: null,
      solicitante_id: vendedor.id,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

missoesRouter.post('/:id/aprovar', requireGerente, async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { acao, motivo } = req.body as { acao: 'aprovar' | 'reprovar' | 'recusar' | 'alteracao'; motivo?: string }
    const isRecusa = acao === 'reprovar' || acao === 'recusar'
    if (isRecusa && !String(motivo || '').trim()) {
      res.status(400).json({ success: false, error: 'Informe obrigatoriamente o motivo da recusa.' })
      return
    }
    const status = acao === 'aprovar' ? 'aprovada' : isRecusa ? 'reprovada' : 'rascunho'
    const { data, error } = await supabase.from('missoes').update({
      status,
      aprovado_por: vendedor.id,
      aprovado_em: acao === 'aprovar' ? new Date().toISOString() : null,
      motivo_reprovacao: isRecusa || acao === 'alteracao' ? String(motivo || '').trim() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single()
    if (error) throw error
    res.json({ success: true, data: missaoFromDb(data) })
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})

missoesRouter.post('/:id/encerrar', async (req: any, res: any) => {
  try {
    const vendedor = await currentVendedor(req)
    if (!vendedor) { res.status(401).json({ success: false, error: 'Não autenticado' }); return }
    const id = Number(req.params.id)
    const { data: missao } = await supabase.from('missoes').select('*').eq('id', id).single()
    if (!missao || !canAccessMission(vendedor, missao)) { res.status(403).json({ success: false, error: 'Acesso negado' }); return }

    const [{ data: visitasRot }, { data: despesas }] = await Promise.all([
      supabase.from('missao_roteiro_visitas').select('*').eq('missao_id', id).neq('status', 'removida'),
      supabase.from('missao_despesas').select('*').eq('missao_id', id),
    ])
    const planejadas = (visitasRot || []).length
    const realizadas = (visitasRot || []).filter((x: any) => x.status === 'visitado').length
    const custo = (despesas || []).reduce((s: number, d: any) => s + Number(d.valor || 0), 0)
    const resumo = `${missao.nome}: ${realizadas}/${planejadas} visitas realizadas · realizado R$ ${custo.toFixed(2)} vs previsto R$ ${Number(missao.custo_previsto || 0).toFixed(2)}`
    const { error } = await supabase.from('missoes').update({
      status: 'concluida',
      resumo_ia: resumo,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    res.json({ success: true, data: { resumo } })
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }) }
})
