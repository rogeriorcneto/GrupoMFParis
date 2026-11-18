import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import type { Cliente, Pedido, Tarefa, Vendedor, Interacao, ConsumoProdutoInfo } from '../types'
import { parseRedesSociaisMap } from './socialLinks'
import { diasDesde } from './funil-logic'
import { stageLabels } from './constants'

const STORE_EXCLUIDAS_TIPO = 'store:tarefas_excluidas'

export interface TarefaExcluidaLog {
  tarefa: Tarefa
  etapaClienteNoMomento?: string
  excluidoPor: string
  excluidoEm: string
}

export async function registrarTarefaExcluida(
  tarefa: Tarefa,
  excluidoPor: string,
  etapaClienteNoMomento?: string
): Promise<void> {
  const payload: TarefaExcluidaLog = {
    tarefa,
    etapaClienteNoMomento,
    excluidoPor: excluidoPor || 'Gerente',
    excluidoEm: new Date().toISOString(),
  }
  try {
    await supabase.from('atividades').insert({
      tipo: STORE_EXCLUIDAS_TIPO,
      descricao: JSON.stringify(payload),
      vendedor_nome: payload.excluidoPor,
    })
  } catch {
    // non-critical
  }
}

export async function carregarTarefasExcluidas(): Promise<TarefaExcluidaLog[]> {
  try {
    const { data, error } = await supabase
      .from('atividades')
      .select('descricao, created_at, vendedor_nome')
      .eq('tipo', STORE_EXCLUIDAS_TIPO)
      .order('id', { ascending: false })
      .limit(1000)
    if (error || !data) return []
    const out: TarefaExcluidaLog[] = []
    for (const row of data) {
      try {
        const parsed = JSON.parse(row.descricao || '{}')
        if (parsed?.tarefa?.id) {
          out.push({
            tarefa: parsed.tarefa,
            etapaClienteNoMomento: parsed.etapaClienteNoMomento,
            excluidoPor: parsed.excluidoPor || row.vendedor_nome || 'Gerente',
            excluidoEm: parsed.excluidoEm || row.created_at,
          })
        }
      } catch { /* ignore */ }
    }
    return out
  } catch {
    return []
  }
}

