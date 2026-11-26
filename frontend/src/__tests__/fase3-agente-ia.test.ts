import { describe, expect, it } from 'vitest'
import { classificarRegistroLocal } from '../utils/iaAuditoria'

describe('Fase 3 · Item 9 — Agente de IA para análise de tarefas e cadastro', () => {
  it('classifica uma conclusão "ok" como Fraco, sempre com motivo', () => {
    const r = classificarRegistroLocal({
      tipoRegistro: 'tarefa',
      canalUsado: 'ligacao',
      objetivo: 'relacionamento',
      conclusao: 'ok',
    })
    expect(r.classificacao).toBe('Fraco')
    expect(r.motivo.length).toBeGreaterThan(10)
  })

  it('classifica uma conclusão com descrição real e coerente do contato como OK', () => {
    const r = classificarRegistroLocal({
      tipoRegistro: 'tarefa',
      canalUsado: 'ligacao',
      objetivo: 'oferta_venda',
      conclusao: 'Falei com a compradora Ana sobre reposição de leite em pó; estoque dura mais 8 dias e pediu nova cotação na próxima semana.',
      proximoPassoResumo: 'whatsapp (cotacao) em 2026-12-02: Enviar cotação atualizada de 500 kg',
    })
    expect(r.classificacao).toBe('OK')
    expect(r.motivo.length).toBeGreaterThan(10)
  })

  it('detecta incoerência entre canal marcado (Visita) e relato apenas remoto', () => {
    const r = classificarRegistroLocal({
      tipoRegistro: 'tarefa',
      canalUsado: 'visita',
      objetivo: 'relacionamento',
      conclusao: 'Mandei whats mas caiu na caixa postal e não atendeu ligação.',
    })
    expect(r.classificacao).toBe('Incoerente')
  })

  it('detecta texto copiado de outros registros e justificativa de cadastro genérica ou repetida', () => {
    const copiado = classificarRegistroLocal({
      tipoRegistro: 'tarefa',
      canalUsado: 'whatsapp',
      objetivo: 'relacionamento',
      conclusao: 'Cliente visualizou mensagem e disse que retorna.',
      textosAnterioresVendedor: ['Cliente visualizou mensagem e disse que retorna.'],
    })
    expect(copiado.classificacao).toBe('Fraco')

    const cadFraco = classificarRegistroLocal({
      tipoRegistro: 'cadastro',
      justificativaCadastro: 'não tem',
    })
    expect(cadFraco.classificacao).toBe('Fraco')

    const cadOk = classificarRegistroLocal({
      tipoRegistro: 'cadastro',
      justificativaCadastro: 'Indústria familiar sem site e sem perfil em redes sociais.',
    })
    expect(cadOk.classificacao).toBe('OK')
  })
})
