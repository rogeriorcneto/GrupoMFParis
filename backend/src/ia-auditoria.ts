import { supabase } from './supabase.js'
import { log } from './logger.js'

export type ClassificacaoIA = 'OK' | 'Fraco' | 'Incoerente'

export interface RegistroAuditoriaIA {
  chave: string // ex: "tarefa:123" ou "cadastro:45:email_boleto:2026-11-25..."
  tipoRegistro: 'tarefa' | 'cadastro'
  tarefaId?: number
  clienteId?: number
  clienteNome?: string
  vendedorId?: number
  campoCadastro?: string
  canalUsado?: string
  objetivo?: string
  conclusao?: string
  proximoPassoResumo?: string
  justificativa?: string
  classificacao: ClassificacaoIA
  motivo: string
  analisadoEm: string
}

const GENERICOS_EXATOS = new Set([
  'ok', 'okay', 'feito', 'feita', 'liguei', 'ligado', 'enviado', 'enviada',
  'concluido', 'concluído', 'concluida', 'concluída', 'realizado', 'realizada',
  'contato feito', 'tudo certo', 'tudo ok', 'ciente', 'sem novidade', 'sim', 'nao', 'não',
  'sem interesse', 'cliente sem interesse', 'nao tem', 'não tem', 'nao possui', 'não possui',
])

function normalizarTexto(s?: string | null): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pré-análise determinística instantânea para casos claros (e fallback caso a API Gemini falhe).
 */
export function classificarRegistroDeterministico(input: {
  tipoRegistro: 'tarefa' | 'cadastro'
  canalUsado?: string
  objetivo?: string
  conclusao?: string
  proximoPassoResumo?: string
  justificativaPrazoLongo?: string
  justificativaCadastro?: string
  campoCadastro?: string
  textosAnterioresVendedor?: string[]
  justificativasRepetidasCount?: number
}): { classificacao: ClassificacaoIA; motivo: string; definitivo: boolean } {
  if (input.tipoRegistro === 'cadastro') {
    const just = String(input.justificativaCadastro || '').trim()
    const norm = normalizarTexto(just)
    if (!norm || GENERICOS_EXATOS.has(norm) || norm.split(' ').length < 3 || norm.length < 10) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de cadastro genérica ou curta demais para explicar a ausência do dado.',
        definitivo: true,
      }
    }
    if ((input.justificativasRepetidasCount || 0) >= 3) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de cadastro repetida de forma padronizada em vários clientes.',
        definitivo: true,
      }
    }
    return {
      classificacao: 'OK',
      motivo: 'Justificativa de cadastro específica e coerente com o campo informado.',
      definitivo: false,
    }
  }

  // Registro de tarefa finalizada
  const conc = String(input.conclusao || '').trim()
  const concNorm = normalizarTexto(conc)
  if (!concNorm || GENERICOS_EXATOS.has(concNorm) || concNorm.length < 10 || concNorm.split(' ').length < 3) {
    return {
      classificacao: 'Fraco',
      motivo: `Conclusão vazia ou genérica ("${conc.slice(0, 30) || 'vazia'}"), sem relatar o que foi conversado.`,
      definitivo: true,
    }
  }

  // Texto copiado de outros registros do vendedor
  if (input.textosAnterioresVendedor?.some(ant => normalizarTexto(ant) === concNorm)) {
    return {
      classificacao: 'Fraco',
      motivo: 'Texto da conclusão copiado/repetido de outro registro anterior.',
      definitivo: true,
    }
  }

  // Incoerência explícita entre canal usado e relato da conclusão
  const canal = (input.canalUsado || '').toLowerCase()
  if ((canal === 'visita' || canal === 'reuniao') && /\b(mandei zap|mandei whats|mensagem no whats|caixa postal|nao atendeu ligacao)\b/.test(concNorm) && !/\b(presencial|visita|reuniao)\b/.test(concNorm)) {
    return {
      classificacao: 'Incoerente',
      motivo: `O canal marcado foi ${canal}, mas a conclusão descreve apenas tentativa remota por mensagem/telefone.`,
      definitivo: true,
    }
  }
  if (canal === 'email' && /\b(falei ao telefone|liguei e conversei|visitei a loja)\b/.test(concNorm) && !/\b(email|e mail)\b/.test(concNorm)) {
    return {
      classificacao: 'Incoerente',
      motivo: 'O canal marcado foi E-mail, mas a conclusão relata contato por telefone ou visita.',
      definitivo: true,
    }
  }

  // Incoerência entre conclusão de encerramento definitivo e próximo passo comercial imediato
  const proxNorm = normalizarTexto(input.proximoPassoResumo)
  if (/\b(empresa fechou|encerrou atividades|cnpj baixado|faliu)\b/.test(concNorm) && /\b(oferta|cotacao|enviar proposta|vender)\b/.test(proxNorm)) {
    return {
      classificacao: 'Incoerente',
      motivo: 'A conclusão informa que a empresa encerrou atividades, mas o próximo passo mantém oferta comercial.',
      definitivo: true,
    }
  }

  // Justificativa de prazo longo genérica ou repetida
  if (input.justificativaPrazoLongo !== undefined && String(input.justificativaPrazoLongo).trim() !== '') {
    const justNorm = normalizarTexto(input.justificativaPrazoLongo)
    if (GENERICOS_EXATOS.has(justNorm) || justNorm.length < 10 || justNorm.split(' ').length < 3) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de prazo acima de 15 dias é genérica e não explica o motivo operacional.',
        definitivo: true,
      }
    }
    if ((input.justificativasRepetidasCount || 0) >= 3) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de prazo longo repetida em vários clientes sem contexto individual.',
        definitivo: true,
      }
    }
  }

  return {
    classificacao: 'OK',
    motivo: 'Conclusão descreve o contato realizado de forma coerente com o canal e o próximo passo.',
    definitivo: false,
  }
}

