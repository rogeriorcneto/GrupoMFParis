import { describe, expect, it } from 'vitest'
import type { Cliente, Pedido, Tarefa, Vendedor } from '../types'
import {
  calcularCadenciaEmpresa,
  calcularIndicadoresGrupo,
  consolidarEmpresasFase2,
  detectarSinaisIrregulares,
} from '../utils/relatoriosFase2'

const ref = new Date('2026-11-25T12:00:00')

const mkCliente = (over: Partial<Cliente> = {}): Cliente => ({
  id: 1,
  razaoSocial: 'Empresa A',
  cnpj: '12345678000190',
  contatoNome: 'Ana',
  contatoTelefone: '31999990000',
  contatoEmail: 'a@a.com',
  etapa: 'proposta',
  vendedorId: 2,
  score: 50,
  produtosInteresse: [],
  criadoEm: '2026-01-10T00:00:00Z',
  ...over,
} as Cliente)

const mkTarefa = (over: Partial<Tarefa> = {}): Tarefa => ({
  id: 100,
  titulo: 'Ligação',
  data: '2026-11-25',
  tipo: 'ligacao',
  status: 'pendente',
  prioridade: 'media',
  clienteId: 1,
  vendedorId: 2,
  ...over,
})

const mkPedido = (over: Partial<Pedido> = {}): Pedido => ({
  id: 500,
  numero: 'PED-500',
  clienteId: 1,
  vendedorId: 2,
  observacoes: '',
  status: 'confirmado',
  itens: [],
  totalValor: 1000,
  dataCriacao: '2026-11-10T10:00:00Z',
  dataEnvio: '2026-11-10T10:00:00Z',
  dataAprovacao: '2026-11-10T10:00:00Z',
  dataEnvioOmie: '2026-11-10T10:00:00Z',
  omieCodigo: '9001',
  tipo: 'venda',
  formaPagamento: 'À vista',
  ...over,
} as Pedido)

describe('Fase 2 · Item 3 — Cadência de Contato', () => {
  it('cliente com última tarefa finalizada há 12 dias aparece amarelo', () => {
    const tConc = mkTarefa({ id: 1, status: 'concluida', concluidaEm: '2026-11-13T14:00:00Z', data: '2026-11-13' })
    const tAberta = mkTarefa({ id: 2, status: 'pendente', data: '2026-11-28' })
    const r = calcularCadenciaEmpresa([tConc, tAberta], ref)
    expect(r.diasSemContato).toBe(12)
    expect(r.cadencia).toBe('amarelo')
  })

  it('cliente com próximo passo justificado para daqui a 30 dias aparece cinza até essa data e vira vermelho depois', () => {
    const tConc = mkTarefa({ id: 1, status: 'concluida', concluidaEm: '2026-11-01T10:00:00Z', data: '2026-11-01' })
    const tJust = mkTarefa({
      id: 2,
      status: 'pendente',
      data: '2026-12-25',
      justificativaPrazoLongo: 'Cliente parou linha de sorvete até janeiro',
    })
    const antes = calcularCadenciaEmpresa([tConc, tJust], ref)
    expect(antes.cadencia).toBe('cinza')
    expect(antes.justificativaPrazoLongo).toContain('parou linha')

    // Passou de 25/12 sem finalizar -> vai para Vermelho
    const depois = calcularCadenciaEmpresa([tConc, tJust], new Date('2026-12-26T12:00:00'))
    expect(depois.cadencia).toBe('vermelho')
  })

  it('classifica verde até 10 dias e vermelho acima de 15 dias ou sem tarefa concluída', () => {
    const verde = calcularCadenciaEmpresa([
      mkTarefa({ id: 1, status: 'concluida', concluidaEm: '2026-11-18T10:00:00Z', data: '2026-11-18' }),
    ], ref)
    expect(verde.cadencia).toBe('verde')

    const vermelho = calcularCadenciaEmpresa([
      mkTarefa({ id: 2, status: 'concluida', concluidaEm: '2026-11-05T10:00:00Z', data: '2026-11-05' }),
    ], ref)
    expect(vermelho.cadencia).toBe('vermelho')

    const nunca = calcularCadenciaEmpresa([mkTarefa({ id: 3, status: 'pendente', data: '2026-11-28' })], ref)
    expect(nunca.cadencia).toBe('vermelho')
  })
})

