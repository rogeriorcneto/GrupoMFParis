/**
 * Testes unitários para a lógica de registrar atividade e vinculação de tarefas
 * do ClientePanel — sem montar o componente React (lógica pura extraída).
 */
import { describe, it, expect } from 'vitest'
import type { Interacao, Tarefa } from '../types'

// ─── Lógica extraída de handleRegistrarAtividade ────────────────────────────

const labelMap: Record<string, string> = {
  proposta: 'Proposta', visita: 'Visita', reuniao: 'Reunião',
  ligacao: 'Ligação', email: 'E-mail', whatsapp: 'WhatsApp', nota: 'Nota',
}

const tiposExtraComoNota = ['proposta', 'visita']

function computarFluxoAtividade(panelAtividadeTipo: string, panelAtividadePrazo: string, panelAtividadeHora: string) {
  const isNota = panelAtividadeTipo === 'nota'
  const semTipo = !panelAtividadeTipo
  const precisaPrazo = !isNota && !semTipo
  const prazoBloqueado = precisaPrazo && (!panelAtividadePrazo || !panelAtividadeHora)

  const prazoFinal = panelAtividadePrazo || new Date().toISOString().split('T')[0]
  const horaFinal = panelAtividadeHora || '08:00'

  const isExtra = tiposExtraComoNota.includes(panelAtividadeTipo)
  const tipoInteracao = (isExtra ? 'nota' : (panelAtividadeTipo || 'nota')) as Interacao['tipo']
  const labelAtividade = labelMap[panelAtividadeTipo] || panelAtividadeTipo || 'Atividade'

  const gerarTarefa = !isNota

  const tarefaTipo: Tarefa['tipo'] | null = gerarTarefa
    ? (tipoInteracao === 'email' || tipoInteracao === 'whatsapp' || tipoInteracao === 'ligacao' || tipoInteracao === 'reuniao'
        ? tipoInteracao as Tarefa['tipo']
        : 'outro')
    : null

  return {
    isNota, semTipo, precisaPrazo, prazoBloqueado,
    tipoInteracao, labelAtividade, gerarTarefa,
    tarefaTipo, prazoFinal, horaFinal,
    tituloTarefa: gerarTarefa ? `Retorno: ${labelAtividade} - EMPRESA` : null,
  }
}

// ─── Lógica extraída de tarefaVinculada ─────────────────────────────────────

function encontrarTarefaVinculada(inter: Pick<Interacao, 'descricao' | 'assunto'>, tarefas: Pick<Tarefa, 'id' | 'titulo' | 'descricao' | 'data' | 'status'>[]) {
  return tarefas.find(t => {
    const descMatch = (t.descricao || '').trim() === (inter.descricao || '').trim()
      && (inter.descricao || '').trim().length > 10
    const tituloLower = (t.titulo || '').toLowerCase()
    const assuntoLower = (inter.assunto || '').toLowerCase()
    const assuntoMatch = assuntoLower.length > 5 && tituloLower.includes(assuntoLower.slice(0, 30))
    return descMatch || assuntoMatch
  })
}

// ════════════════════════════════════════════════════════════════════════════
// TESTES — handleRegistrarAtividade
// ════════════════════════════════════════════════════════════════════════════