async function carregarContextoIACrm(): Promise<string> {
  try {
    const { data } = await supabase
      .from('ia_contexto')
      .select('titulo, conteudo')
      .eq('ativo', true)
      .limit(5)
    if (data && data.length > 0) {
      return data.map((r: any) => `${r.titulo}: ${String(r.conteudo || '').slice(0, 300)}`).join('\n')
    }
  } catch { /* fallback */ }
  return 'CRM Comercial B2B Grupo MF Paris — vendas de ingredientes lácteos e alimentícios industriais.'
}

async function classificarComGemini(promptUsuario: string, contextoCrm: string): Promise<{ classificacao: ClassificacaoIA; motivo: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: `Você é o auditor comercial do CRM MF Paris (${contextoCrm}). Avalie o registro comercial abaixo e responda SOMENTE em JSON válido no formato {"classificacao":"OK"|"Fraco"|"Incoerente","motivo":"uma única frase objetiva em português"}. Critérios: "Fraco" para conclusão/justificativa vaga, genérica ou copiada; "Incoerente" quando canal, objetivo, conclusão e próximo passo se contradizem; "OK" quando há relato real e coerente do contato ou motivo concreto.`,
            }],
          },
          contents: [{ role: 'user', parts: [{ text: promptUsuario }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 180,
            responseMimeType: 'application/json',
          },
        }),
      }
    )
    if (!res.ok) return null
    const json: any = await res.json()
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsed = JSON.parse(rawText)
    if (['OK', 'Fraco', 'Incoerente'].includes(parsed?.classificacao) && parsed?.motivo) {
      return {
        classificacao: parsed.classificacao as ClassificacaoIA,
        motivo: String(parsed.motivo).trim().slice(0, 240),
      }
    }
  } catch (err) {
    log.warn({ err }, 'Auditoria IA: falha na chamada Gemini, usando regra determinística')
  }
  return null
}

export async function listarAuditoriasIA(): Promise<RegistroAuditoriaIA[]> {
  const { data, error } = await supabase
    .from('atividades')
    .select('id, descricao, created_at')
    .eq('tipo', 'store:ia_auditoria')
    .order('id', { ascending: true })
    .limit(5000)
  if (error || !data) return []
  const porChave = new Map<string, RegistroAuditoriaIA>()
  for (const row of data) {
    try {
      const parsed = JSON.parse(row.descricao || '{}')
      if (parsed?.chave && parsed?.classificacao) {
        porChave.set(parsed.chave, parsed as RegistroAuditoriaIA)
      }
    } catch { /* ignore */ }
  }
  return Array.from(porChave.values()).sort((a, b) => String(b.analisadoEm || '').localeCompare(String(a.analisadoEm || '')))
}

