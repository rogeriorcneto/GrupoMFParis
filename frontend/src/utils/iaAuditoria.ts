export type ClassificacaoIA = 'OK' | 'Fraco' | 'Incoerente'

export interface RegistroAuditoriaIA {
  chave: string
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

export const CLASSIFICACAO_IA_CONFIG: Record<ClassificacaoIA, { label: string; cor: string }> = {
  OK: { label: 'IA: OK', cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Fraco: { label: 'IA: Fraco', cor: 'bg-amber-100 text-amber-800 border-amber-300' },
  Incoerente: { label: 'IA: Incoerente', cor: 'bg-red-100 text-red-800 border-red-300' },
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

export function classificarRegistroLocal(input: {
  tipoRegistro: 'tarefa' | 'cadastro'
  canalUsado?: string
  objetivo?: string
  conclusao?: string
  proximoPassoResumo?: string
  justificativaPrazoLongo?: string
  justificativaCadastro?: string
  textosAnterioresVendedor?: string[]
  justificativasRepetidasCount?: number
}): { classificacao: ClassificacaoIA; motivo: string } {
  if (input.tipoRegistro === 'cadastro') {
    const just = String(input.justificativaCadastro || '').trim()
    const norm = normalizarTexto(just)
    if (!norm || GENERICOS_EXATOS.has(norm) || norm.split(' ').length < 3 || norm.length < 10) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de cadastro genérica ou curta demais para explicar a ausência do dado.',
      }
    }
    if ((input.justificativasRepetidasCount || 0) >= 3) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de cadastro repetida de forma padronizada em vários clientes.',
      }
    }
    return {
      classificacao: 'OK',
      motivo: 'Justificativa de cadastro específica e coerente com o campo informado.',
    }
  }

  const conc = String(input.conclusao || '').trim()
  const concNorm = normalizarTexto(conc)
  if (!concNorm || GENERICOS_EXATOS.has(concNorm) || concNorm.length < 10 || concNorm.split(' ').length < 3) {
    return {
      classificacao: 'Fraco',
      motivo: `Conclusão vazia ou genérica ("${conc.slice(0, 30) || 'vazia'}"), sem relatar o que foi conversado.`,
    }
  }

  if (input.textosAnterioresVendedor?.some(ant => normalizarTexto(ant) === concNorm)) {
    return {
      classificacao: 'Fraco',
      motivo: 'Texto da conclusão copiado/repetido de outro registro anterior.',
    }
  }

  const canal = (input.canalUsado || '').toLowerCase()
  if ((canal === 'visita' || canal === 'reuniao') && /\b(mandei zap|mandei whats|mensagem no whats|caixa postal|nao atendeu ligacao)\b/.test(concNorm) && !/\b(presencial|visita|reuniao)\b/.test(concNorm)) {
    return {
      classificacao: 'Incoerente',
      motivo: `O canal marcado foi ${canal}, mas a conclusão descreve apenas tentativa remota por mensagem/telefone.`,
    }
  }
  if (canal === 'email' && /\b(falei ao telefone|liguei e conversei|visitei a loja)\b/.test(concNorm) && !/\b(email|e mail)\b/.test(concNorm)) {
    return {
      classificacao: 'Incoerente',
      motivo: 'O canal marcado foi E-mail, mas a conclusão relata contato por telefone ou visita.',
    }
  }

  const proxNorm = normalizarTexto(input.proximoPassoResumo)
  if (/\b(empresa fechou|encerrou atividades|cnpj baixado|faliu)\b/.test(concNorm) && /\b(oferta|cotacao|enviar proposta|vender)\b/.test(proxNorm)) {
    return {
      classificacao: 'Incoerente',
      motivo: 'A conclusão informa que a empresa encerrou atividades, mas o próximo passo mantém oferta comercial.',
    }
  }

  if (input.justificativaPrazoLongo !== undefined && String(input.justificativaPrazoLongo).trim() !== '') {
    const justNorm = normalizarTexto(input.justificativaPrazoLongo)
    if (GENERICOS_EXATOS.has(justNorm) || justNorm.length < 10 || justNorm.split(' ').length < 3) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de prazo acima de 15 dias é genérica e não explica o motivo operacional.',
      }
    }
    if ((input.justificativasRepetidasCount || 0) >= 3) {
      return {
        classificacao: 'Fraco',
        motivo: 'Justificativa de prazo longo repetida em vários clientes sem contexto individual.',
      }
    }
  }

  return {
    classificacao: 'OK',
    motivo: 'Conclusão descreve o contato realizado de forma coerente com o canal e o próximo passo.',
  }
}
