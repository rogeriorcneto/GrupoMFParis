import { describe, it, expect } from 'vitest'
import {
  fmtPhoneUnico,
  fmtDateISO,
  stripHtml,
  padronizarTipoTarefa,
  gerarLinhasCadastroCompleto,
  gerarPlanilhasTarefasCompletas,
} from '../utils/exportacaoAuditoria'
import { buildDefaultParametros, getOpcoesAtivas } from '../lib/parametrosListas'
import { isDataHoraNoPassado, MINUTOS_5 } from '../components/TimePicker5Min'
import { resolverTaxaPrazo, calcularPrecosTabela } from '../data/simuladorPrecos'

describe('Rodada 2 & 3 — Parâmetros, Exportação completa (4.1–4.7) e Agendamento de Tarefas (Item 5)', () => {
  it('começa Segmento do cliente apenas com Indústria, Distribuição e Consumo e seletor de minutos de 5 em 5', () => {
    const p = buildDefaultParametros()
    const segs = getOpcoesAtivas(p, 'segmento_cliente').map(s => s.valor)
    expect(segs).toEqual(['Indústria', 'Distribuição', 'Consumo'])
    expect(MINUTOS_5).toEqual(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'])
  })

  it('bloqueia data/hora no passado (Item 5)', () => {
    const ref = new Date(2026, 10, 19, 14, 30, 0) // 19/11/2026 14:30
    expect(isDataHoraNoPassado('2026-11-18', '15:00', ref)).toBe(true)  // ontem
    expect(isDataHoraNoPassado('2026-11-19', '13:30', ref)).toBe(true)  // 1h atrás hoje
    expect(isDataHoraNoPassado('2026-11-19', '15:00', ref)).toBe(false) // futuro hoje
    expect(isDataHoraNoPassado('2026-11-20', '08:00', ref)).toBe(false) // amanhã
  })

  it('9.1 Cadastro: telefone único, datas AAAA-MM-DD, limpa <br /> e remove colunas 100% vazias', () => {
    expect(fmtPhoneUnico('(31) 98877-6655')).toBe('+55 31 98877-6655')
    expect(fmtDateISO('18/11/2026')).toBe('2026-11-18')
    expect(stripHtml('Linha 1<br />Linha 2<br>Fim')).toBe('Linha 1 | Linha 2 | Fim')
    expect(padronizarTipoTarefa('follow_up')).toBe('follow-up')
    expect(padronizarTipoTarefa('follow-up')).toBe('follow-up')

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
      [{ id: 5, nome: 'Ursulla Lopes', email: 'u@x.com', telefone: '', cargo: 'vendedor', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: false }],
      [],
      [],
      { vendedorIds: [] }
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0].cnpj_cpf).toBe('11.222.333/0001-81')
    expect(linhas[0].contato_celular).toBe('+55 31 99988-7766')
    expect('tiktok' in linhas[0]).toBe(false)
  })

  it('Item 4.1 a 4.7: filtra pela data de inclusão, inclui clientes Sem tarefa, ignora reagendamento 26/10 -> 26/10 e sem Usuário genérico', () => {
    const { abaTarefas, abaAuditoria } = gerarPlanilhasTarefasCompletas(
      [
        // Criada em julho mas com vencimento em novembro -> NÃO deve vir no filtro de novembro! (4.1)
        {
          id: 500, titulo: 'Antiga de julho', criadoEm: '2026-07-15T10:00:00Z', data: '2026-11-25',
          tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId: 100, vendedorId: 6,
        },
        // Criada em novembro com 2 reagendamentos reais + 1 falso (26/10 -> 26/10) -> deve contar apenas 1 real! (4.6 + 4.4)
        {
          id: 501, titulo: 'Cobrar proposta', criadoEm: '2026-11-05T10:00:00Z', data: '2026-11-20',
          tipo: 'follow_up' as any, status: 'pendente', prioridade: 'alta', clienteId: 100, vendedorId: 6,
          reagendamentos: [
            { dataOriginal: '2026-10-26', motivo: 'Mesma data 1', reagendadoEm: '2026-11-06T10:00:00Z' },
            { dataOriginal: '2026-10-26', motivo: 'Mudou para 20/11', reagendadoEm: '2026-11-06T10:01:00Z', alteradoPor: 'Usuário' },
          ],
        },
      ],
      [
        {
          tarefa: {
            id: 502, titulo: 'Tarefa excluída em nov', criadoEm: '2026-11-10T09:00:00Z', data: '2026-11-12',
            tipo: 'whatsapp', status: 'pendente', prioridade: 'media', clienteId: 100, vendedorId: 6,
          },
          etapaClienteNoMomento: 'Proposta',
          excluidoPor: 'Bernardo Nery',
          excluidoEm: '2026-11-19T11:30:00Z',
        },
      ],
      [
        { id: 100, razaoSocial: 'Cliente Com Tarefa', cnpj: '11222333000181', etapa: 'proposta', vendedorId: 6, dataEntradaEtapa: '2026-11-01' } as any,
        { id: 200, razaoSocial: 'Cliente Sem Tarefa Ltda', cnpj: '22333444000192', etapa: 'prospecção', vendedorId: 6, dataEntradaEtapa: '2026-11-01' } as any,
      ],
      [{ id: 6, nome: 'Wiliam Rodrigues', email: 'w@x.com', telefone: '', cargo: 'vendedor', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: true }],
      { vendedorIds: [6], dataInicio: '2026-11-01', dataFim: '2026-11-30' },
      '2026-11-19'
    )

    // Tarefa 500 (criada em julho) foi filtrada!
    expect(abaTarefas.find(r => r.id === 500)).toBeUndefined()

    const t501 = abaTarefas.find(r => r.id === 501)!
    expect(t501.tipo).toBe('follow-up') // 4.7 padronizado
    expect(t501.num_reagendamentos).toBe(1) // 4.6 ignorou 26/10 -> 26/10!

    // 4.2 Cliente sem tarefa aparece com status "Sem tarefa"
    const semTarefa = abaTarefas.find(r => r.cliente === 'Cliente Sem Tarefa Ltda')!
    expect(semTarefa.status).toBe('Sem tarefa')

    // 4.4 Nenhum "Usuário" genérico na auditoria -> usou "Wiliam Rodrigues"
    expect(abaAuditoria.some(a => a.quem_alterou === 'Usuário')).toBe(false)
    expect(abaAuditoria.some(a => a.tipo_evento === 'Reagendamento' && a.quem_alterou === 'Wiliam Rodrigues')).toBe(true)
    // 4.5 Exclusão aparece na auditoria com quem excluiu
    expect(abaAuditoria.some(a => a.tipo_evento === 'Tarefa Excluída' && a.quem_alterou === 'Bernardo Nery')).toBe(true)
  })

  it('Rodada 3.1 Item 2: Simulador calcula prazos novos cadastrados em Parâmetros (ex.: "15/30/35")', () => {
    // 15/30/35 -> média 26,6667 dias -> taxa 0.002 + 0.001 * 26.6667 = 0.0287 (entre 15/30=0.0245 e 15/30/45=0.032)
    const taxa153035 = resolverTaxaPrazo('15/30/35')
    expect(taxa153035).toBeCloseTo(0.0287, 4)
    expect(resolverTaxaPrazo('15/30')).toBe(0.0245)
    expect(resolverTaxaPrazo('15/30/45')).toBe(0.032)

    const calc = calcularPrecosTabela('OKEY LAC CREAM 25KG', '15/30/35', 'FOB')
    expect(calc).not.toBeNull()
    expect(calc!.precoA).toBeGreaterThan(20)
    expect(calc!.precoB).toBeGreaterThan(19)
  })
})