export function stripHtml(raw?: string | null): string {
  if (!raw) return ''
  return String(raw)
    .replace(/<br\s*\/?>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function fmtDateISO(raw?: string | null): string {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const mBr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (mBr) return `${mBr[3]}-${mBr[2]}-${mBr[1]}`
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

/** Formato único exigido no item 9.1: +55 DD 9XXXX-XXXX (ou +55 DD XXXX-XXXX p/ fixo) */
export function fmtPhoneUnico(raw?: string | null): string {
  if (!raw) return ''
  let dig = String(raw).replace(/\D/g, '')
  if (!dig) return ''
  if (dig.startsWith('55') && (dig.length === 12 || dig.length === 13)) dig = dig.slice(2)
  if (dig.length === 11) return `+55 ${dig.slice(0, 2)} ${dig.slice(2, 7)}-${dig.slice(7)}`
  if (dig.length === 10) return `+55 ${dig.slice(0, 2)} ${dig.slice(2, 6)}-${dig.slice(6)}`
  return `+55 ${dig}`
}

export function fmtDocUnico(cnpj?: string | null, cpf?: string | null): string {
  const dCnpj = String(cnpj || '').replace(/\D/g, '')
  if (dCnpj.length === 14) {
    return `${dCnpj.slice(0, 2)}.${dCnpj.slice(2, 5)}.${dCnpj.slice(5, 8)}/${dCnpj.slice(8, 12)}-${dCnpj.slice(12)}`
  }
  const dCpf = String(cpf || '').replace(/\D/g, '')
  if (dCpf.length === 11) {
    return `${dCpf.slice(0, 3)}.${dCpf.slice(3, 6)}.${dCpf.slice(6, 9)}-${dCpf.slice(9)}`
  }
  if (dCnpj.length === 11) {
    return `${dCnpj.slice(0, 3)}.${dCnpj.slice(3, 6)}.${dCnpj.slice(6, 9)}-${dCnpj.slice(9)}`
  }
  return (cnpj || cpf || '').trim()
}

/** Remove qualquer coluna 100% vazia em todas as linhas antes de gerar a planilha */
export function removerColunas100Vazias<T extends Record<string, any>>(rows: T[]): Record<string, any>[] {
  if (rows.length === 0) return []
  const allKeys = Object.keys(rows[0])
  const nonEmptyKeys = allKeys.filter(k =>
    rows.some(r => r[k] !== null && r[k] !== undefined && String(r[k]).trim() !== '')
  )
  return rows.map(r => {
    const clean: Record<string, any> = {}
    for (const k of nonEmptyKeys) clean[k] = r[k] ?? ''
    return clean
  })
}

function extrairSetor(notas?: string): string {
  if (!notas) return ''
  const m = notas.match(/Setor responsável:\s*([^\n|]+)/i) || notas.match(/Setor:\s*([^\n|]+)/i)
  return m ? stripHtml(m[1]) : ''
}

function formatarConsumoProdutos(c: Cliente, familia: Cliente[]): string {
  const nomes = new Set<string>(c.produtosInteresse || [])
  const mapa: Record<string, number> = {}
  ;[...familia].sort((a, b) => a.id - b.id).forEach(cl => {
    ;(cl.produtosInteresse || []).forEach(n => { if (n) nomes.add(n) })
    if (cl.produtosQuantidadesMensais) {
      for (const [prod, info] of Object.entries(cl.produtosQuantidadesMensais)) {
        nomes.add(prod)
        const kg = typeof info === 'number' ? info : (info as ConsumoProdutoInfo)?.kgMes || 0
        mapa[prod] = kg
      }
    }
  })
  return Array.from(nomes)
    .map(n => (mapa[n] ? `${n}: ${mapa[n]} kg/mês` : n))
    .join('; ')
}

export interface FiltroExportacao {
  vendedorIds: number[] // vazio = todos
  dataInicio?: string   // AAAA-MM-DD
  dataFim?: string      // AAAA-MM-DD
}

function chaveEmpresa(c: Cliente): string {
  const doc = (c.cnpj || c.cpf || '').replace(/\D/g, '')
  if (doc.length === 14 || doc.length === 11) return `doc:${doc}`
  if (c.empresaFunilId) return `ef:${c.empresaFunilId}`
  return `nome:${(c.razaoSocial || '').trim().toUpperCase().replace(/\s+/g, ' ')}`
}

export function gerarLinhasCadastroCompleto(
  clientes: Cliente[],
  vendedores: Vendedor[],
  pedidos: Pedido[],
  interacoes: Interacao[],
  filtro: FiltroExportacao
): Record<string, any>[] {
  const vendSet = new Set(filtro.vendedorIds)
  const vendMap = new Map(vendedores.map(v => [v.id, v.nome]))
  const ativos = clientes.filter(c => !c.arquivadoDuplicata && (vendSet.size === 0 || (c.vendedorId && vendSet.has(c.vendedorId))))

  // Agrupa todos os cards por CNPJ/CPF (cadastro único)
  const grupos = new Map<string, Cliente[]>()
  for (const c of ativos) {
    const ch = chaveEmpresa(c)
    const arr = grupos.get(ch) || []
    arr.push(c)
    grupos.set(ch, arr)
  }

  const rankAtivo: Record<string, number> = { negociacao: 5, proposta: 4, amostra: 3, follow_up: 2, 'prospecção': 1, lead: 1 }
  const statusAprovados = new Set(['confirmado', 'faturado', 'expedido', 'entregue'])

  const linhas: Record<string, any>[] = []

  for (const familia of grupos.values()) {
    // Cadastro raiz (!novoCiclo, menor id) + card mais recente (ativo > maior id)
    const cadastro = [...familia].sort((a, b) => (a.novoCiclo ? 1 : 0) - (b.novoCiclo ? 1 : 0) || a.id - b.id)[0]
    const cardRecente = [...familia].sort((a, b) => {
      const rA = rankAtivo[a.etapa] ? 1 : 0
      const rB = rankAtivo[b.etapa] ? 1 : 0
      if (rA !== rB) return rB - rA
      return b.id - a.id
    })[0]

    const dataCad = fmtDateISO(cadastro.criadoEm || cadastro.dataEntradaEtapa)
    if (filtro.dataInicio && dataCad && dataCad < filtro.dataInicio) continue
    if (filtro.dataFim && dataCad && dataCad > filtro.dataFim) continue

    const famIds = new Set(familia.map(x => x.id))
    const pedsFam = pedidos.filter(p => famIds.has(p.clienteId) && p.status !== 'cancelado')
    const intersFam = interacoes.filter(i => famIds.has(i.clienteId))

    // Homologados e Reprovados da família
    const reprovSet = new Set<string>()
    familia.forEach(cl => (cl.produtosDenegados || []).forEach(n => reprovSet.add(n)))
    const homolSet = new Set<string>()
    for (const p of pedsFam) {
      const donoCard = familia.find(cl => cl.id === p.clienteId)
      const isAmAval = p.tipo === 'bonificacao' && !!donoCard?.resultadoAmostra
      const isVendaOk = p.tipo !== 'bonificacao' && statusAprovados.has(p.status)
      if (isAmAval || isVendaOk) {
        for (const it of p.itens || []) {
          if (it.nomeProduto && !reprovSet.has(it.nomeProduto)) homolSet.add(it.nomeProduto)
        }
      }
    }

    const ultInter = intersFam.map(i => fmtDateISO(i.data)).filter(Boolean).sort().pop() || fmtDateISO(cardRecente.ultimaInteracao)
    const ultPed = pedsFam.filter(p => p.tipo !== 'bonificacao').map(p => fmtDateISO(p.dataAprovacao || p.dataCriacao)).filter(Boolean).sort().pop() || fmtDateISO(cardRecente.dataUltimoPedido)

    const redes = parseRedesSociaisMap(cadastro.redesSociais, cadastro)
    const endPartes = [
      cadastro.enderecoRua,
      cadastro.enderecoNumero ? `nº ${cadastro.enderecoNumero}` : '',
      cadastro.enderecoComplemento,
      cadastro.enderecoBairro,
      cadastro.enderecoCidade && cadastro.enderecoEstado ? `${cadastro.enderecoCidade}/${cadastro.enderecoEstado}` : (cadastro.enderecoCidade || cadastro.enderecoEstado),
      cadastro.enderecoCep ? `CEP ${cadastro.enderecoCep}` : '',
    ].map(stripHtml).filter(Boolean)

    linhas.push({
      id: cadastro.id,
      cnpj_cpf: fmtDocUnico(cadastro.cnpj, cadastro.cpf),
      razao_social: stripHtml(cadastro.razaoSocial),
      nome_fantasia: stripHtml(cadastro.nomeFantasia),
      vendedor_dono: (cardRecente.vendedorId && vendMap.get(cardRecente.vendedorId)) || (cadastro.vendedorId && vendMap.get(cadastro.vendedorId)) || '',
      segmento: stripHtml(cadastro.segmento),
      status: cadastro.statusCliente || 'ativo',
      contato_nome: stripHtml(cadastro.contatoNome),
      contato_setor: extrairSetor(cadastro.notas),
      contato_celular: fmtPhoneUnico(cadastro.contatoCelular || cadastro.contatoTelefone),
      whatsapp: fmtPhoneUnico(cadastro.whatsapp || cadastro.contatoCelular || cadastro.contatoTelefone),
      contato_fixo: fmtPhoneUnico(cadastro.contatoTelefoneFixo),
      contato_email: stripHtml(cadastro.contatoEmail),
      endereco_completo: endPartes.join(', ') || stripHtml(cadastro.endereco),
      cnae: stripHtml(cadastro.cnaePrimario),
      instagram: redes.instagram || '',
      facebook: redes.facebook || '',
      linkedin: redes.linkedin || '',
      tiktok: redes.tiktok || '',
      youtube: redes.youtube || '',
      twitter: redes.twitter || '',
      website: redes.website || '',
      produtos_interesse_kg_mes: formatarConsumoProdutos(cardRecente, familia),
      itens_homologados: Array.from(homolSet).join('; '),
      itens_reprovados: Array.from(reprovSet).join('; '),
      codigo_omie: cadastro.omieCodigo || '',
      data_cadastro: dataCad,
      cadastrado_por: stripHtml(cadastro.criadoPorNome),
      ultima_atividade: ultInter,
      ultimo_pedido: ultPed,
      etapa_card_mais_recente: stageLabels[cardRecente.etapa] || cardRecente.etapa,
      dias_na_etapa: diasDesde(cardRecente.dataEntradaEtapa),
    })
  }

  return removerColunas100Vazias(linhas)
}

export function gerarPlanilhasTarefasCompletas(
  tarefas: Tarefa[],
  tarefasExcluidas: TarefaExcluidaLog[],
  clientes: Cliente[],
  vendedores: Vendedor[],
  filtro: FiltroExportacao,
  hojeISO = new Date().toISOString().slice(0, 10)
): { abaTarefas: Record<string, any>[]; abaAuditoria: Record<string, any>[] } {
  const vendSet = new Set(filtro.vendedorIds)
  const vendMap = new Map(vendedores.map(v => [v.id, v.nome]))
  const cliMap = new Map(clientes.map(c => [c.id, c]))

  const passaFiltro = (t: Tarefa): boolean => {
    const cli = t.clienteId ? cliMap.get(t.clienteId) : undefined
    const donoId = t.vendedorId || cli?.vendedorId
    if (vendSet.size > 0 && (!donoId || !vendSet.has(donoId))) return false
    const dtRef = fmtDateISO(t.data || t.criadoEm)
    if (filtro.dataInicio && dtRef && dtRef < filtro.dataInicio) return false
    if (filtro.dataFim && dtRef && dtRef > filtro.dataFim) return false
    return true
  }

  const montarLinha = (t: Tarefa, excluidaLog?: TarefaExcluidaLog): Record<string, any> => {
    const cli = t.clienteId ? cliMap.get(t.clienteId) : undefined
    const reags = Array.isArray(t.reagendamentos) ? t.reagendamentos : []
    const prazoAtual = fmtDateISO(t.data)
    const prazoOriginal = reags.length > 0 ? fmtDateISO(reags[0].dataOriginal) : prazoAtual
    const atrasada = !excluidaLog && t.status === 'pendente' && Boolean(prazoAtual && prazoAtual < hojeISO)
    const diasAtraso = atrasada && prazoAtual
      ? Math.max(0, Math.floor((Date.parse(hojeISO) - Date.parse(prazoAtual)) / 86_400_000))
      : 0

    const statusLabel = excluidaLog
      ? 'Excluída'
      : t.status === 'concluida'
        ? 'Concluída'
        : atrasada
          ? 'Atrasada'
          : 'Pendente'

    const donoId = cli?.vendedorId || t.vendedorId
    const respNome = (t.vendedorId && vendMap.get(t.vendedorId)) || (donoId && vendMap.get(donoId)) || ''
    const isAuto = Boolean(t.origemAutomacaoId) || /^(Cobrar |Follow-up |Preparar |Acompanhar |Coletar satisfação|Retorno:)/i.test(t.titulo || '')

    return {
      id: t.id,
      cliente: stripHtml(cli?.razaoSocial || ''),
      cnpj: cli ? fmtDocUnico(cli.cnpj, cli.cpf) : '',
      vendedor_dono: (donoId && vendMap.get(donoId)) || '',
      tipo: t.tipo,
      origem: isAuto ? 'automação' : 'manual',
      titulo: stripHtml(t.titulo),
      descricao: stripHtml(t.descricao),
      criada_em: fmtDateISO(t.criadoEm || prazoOriginal),
      criada_por: isAuto ? 'Automação CRM' : (t.criadoPor || respNome),
      responsavel: respNome,
      prazo_original: prazoOriginal,
      prazo_atual: prazoAtual,
      num_reagendamentos: reags.length,
      status: statusLabel,
      concluida_em: t.status === 'concluida' ? fmtDateISO(t.concluidaEm || t.data) : '',
      concluida_por: t.status === 'concluida' ? (t.concluidaPor || respNome) : '',
      texto_conclusao: stripHtml(t.conclusao),
      dias_atraso: diasAtraso,
      etapa_card: excluidaLog?.etapaClienteNoMomento || (cli ? (stageLabels[cli.etapa] || cli.etapa) : ''),
    }
  }

  const tarefasAtivasFiltradas = tarefas.filter(passaFiltro)
  const excluidasFiltradas = tarefasExcluidas.filter(l => passaFiltro(l.tarefa))

  const linhasTarefas = [
    ...tarefasAtivasFiltradas.map(t => montarLinha(t)),
    ...excluidasFiltradas.map(l => montarLinha(l.tarefa, l)),
  ]

  // Aba Auditoria: exclusões + cada reagendamento individual (data anterior -> nova data, quem alterou, quando)
  const auditoria: Record<string, any>[] = []

  for (const l of excluidasFiltradas) {
    const cli = l.tarefa.clienteId ? cliMap.get(l.tarefa.clienteId) : undefined
    auditoria.push({
      tipo_evento: 'Tarefa Excluída',
      tarefa_id: l.tarefa.id,
      cliente: stripHtml(cli?.razaoSocial || ''),
      cnpj: cli ? fmtDocUnico(cli.cnpj, cli.cpf) : '',
      titulo_tarefa: stripHtml(l.tarefa.titulo),
      transicao_prazo: fmtDateISO(l.tarefa.data),
      motivo: 'Exclusão manual',
      quem_alterou: l.excluidoPor,
      quando: fmtDateISO(l.excluidoEm) + (l.excluidoEm?.includes('T') ? ' ' + l.excluidoEm.slice(11, 16) : ''),
    })
  }

  const todasParaReag = [...tarefasAtivasFiltradas, ...excluidasFiltradas.map(x => x.tarefa)]
  for (const t of todasParaReag) {
    const reags = Array.isArray(t.reagendamentos) ? t.reagendamentos : []
    if (reags.length === 0) continue
    const cli = t.clienteId ? cliMap.get(t.clienteId) : undefined
    const respNome = (t.vendedorId && vendMap.get(t.vendedorId)) || ''
    reags.forEach((r, idx) => {
      const novaData = idx + 1 < reags.length ? fmtDateISO(reags[idx + 1].dataOriginal) : fmtDateISO(t.data)
      auditoria.push({
        tipo_evento: 'Reagendamento',
        tarefa_id: t.id,
        cliente: stripHtml(cli?.razaoSocial || ''),
        cnpj: cli ? fmtDocUnico(cli.cnpj, cli.cpf) : '',
        titulo_tarefa: stripHtml(t.titulo),
        transicao_prazo: `${fmtDateISO(r.dataOriginal)} → ${novaData}`,
        motivo: stripHtml(r.motivo),
        quem_alterou: r.alteradoPor || respNome || 'Usuário',
        quando: fmtDateISO(r.reagendadoEm) + (r.reagendadoEm?.includes('T') ? ' ' + r.reagendadoEm.slice(11, 16) : ''),
      })
    })
  }

  return {
    abaTarefas: removerColunas100Vazias(linhasTarefas),
    abaAuditoria: auditoria,
  }
}

export function baixarWorkbookXlsx(sheets: { nome: string; dados: Record<string, any>[] }[], nomeArquivo: string): void {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = s.dados.length > 0
      ? XLSX.utils.json_to_sheet(s.dados)
      : XLSX.utils.aoa_to_sheet([['Nenhum registro encontrado para os filtros selecionados']])
    XLSX.utils.book_append_sheet(wb, ws, s.nome.slice(0, 31))
  }
  XLSX.writeFile(wb, nomeArquivo)
}
