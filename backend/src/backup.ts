import { gzipSync } from 'node:zlib'
import { supabase } from './supabase.js'
import { log } from './logger.js'

/**
 * Backup/export da base (contrato Anexo I, item 3.2).
 *
 * Sem acesso ao dashboard do Supabase não há pg_dump — então o backup é um
 * JSON completo de todas as tabelas, exportado via service role, com:
 *   - endpoint gerente para download manual
 *   - rotina diária que sobe o arquivo para o bucket `backups` no Storage
 *     (retenção: últimos 30 dias)
 */

// Todas as tabelas conhecidas (backend + frontend). As que não existirem são
// puladas e listadas em `skipped`.
const TABLES = [
  'ai_conversations',
  'atividades',
  'automacoes',
  'automacoes_execucoes',
  'bot_config',
  'cadencia_steps',
  'cadencias',
  'campanhas',
  'categorias_financeiras',
  'chat_mensagens',
  'classes_clientes',
  'clientes',
  'configuracoes',
  'contas_bancarias',
  'documentos',
  'documentos_categorias',
  'fretes',
  'funcionarios',
  'gravacoes_chamada',
  'historico_etapas',
  'ia_contexto',
  'interacoes',
  'itens_pedido',
  'jobs_automacao',
  'lancamentos_financeiros',
  'leads_rf',
  'mensagens_automacao',
  'missao_despesas',
  'missoes',
  'modulos_treinamento',
  'notificacoes',
  'ordens_producao',
  'pedidos',
  'perfis_treinamento',
  'produtos',
  'propostas',
  'regras_automacao',
  'roleplay_sessions',
  'tarefas',
  'templates',
  'templates_msgs',
  'tempo_tela',
  'transportadoras',
  'vendedores',
  'whatsapp_messages',
  'whatsapp_session',
]

const PAGE = 1000
const MAX_ROWS_PER_TABLE = 200_000
const BUCKET = 'backups'
const RETENTION = 30

export interface BackupDump {
  json: string
  tables: number
  rows: number
  skipped: string[]
}

async function exportTable(name: string): Promise<{ rows: any[] | null; error?: string }> {
  const rows: any[] = []
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE) {
    const { data, error } = await supabase.from(name).select('*').range(from, from + PAGE - 1)
    if (error) return { rows: null, error: error.message }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return { rows }
}

export async function generateBackupDump(): Promise<BackupDump> {
  const out: Record<string, any[]> = {}
  const skipped: string[] = []
  let total = 0
  for (const t of TABLES) {
    const { rows, error } = await exportTable(t)
    if (error || rows === null) {
      skipped.push(t)
      continue
    }
    out[t] = rows
    total += rows.length
  }
  const payload = {
    gerado_em: new Date().toISOString(),
    versao: 1,
    tabelas: out,
  }
  return { json: JSON.stringify(payload), tables: Object.keys(out).length, rows: total, skipped }
}

async function ensureBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some(b => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false })
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw error
    }
  }
}

export function backupFileName(d = new Date()): string {
  return `backup-${d.toISOString().slice(0, 10)}.json`
}

/** Gera o dump compactado e sobe para o bucket `backups`. Retorna o path ou null em erro. */
export async function runDailyBackup(): Promise<string | null> {
  try {
    await ensureBucket()
    const file = `${backupFileName()}.gz`

    // Já existe backup de hoje?
    const { data: existing } = await supabase.storage.from(BUCKET).list('', { search: file })
    if (existing?.some(f => f.name === file)) return file

    const dump = await generateBackupDump()
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(file, gzipSync(dump.json), { contentType: 'application/gzip', upsert: false })
    if (error) {
      log.error({ err: error }, 'Falha ao subir backup diário')
      return null
    }
    log.info(`💾 Backup diário salvo: ${file} (${dump.tables} tabelas, ${dump.rows} linhas${dump.skipped.length ? `, puladas: ${dump.skipped.join(',')}` : ''})`)

    // Retenção: manter só os últimos RETENTION arquivos
    const { data: files } = await supabase.storage.from(BUCKET).list('', { sortBy: { column: 'name', order: 'desc' } })
    const extras = (files || []).filter(f => f.name.startsWith('backup-')).slice(RETENTION)
    if (extras.length) {
      await supabase.storage.from(BUCKET).remove(extras.map(f => f.name))
      log.info(`🧹 ${extras.length} backups antigos removidos (retenção ${RETENTION})`)
    }
    return file
  } catch (err) {
    log.error({ err }, 'Erro na rotina de backup diário')
    return null
  }
}
