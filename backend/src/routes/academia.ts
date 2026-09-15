import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { log } from '../logger.js'
import { supabase } from '../supabase.js'
import {
  academiaLinkStatus,
  createAcademiaLink,
  fetchAcademiaLinkByToken,
  fetchAcademiaLinks,
  fetchAcademiaSessionCounts,
  fetchRoleplaySessionsByAcademiaLink,
  insertAcademiaRoleplaySession,
  updateAcademiaLink,
  type AcademiaLinkRow,
} from '../database.js'

const router = Router()

// ── Helpers ──

async function validateToken(token: string): Promise<{ link: AcademiaLinkRow } | { error: string }> {
  if (!token || token.length < 16) return { error: 'Link inválido' }
  const link = await fetchAcademiaLinkByToken(token)
  if (!link) return { error: 'Link inválido' }
  const status = academiaLinkStatus(link)
  if (status === 'revogado') return { error: 'Este acesso foi revogado' }
  if (status === 'expirado') return { error: 'Este link expirou' }
  return { link }
}

function publicLink(l: AcademiaLinkRow, counts?: { total: number; ultima: string | null; segundos: number }) {
  return {
    id: l.id,
    token: l.token,
    nomeCandidato: l.nome_candidato,
    validoDe: l.valido_de,
    validoAte: l.valido_ate,
    ativo: l.ativo,
    status: academiaLinkStatus(l),
    createdAt: l.created_at,
    sessoes: counts?.total ?? 0,
    ultimaAtividade: counts?.ultima ?? null,
    tempoSegundos: counts?.segundos ?? 0,
  }
}

// ── Endpoints do candidato (sem login — acesso via token) ──

router.get('/validar', async (req: Request, res: Response) => {
  try {
    const result = await validateToken(String(req.query.token || ''))
    if ('error' in result) { res.status(403).json({ valido: false, error: result.error }); return }
    res.json({ valido: true, nomeCandidato: result.link.nome_candidato, expiraEm: result.link.valido_ate })
  } catch (err: any) {
    log.error({ err }, 'Erro ao validar link de academia')
    res.status(500).json({ valido: false, error: 'Erro ao validar acesso' })
  }
})

// Módulos e perfis de treino (mesmos da Academia de Vendas)
router.get('/config', async (req: Request, res: Response) => {
  try {
    const result = await validateToken(String(req.query.token || ''))
    if ('error' in result) { res.status(403).json({ error: result.error }); return }
    const [mod, perf] = await Promise.all([
      supabase.from('modulos_treinamento').select('*').eq('ativo', true).order('ordem'),
      supabase.from('perfis_treinamento').select('*').eq('ativo', true).order('ordem'),
    ])
    if (mod.error) throw mod.error
    if (perf.error) throw perf.error
    res.json({ modulos: mod.data || [], perfis: perf.data || [] })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar config de academia')
    res.status(500).json({ error: err?.message || 'Erro ao buscar configuração' })
  }
})

// Histórico do próprio candidato
router.get('/sessoes', async (req: Request, res: Response) => {
  try {
    const result = await validateToken(String(req.query.token || ''))
    if ('error' in result) { res.status(403).json({ error: result.error }); return }
    const sessoes = await fetchRoleplaySessionsByAcademiaLink(result.link.id)
    res.json({ sessoes })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar sessões de candidato')
    res.status(500).json({ error: err?.message || 'Erro ao buscar sessões' })
  }
})

router.post('/sessao', async (req: Request, res: Response) => {
  try {
    const { token, modulo, perfilId, perfilNome, mensagens, duracaoSegundos, nota, feedback } = req.body || {}
    const result = await validateToken(String(token || ''))
    if ('error' in result) { res.status(403).json({ error: result.error }); return }
    if (!Array.isArray(mensagens)) {
      res.status(400).json({ error: 'Dados da sessão inválidos' })
      return
    }
    const row = await insertAcademiaRoleplaySession(result.link.id, {
      modulo: String(modulo || ''),
      perfilId: String(perfilId || ''),
      perfilNome: String(perfilNome || ''),
      mensagens,
      duracaoSegundos: Number(duracaoSegundos || 0),
      nota: nota == null ? null : Number(nota),
      feedback,
    })
    res.json({ success: true, data: row })
  } catch (err: any) {
    log.error({ err }, 'Erro ao salvar sessão de candidato')
    res.status(500).json({ error: err?.message || 'Erro ao salvar sessão' })
  }
})

export const academiaCandidatoRouter = router

// ── Endpoints do gerente (montados com requireAuth + requireGerente no index) ──

const gerente = Router()

gerente.post('/links', async (req: Request, res: Response) => {
  try {
    const { nomeCandidato, diasValidade, validoAte } = req.body || {}
    if (!nomeCandidato?.trim()) {
      res.status(400).json({ error: 'Nome do candidato é obrigatório' })
      return
    }
    const ate = validoAte
      ? new Date(validoAte)
      : new Date(Date.now() + Number(diasValidade || 7) * 86400000)
    if (isNaN(ate.getTime())) {
      res.status(400).json({ error: 'Data de validade inválida' })
      return
    }
    const token = crypto.randomBytes(24).toString('hex')
    const link = await createAcademiaLink({
      token,
      nomeCandidato: nomeCandidato.trim(),
      validoAte: ate.toISOString(),
      criadoPor: (req as any).vendedorId || null,
    })
    res.json({ success: true, link: publicLink(link) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao criar link de academia')
    res.status(500).json({ error: err?.message || 'Erro ao criar link' })
  }
})

gerente.get('/links', async (_req: Request, res: Response) => {
  try {
    const [links, counts] = await Promise.all([fetchAcademiaLinks(), fetchAcademiaSessionCounts()])
    res.json({ links: links.map(l => publicLink(l, counts.get(l.id))) })
  } catch (err: any) {
    log.error({ err }, 'Erro ao listar links de academia')
    res.status(500).json({ error: err?.message || 'Erro ao listar links' })
  }
})

gerente.patch('/links/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const { ativo, validoAte, nomeCandidato } = req.body || {}
    await updateAcademiaLink(id, { ativo, validoAte, nomeCandidato })
    res.json({ success: true })
  } catch (err: any) {
    log.error({ err }, 'Erro ao atualizar link de academia')
    res.status(500).json({ error: err?.message || 'Erro ao atualizar link' })
  }
})

gerente.get('/links/:id/sessoes', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return }
    const sessoes = await fetchRoleplaySessionsByAcademiaLink(id)
    res.json({ sessoes })
  } catch (err: any) {
    log.error({ err }, 'Erro ao buscar sessões do candidato')
    res.status(500).json({ error: err?.message || 'Erro ao buscar sessões' })
  }
})

export const academiaGerenteRouter = gerente