async function salvarAuditoriaIA(registro: RegistroAuditoriaIA): Promise<void> {
  await supabase.from('atividades').insert({
    tipo: 'store:ia_auditoria',
    descricao: JSON.stringify(registro),
    vendedor_nome: 'Agente IA',
  })
}

export async function auditarTarefaFinalizada(tarefaId: number): Promise<RegistroAuditoriaIA | null> {
  const { data: t } = await supabase.from('tarefas').select('*').eq('id', tarefaId).maybeSingle()
  if (!t || t.status !== 'concluida') return null

  const rawDesc = String(t.descricao || '')
  const sep = '\n[CONCLUSAO]\n'
  const idx = rawDesc.indexOf(sep)
  const conclusao = idx >= 0 ? rawDesc.slice(idx + sep.length) : String(t.resultado || '')

  let proximoPassoResumo = ''
  if (t.proxima_tarefa_id) {
    const { data: prox } = await supabase.from('tarefas').select('titulo, descricao, tipo, objetivo, data, justificativa_prazo_longo').eq('id', t.proxima_tarefa_id).maybeSingle()
    if (prox) {
      proximoPassoResumo = `${prox.tipo || ''} (${prox.objetivo || ''}) em ${prox.data || ''}: ${prox.descricao || prox.titulo || ''}`
    }
  }

  let clienteNome = ''
  if (t.cliente_id) {
    const { data: cli } = await supabase.from('clientes').select('razao_social').eq('id', t.cliente_id).maybeSingle()
    clienteNome = cli?.razao_social || ''
  }

  // Buscar conclusões recentes do mesmo vendedor para checar texto copiado/repetido
  const textosAnteriores: string[] = []
  let justRepetidasCount = 0
  if (t.vendedor_id) {
    const { data: rec } = await supabase
      .from('tarefas')
      .select('id, descricao, justificativa_prazo_longo')
      .eq('vendedor_id', t.vendedor_id)
      .eq('status', 'concluida')
      .neq('id', tarefaId)
      .order('id', { ascending: false })
      .limit(40)
    const justAlvoNorm = normalizarTexto(t.justificativa_prazo_longo)
    for (const r of rec || []) {
      const rd = String(r.descricao || '')
      const ri = rd.indexOf(sep)
      if (ri >= 0) textosAnteriores.push(rd.slice(ri + sep.length))
      if (justAlvoNorm && normalizarTexto(r.justificativa_prazo_longo) === justAlvoNorm) justRepetidasCount++
    }
  }

  const pre = classificarRegistroDeterministico({
    tipoRegistro: 'tarefa',
    canalUsado: t.canal_usado || t.tipo,
    objetivo: t.objetivo,
    conclusao,
    proximoPassoResumo,
    justificativaPrazoLongo: t.justificativa_prazo_longo,
    textosAnterioresVendedor: textosAnteriores,
    justificativasRepetidasCount: justRepetidasCount,
  })

  let finalClass = pre.classificacao
  let finalMotivo = pre.motivo

  if (!pre.definitivo) {
    const ctx = await carregarContextoIACrm()
    const prompt = [
      `Cliente: ${clienteNome || 'N/D'}`,
      `Canal usado: ${t.canal_usado || t.tipo || 'N/D'}`,
      `Objetivo: ${t.objetivo || 'N/D'}`,
      `Conclusão escrita pelo vendedor: "${conclusao}"`,
      `Próximo passo agendado: "${proximoPassoResumo || 'Já possuía tarefa aberta'}"`,
      t.justificativa_prazo_longo ? `Justificativa de prazo >15 dias: "${t.justificativa_prazo_longo}"` : '',
    ].filter(Boolean).join('\n')
    const ia = await classificarComGemini(prompt, ctx)
    if (ia) {
      finalClass = ia.classificacao
      finalMotivo = ia.motivo
    }
  }

  const reg: RegistroAuditoriaIA = {
    chave: `tarefa:${tarefaId}`,
    tipoRegistro: 'tarefa',
    tarefaId,
    clienteId: t.cliente_id || undefined,
    clienteNome: clienteNome || undefined,
    vendedorId: t.vendedor_id || undefined,
    canalUsado: t.canal_usado || t.tipo || undefined,
    objetivo: t.objetivo || undefined,
    conclusao,
    proximoPassoResumo: proximoPassoResumo || undefined,
    justificativa: t.justificativa_prazo_longo || undefined,
    classificacao: finalClass,
    motivo: finalMotivo,
    analisadoEm: new Date().toISOString(),
  }
  await salvarAuditoriaIA(reg)
  return reg
}