describe('Fase 2 · Itens 4 e 10 — Indicadores de Cumprimento e Bancos', () => {
  it('calcula indicadores de disciplina, resultado, lead time, reativação e separa Bancos sem vendedor', () => {
    const cliAtivo = mkCliente({ id: 1, razaoSocial: 'Sorvetes Alfa', vendedorId: 2, segmento: 'Indústria', enderecoEstado: 'MG' })
    const cliBancoCli = mkCliente({ id: 2, razaoSocial: 'Parado Antigo', cnpj: '98765432000199', vendedorId: undefined })
    const cliBancoProsp = mkCliente({ id: 3, razaoSocial: 'Prospecto Sem Dono', cnpj: '11122233000181', vendedorId: undefined })

    // Sorvetes Alfa: comprou em 10/08/2026 e reativou em 15/11/2026 (gap de 97 dias -> Reativação!)
    const pedAntigo = mkPedido({ id: 1, clienteId: 1, dataEnvioOmie: '2026-08-10T10:00:00Z', dataAprovacao: '2026-08-10T10:00:00Z', dataFaturamento: '2026-08-12' })
    const pedNovo = mkPedido({ id: 2, clienteId: 1, dataEnvioOmie: '2026-11-15T10:00:00Z', dataAprovacao: '2026-11-15T10:00:00Z', dataFaturamento: '2026-11-19' }) // lead time = 4d, sem tarefa 15d antes!
    const pedBanco = mkPedido({ id: 3, clienteId: 2, dataEnvioOmie: '2026-09-01T10:00:00Z', dataAprovacao: '2026-09-01T10:00:00Z' })

    const tEmpurrada = mkTarefa({
      id: 10,
      clienteId: 1,
      vendedorId: 2,
      status: 'pendente',
      data: '2026-11-20', // 5 dias atrasada
      reagendamentos: [
        { dataOriginal: '2026-11-01', motivo: 'm1', reagendadoEm: '2026-11-01T10:00:00Z' },
        { dataOriginal: '2026-11-05', motivo: 'm2', reagendadoEm: '2026-11-05T10:00:00Z' },
        { dataOriginal: '2026-11-10', motivo: 'm3', reagendadoEm: '2026-11-10T10:00:00Z' },
      ],
    })
    const tGenericaLegada = mkTarefa({
      id: 11,
      clienteId: 1,
      vendedorId: 2,
      tipo: 'outro',
      status: 'concluida',
      concluidaEm: '2026-11-22T10:00:00Z',
      data: '2026-11-22',
      conclusao: 'Alinhado',
    })

    const { empresas, empresaPorCardId } = consolidarEmpresasFase2(
      [cliAtivo, cliBancoCli, cliBancoProsp],
      [pedAntigo, pedNovo, pedBanco],
      [tEmpurrada, tGenericaLegada],
      undefined,
      ref,
    )

    expect(empresas.find(e => e.cardPrincipal.id === 2)?.banco).toBe('clientes')
    expect(empresas.find(e => e.cardPrincipal.id === 3)?.banco).toBe('prospectos')

    const ind = calcularIndicadoresGrupo({
      id: 2,
      nome: 'Eridiane',
      ativo: true,
      somaNosTotais: true,
      empresasGrupo: empresas.filter(e => e.vendedorId === 2),
      tarefasGrupo: [tEmpurrada, tGenericaLegada],
      pedidosGrupo: [pedAntigo, pedNovo],
      propostas: [],
      empresaPorCardId,
      inicioPeriodoISO: '2026-11-01',
      fimPeriodoISO: '2026-11-25',
      agora: ref,
    })

    expect(ind.carteira180).toHaveLength(1)
    expect(ind.verdes).toHaveLength(1)
    expect(ind.pctCarteiraEmDia).toBe(100)
    expect(ind.tarefasAtrasadas).toHaveLength(1)
    expect(ind.tarefasAtrasadas[0].diasAtraso).toBe(5)
    expect(ind.clientesEmpurrados).toHaveLength(1)
    expect(ind.porCanalMes.sem_canal).toHaveLength(1)
    expect(ind.pedidosSemContato15d).toHaveLength(1)
    expect(ind.reativacoesMes).toHaveLength(1)
    expect(ind.leadTimeMediaDias).toBe(4)
  })

  it('detecta rajada (>10 tarefas em 15 minutos) e conclusões repetidas', () => {
    const vend: Vendedor = { id: 6, nome: 'Wiliam', email: 'w@x.com', telefone: '', cargo: 'vendedor', avatar: 'W', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: true }
    const tarefasRajada: Tarefa[] = Array.from({ length: 11 }, (_, idx) => mkTarefa({
      id: 200 + idx,
      vendedorId: 6,
      status: 'concluida',
      concluidaEm: `2026-11-25T10:${String(idx).padStart(2, '0')}:00Z`,
      conclusao: idx < 4 ? 'ok feito' : `Contato específico ${idx}`,
    }))
    const sinais = detectarSinaisIrregulares(tarefasRajada, [vend], new Map())
    expect(sinais.some(s => s.tipo === 'rajada_15min')).toBe(true)
    expect(sinais.some(s => s.tipo === 'conclusao_repetida')).toBe(true)
  })
})