describe('handleRegistrarAtividade — isNota / semTipo / precisaPrazo', () => {

  it('NOTA: isNota=true, gerarTarefa=false, não precisa prazo', () => {
    const r = computarFluxoAtividade('nota', '', '')
    expect(r.isNota).toBe(true)
    expect(r.semTipo).toBe(false)
    expect(r.precisaPrazo).toBe(false)
    expect(r.prazoBloqueado).toBe(false)
    expect(r.gerarTarefa).toBe(false)
    expect(r.tarefaTipo).toBeNull()
    expect(r.tipoInteracao).toBe('nota')
    expect(r.labelAtividade).toBe('Nota')
  })

  it('SEM TIPO: semTipo=true, gerarTarefa=true, tipo=outro, não precisa prazo', () => {
    const r = computarFluxoAtividade('', '', '')
    expect(r.isNota).toBe(false)
    expect(r.semTipo).toBe(true)
    expect(r.precisaPrazo).toBe(false)
    expect(r.prazoBloqueado).toBe(false)
    expect(r.gerarTarefa).toBe(true)
    expect(r.tarefaTipo).toBe('outro')
    expect(r.tipoInteracao).toBe('nota')
    expect(r.tituloTarefa).toBe('Retorno: Atividade - EMPRESA')
  })

  it('PROPOSTA: salva como nota mas gera tarefa tipo outro', () => {
    const r = computarFluxoAtividade('proposta', '2025-06-10', '14:00')
    expect(r.isNota).toBe(false)
    expect(r.tipoInteracao).toBe('nota')   // salvo como nota no DB
    expect(r.gerarTarefa).toBe(true)
    expect(r.tarefaTipo).toBe('outro')
    expect(r.labelAtividade).toBe('Proposta')
    expect(r.tituloTarefa).toBe('Retorno: Proposta - EMPRESA')
    expect(r.precisaPrazo).toBe(true)
    expect(r.prazoBloqueado).toBe(false)
  })

  it('PROPOSTA sem prazo: deve bloquear', () => {
    const r = computarFluxoAtividade('proposta', '', '')
    expect(r.precisaPrazo).toBe(true)
    expect(r.prazoBloqueado).toBe(true)
  })

  it('VISITA: salva como nota mas gera tarefa tipo outro', () => {
    const r = computarFluxoAtividade('visita', '2025-06-10', '09:00')
    expect(r.tipoInteracao).toBe('nota')
    expect(r.gerarTarefa).toBe(true)
    expect(r.tarefaTipo).toBe('outro')
    expect(r.labelAtividade).toBe('Visita')
    expect(r.tituloTarefa).toBe('Retorno: Visita - EMPRESA')
  })

  it('REUNIÃO: salva como reuniao e gera tarefa tipo reuniao', () => {
    const r = computarFluxoAtividade('reuniao', '2025-06-10', '10:00')
    expect(r.tipoInteracao).toBe('reuniao')
    expect(r.gerarTarefa).toBe(true)
    expect(r.tarefaTipo).toBe('reuniao')
    expect(r.labelAtividade).toBe('Reunião')
    expect(r.tituloTarefa).toBe('Retorno: Reunião - EMPRESA')
  })

  it('LIGAÇÃO: tipo=ligacao, tarefa tipo ligacao', () => {
    const r = computarFluxoAtividade('ligacao', '2025-06-10', '11:00')
    expect(r.tipoInteracao).toBe('ligacao')
    expect(r.tarefaTipo).toBe('ligacao')
    expect(r.labelAtividade).toBe('Ligação')
  })

  it('EMAIL: tipo=email, tarefa tipo email', () => {
    const r = computarFluxoAtividade('email', '2025-06-10', '11:00')
    expect(r.tipoInteracao).toBe('email')
    expect(r.tarefaTipo).toBe('email')
    expect(r.labelAtividade).toBe('E-mail')
  })

  it('WHATSAPP: tipo=whatsapp, tarefa tipo whatsapp', () => {
    const r = computarFluxoAtividade('whatsapp', '2025-06-10', '11:00')
    expect(r.tipoInteracao).toBe('whatsapp')
    expect(r.tarefaTipo).toBe('whatsapp')
    expect(r.labelAtividade).toBe('WhatsApp')
  })

  it('REUNIÃO sem prazo: deve bloquear', () => {
    const r = computarFluxoAtividade('reuniao', '', '')
    expect(r.prazoBloqueado).toBe(true)
  })

  it('SEM TIPO: usa data de hoje como prazoFinal quando não informado', () => {
    const r = computarFluxoAtividade('', '', '')
    const hoje = new Date().toISOString().split('T')[0]
    expect(r.prazoFinal).toBe(hoje)
    expect(r.horaFinal).toBe('08:00')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// TESTES — encontrarTarefaVinculada (bug do "finalizar todas")
// ════════════════════════════════════════════════════════════════════════════

describe('encontrarTarefaVinculada — vinculação correta por descrição/assunto', () => {

  const hoje = new Date().toISOString().split('T')[0]

  const tarefas = [
    { id: 1, titulo: 'Retorno: Ligação - EMPRESA A', descricao: 'Falar sobre contrato de fornecimento', data: hoje, status: 'pendente' as const },
    { id: 2, titulo: 'Retorno: Proposta - EMPRESA A', descricao: 'Enviar proposta comercial completa', data: hoje, status: 'pendente' as const },
    { id: 3, titulo: 'Retorno: Reunião - EMPRESA A', descricao: 'Agendar reunião de alinhamento técnico', data: hoje, status: 'concluida' as const },
  ]

  it('vincula por descrição exata (> 10 chars)', () => {
    const inter = { descricao: 'Falar sobre contrato de fornecimento', assunto: '' }
    const t = encontrarTarefaVinculada(inter, tarefas)
    expect(t?.id).toBe(1)
  })

  it('vincula por assunto no título', () => {
    const inter = { descricao: 'outro texto', assunto: 'Retorno: Proposta - EMPRESA A' }
    const t = encontrarTarefaVinculada(inter, tarefas)
    expect(t?.id).toBe(2)
  })

  it('NÃO vincula por descrições curtas (≤ 10 chars) para evitar falso positivo', () => {
    const inter = { descricao: 'ok', assunto: '' }
    const t = encontrarTarefaVinculada(inter, tarefas)
    expect(t).toBeUndefined()
  })

  it('NÃO usa fallback por data — interações diferentes não compartilham tarefa', () => {
    const inter1 = { descricao: 'Falar sobre contrato de fornecimento', assunto: '' }
    const inter2 = { descricao: 'Enviar proposta comercial completa', assunto: '' }
    const t1 = encontrarTarefaVinculada(inter1, tarefas)
    const t2 = encontrarTarefaVinculada(inter2, tarefas)
    // Cada interação vincula à SUA tarefa, não à mesma
    expect(t1?.id).toBe(1)
    expect(t2?.id).toBe(2)
    expect(t1?.id).not.toBe(t2?.id)
  })

  it('tarefa já concluída é encontrada corretamente (status não afeta o match)', () => {
    const inter = { descricao: 'Agendar reunião de alinhamento técnico', assunto: '' }
    const t = encontrarTarefaVinculada(inter, tarefas)
    expect(t?.id).toBe(3)
    expect(t?.status).toBe('concluida')
  })

  it('retorna undefined quando não há match por descrição nem assunto', () => {
    const inter = { descricao: 'Texto completamente diferente sem match', assunto: 'Assunto sem correspondência' }
    const t = encontrarTarefaVinculada(inter, tarefas)
    expect(t).toBeUndefined()
  })

  it('assunto vazio não faz match indevido', () => {
    const inter = { descricao: 'texto qualquer sem match', assunto: '' }
    const t = encontrarTarefaVinculada(inter, tarefas)
    expect(t).toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// TESTES — labelMap (labels corretos para o card de histórico)
// ════════════════════════════════════════════════════════════════════════════

const tipoInteracaoLabel: Record<string, string> = {
  email: 'Email', whatsapp: 'WhatsApp', ligacao: 'Ligação', reuniao: 'Reunião',
  instagram: 'Instagram', linkedin: 'LinkedIn', nota: 'Observação',
  proposta: 'Proposta', visita: 'Visita',
}

describe('tipoInteracaoLabel — labels corretos no card histórico', () => {
  it('nota → Observação', () => expect(tipoInteracaoLabel['nota']).toBe('Observação'))
  it('proposta → Proposta', () => expect(tipoInteracaoLabel['proposta']).toBe('Proposta'))
  it('visita → Visita', () => expect(tipoInteracaoLabel['visita']).toBe('Visita'))
  it('reuniao → Reunião', () => expect(tipoInteracaoLabel['reuniao']).toBe('Reunião'))
  it('ligacao → Ligação', () => expect(tipoInteracaoLabel['ligacao']).toBe('Ligação'))
  it('email → Email', () => expect(tipoInteracaoLabel['email']).toBe('Email'))
  it('whatsapp → WhatsApp', () => expect(tipoInteracaoLabel['whatsapp']).toBe('WhatsApp'))
  it('tipo desconhecido → undefined (fallback para tipo bruto)', () => expect(tipoInteracaoLabel['desconhecido']).toBeUndefined())
})