export async function auditarJustificativaCadastro(params: {
  clienteId: number
  campo: string
  justificativa: string
  vendedorId?: number
}): Promise<RegistroAuditoriaIA | null> {
  const { data: cli } = await supabase.from('clientes').select('id, razao_social, vendedor_id').eq('id', params.clienteId).maybeSingle()
  const vendId = params.vendedorId || cli?.vendedor_id || undefined

  let repetidasCount = 0
  if (vendId) {
    const { data: outros } = await supabase
      .from('clientes')
      .select('id, cadastro_justificativas')
      .eq('vendedor_id', vendId)
      .neq('id', params.clienteId)
      .limit(150)
    const alvoNorm = normalizarTexto(params.justificativa)
    for (const o of outros || []) {
      const js = Array.isArray(o.cadastro_justificativas) ? o.cadastro_justificativas : []
      if (js.some((j: any) => j?.ativo !== false && normalizarTexto(j?.justificativa) === alvoNorm)) {
        repetidasCount++
      }
    }
  }

  const pre = classificarRegistroDeterministico({
    tipoRegistro: 'cadastro',
    campoCadastro: params.campo,
    justificativaCadastro: params.justificativa,
    justificativasRepetidasCount: repetidasCount,
  })

  let finalClass = pre.classificacao
  let finalMotivo = pre.motivo
  if (!pre.definitivo) {
    const ctx = await carregarContextoIACrm()
    const ia = await classificarComGemini(
      `Cliente: ${cli?.razao_social || params.clienteId}\nCampo marcado como "Não possui": ${params.campo}\nJustificativa do vendedor: "${params.justificativa}"`,
      ctx,
    )
    if (ia) {
      finalClass = ia.classificacao
      finalMotivo = ia.motivo
    }
  }

  const reg: RegistroAuditoriaIA = {
    chave: `cadastro:${params.clienteId}:${params.campo}`,
    tipoRegistro: 'cadastro',
    clienteId: params.clienteId,
    clienteNome: cli?.razao_social || undefined,
    vendedorId: vendId,
    campoCadastro: params.campo,
    justificativa: params.justificativa,
    classificacao: finalClass,
    motivo: finalMotivo,
    analisadoEm: new Date().toISOString(),
  }
  await salvarAuditoriaIA(reg)
  return reg
}

let _lastDailyAuditAt = 0

export async function rodarAuditoriaIADiaria(limite = 25): Promise<number> {
  if (Date.now() - _lastDailyAuditAt < 12 * 3600 * 1000) return 0
  _lastDailyAuditAt = Date.now()
  try {
    const existentes = await listarAuditoriasIA()
    const chavesAuditadas = new Set(existentes.map(e => e.chave))

    const desde = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: tarefasRecentes } = await supabase
      .from('tarefas')
      .select('id, concluida_em')
      .eq('status', 'concluida')
      .not('concluida_em', 'is', null)
      .gte('concluida_em', desde)
      .order('id', { ascending: false })
      .limit(100)

    let auditados = 0
    for (const t of tarefasRecentes || []) {
      if (auditados >= limite) break
      if (chavesAuditadas.has(`tarefa:${t.id}`)) continue
      await auditarTarefaFinalizada(t.id)
      auditados++
    }
    return auditados
  } catch (err) {
    log.warn({ err }, 'Falha na rodada diária de auditoria IA')
    return 0
  }
}
