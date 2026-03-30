import { describe, it, expect } from 'vitest'
import type { Cliente, Pedido } from '../types'
import { shouldMoveToFollowUpOnApproval } from '../components/AppRouter'

function makePedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id: 1,
    numero: 'PED-000001',
    clienteId: 1,
    vendedorId: 1,
    itens: [],
    observacoes: '',
    status: 'enviado',
    dataCriacao: new Date().toISOString(),
    totalValor: 0,
    ...overrides,
  }
}

function makeCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 1,
    razaoSocial: 'Cliente Teste',
    cnpj: '',
    contatoNome: '',
    contatoTelefone: '',
    contatoEmail: '',
    etapa: 'prospecção',
    ...overrides,
  }
}

describe('shouldMoveToFollowUpOnApproval', () => {
  it('não move quando pedido é amostra (bonificacao)', () => {
    const pedido = makePedido({ tipo: 'bonificacao' })
    const cliente = makeCliente({ etapa: 'proposta' })

    expect(shouldMoveToFollowUpOnApproval(pedido, cliente)).toBe(false)
  })

  it('não move quando cliente está na etapa amostra', () => {
    const pedido = makePedido({ tipo: 'venda' })
    const cliente = makeCliente({ etapa: 'amostra' })

    expect(shouldMoveToFollowUpOnApproval(pedido, cliente)).toBe(false)
  })

  it('não move quando cliente está em amostra_perdida', () => {
    const pedido = makePedido({ tipo: 'venda' })
    const cliente = makeCliente({ etapa: 'amostra_perdida' })

    expect(shouldMoveToFollowUpOnApproval(pedido, cliente)).toBe(false)
  })

  it('move para follow_up em pedido de venda fora de amostra', () => {
    const pedido = makePedido({ tipo: 'venda' })
    const cliente = makeCliente({ etapa: 'negociacao' })

    expect(shouldMoveToFollowUpOnApproval(pedido, cliente)).toBe(true)
  })
})
