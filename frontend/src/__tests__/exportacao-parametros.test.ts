import { describe, it, expect } from 'vitest'
import {
  fmtPhoneUnico,
  fmtDateISO,
  stripHtml,
  gerarLinhasCadastroCompleto,
  gerarPlanilhasTarefasCompletas,
} from '../utils/exportacaoAuditoria'
import { buildDefaultParametros, getOpcoesAtivas } from '../lib/parametrosListas'

describe('Item 8 & Item 9 — Parâmetros e Exportação completa (Cadastro + Tarefas c/ Auditoria)', () => {
  it('começa Segmento do cliente apenas com Indústria, Distribuição e Consumo', () => {
    const p = buildDefaultParametros()
    const segs = getOpcoesAtivas(p, 'segmento_cliente').map(s => s.valor)
    expect(segs).toEqual(['Indústria', 'Distribuição', 'Consumo'])
  })

  it('padroniza telefone (+55 DD 9XXXX-XXXX), datas AAAA-MM-DD, limpa <br /> e remove colunas 100% vazias no 9.1', () => {
    expect(fmtPhoneUnico('(31) 98877-6655')).toBe('+55 31 98877-6655')
    expect(fmtPhoneUnico('553133445566')).toBe('+55 31 3344-5566')
    expect(fmtDateISO('18/11/2026')).toBe('2026-11-18')
    expect(stripHtml('Linha 1<br />Linha 2<br>Fim')).toBe('Linha 1 | Linha 2 | Fim')

    const linhas = gerarLinhasCadastroCompleto(
      [
        {
          id: 100, razaoSocial: 'A Fábrica Ind.<br />Ltda', cnpj: '11222333000181',
          etapa: 'perdido', vendedorId: 5, segmento: 'Indústria', contatoCelular: '31999887766',
          dataEntradaEtapa: '2026-10-01', produtosInteresse: ['LEITE 25KG'],
          produtosQuantidadesMensais: { 'LEITE 25KG': 250 },
        } as any,
        {
          id: 105, razaoSocial: 'A Fábrica Ind. Ltda', cnpj: '11.222.333/0001-81',
          etapa: 'proposta', vendedorId: 5, novoCiclo: true, empresaFunilId: 100,
          dataEntradaEtapa: '2026-11-15',
        } as any,
      ],
      [{ id: 5, nome: 'Ursulla Lopes', email: 'u@x.com', telefone: '', cargo: 'vendedor', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: true }],
      [],
      [],
      { vendedorIds: [] }
    )

    expect(linhas).toHaveLength(1) // 1 linha por CNPJ!
    expect(linhas[0].cnpj_cpf).toBe('11.222.333/0001-81')
    expect(linhas[0].contato_celular).toBe('+55 31 99988-7766')
    expect(linhas[0].razao_social).not.toContain('<br')
    expect(linhas[0].produtos_interesse_kg_mes).toContain('LEITE 25KG: 250 kg/mês')
    expect(linhas[0].etapa_card_mais_recente).toBe('Proposta')
    // Coluna tiktok estava 100% vazia -> foi removida automaticamente!
    expect('tiktok' in linhas[0]).toBe(false)
  })

  it('9.2 Tarefas: tarefa reagendada 2 vezes mostra prazo original, prazo atual e 2; tarefa excluída sai na Auditoria com quem excluiu', () => {
    const { abaTarefas, abaAuditoria } = gerarPlanilhasTarefasCompletas(
      [
        {
          id: 501,
          titulo: 'Cobrar proposta',
          data: '2026-11-20',
          tipo: 'ligacao',
          status: 'pendente',
          prioridade: 'alta',
          clienteId: 100,
          vendedorId: 5,
          reagendamentos: [
            { dataOriginal: '2026-11-10', motivo: 'Cliente viajando', reagendadoEm: '2026-11-10T10:00:00Z', alteradoPor: 'Ursulla Lopes' },
            { dataOriginal: '2026-11-15', motivo: 'Pediu retorno sexta', reagendadoEm: '2026-11-15T14:00:00Z', alteradoPor: 'Ursulla Lopes' },
          ],
        },
      ],
      [
        {
          tarefa: {
            id: 502,
            titulo: 'Tarefa duplicada antiga',
            data: '2026-11-12',
            tipo: 'whatsapp',
            status: 'pendente',
            prioridade: 'media',
            clienteId: 100,
            vendedorId: 5,
          },
          etapaClienteNoMomento: 'Proposta',
          excluidoPor: 'Rogério Reis',
          excluidoEm: '2026-11-18T11:30:00Z',
        },
      ],
      [{ id: 100, razaoSocial: 'Cliente X', cnpj: '11222333000181', etapa: 'proposta', vendedorId: 5, dataEntradaEtapa: '2026-11-01' } as any],
      [{ id: 5, nome: 'Ursulla Lopes', email: 'u@x.com', telefone: '', cargo: 'vendedor', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: true }],
      { vendedorIds: [5] },
      '2026-11-18'
    )

    const tReag = abaTarefas.find(r => r.id === 501)!
    expect(tReag.prazo_original).toBe('2026-11-10')
    expect(tReag.prazo_atual).toBe('2026-11-20')
    expect(tReag.num_reagendamentos).toBe(2)

    const tExcl = abaTarefas.find(r => r.id === 502)!
    expect(tExcl.status).toBe('Excluída')

    expect(abaAuditoria.some(a => a.tipo_evento === 'Tarefa Excluída' && a.quem_alterou === 'Rogério Reis')).toBe(true)
    expect(abaAuditoria.filter(a => a.tipo_evento === 'Reagendamento')).toHaveLength(2)
  })
})
