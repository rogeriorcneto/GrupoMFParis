import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/views', () => ({ AprovacaoView: () => null }))
vi.mock('../components/views/AprovacaoView', () => ({ getParametrosAprovacao: vi.fn(), pedidoPassaAutoAprovacao: vi.fn() }))
vi.mock('../lib/database', () => ({ updateCliente: vi.fn(), updatePedidoStatus: vi.fn(), insertCliente: vi.fn() }))
vi.mock('../lib/botApi', () => ({ aprovarPedidoComOmie: vi.fn(), cancelarPedidoOmie: vi.fn(), enviarPedidoOmie: vi.fn(), checkCnpjsGlobais: vi.fn() }))

import AppRouter from '../components/AppRouter'
import { aprovarPedidoComOmie } from '../lib/botApi'
import * as db from '../lib/database'

function criarRota(etapa = 'negociacao') {
  const moverCliente = vi.fn().mockResolvedValue(true)
  const criarNovoCiclo = vi.fn()
  const element = AppRouter({
    activeView: 'aprovacao', loggedUser: { id: 7, cargo: 'gerente' },
    clientes: [{ id: 1, razaoSocial: 'Empresa Paris', etapa }], pedidos: [], vendedores: [],
    setPedidos: vi.fn(), setClientes: vi.fn(), addNotificacao: vi.fn(), moverCliente, criarNovoCiclo,
  } as any) as any
  return { onAprovar: element.props.onAprovar, moverCliente, criarNovoCiclo }
}

const pedido = { id: 10, numero: 'PED-10', clienteId: 1, tipo: 'venda' }

beforeEach(() => vi.resetAllMocks())

describe('aprovação integrada com a criação central de ciclos', () => {
  it('delega o ganho ao movimento central e não insere um segundo clone em negociação', async () => {
    vi.mocked(aprovarPedidoComOmie).mockResolvedValue({ omie: { success: true } } as any)
    const rota = criarRota()
    await rota.onAprovar(pedido, 'A')
    expect(rota.moverCliente).toHaveBeenCalledWith(1, 'follow_up', { statusFollowUp: 'pedido_aprovado' })
    expect(db.insertCliente).not.toHaveBeenCalled()
    expect(rota.criarNovoCiclo).not.toHaveBeenCalled()
  })

  it('não move o cliente nem cria ciclo quando Omie rejeita', async () => {
    vi.mocked(aprovarPedidoComOmie).mockResolvedValue({ omie: { success: false, error: 'Rejeitado' } } as any)
    const rota = criarRota()
    await rota.onAprovar(pedido, 'B')
    expect(rota.moverCliente).not.toHaveBeenCalled()
    expect(db.insertCliente).not.toHaveBeenCalled()
    expect(db.updatePedidoStatus).toHaveBeenCalledWith(10, 'enviado')
  })

  it('reaprovar pedido de follow-up não abre outro ciclo', async () => {
    vi.mocked(aprovarPedidoComOmie).mockResolvedValue({ omie: { success: true } } as any)
    const rota = criarRota('follow_up')
    await rota.onAprovar(pedido, 'A')
    expect(rota.moverCliente).not.toHaveBeenCalled()
    expect(rota.criarNovoCiclo).not.toHaveBeenCalled()
    expect(db.insertCliente).not.toHaveBeenCalled()
  })
})
