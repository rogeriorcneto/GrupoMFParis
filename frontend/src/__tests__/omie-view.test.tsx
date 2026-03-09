import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock omieApi
vi.mock('../lib/omieApi', () => ({
  omieGetPedidosAcompanhamento: vi.fn().mockResolvedValue({ success: true, data: [] }),
  omieConsultarEntrega: vi.fn().mockResolvedValue({
    success: true,
    data: { etapa: '50', dataPrevisao: '15/03/2025', codigoRastreio: 'BR123', nf: '1234', dataFaturamento: '10/03/2025', statusDescricao: 'Faturar' },
  }),
  omieGetFinanceiroResumo: vi.fn().mockResolvedValue({
    success: true,
    data: { totalReceber: 5000, totalPagar: 2000, saldo: 3000, titulosVencidos: 1, titulosAVencer: 3, contasReceber: [], contasPagar: [] },
  }),
  omieSyncLogistics: vi.fn().mockResolvedValue({ success: true, data: { atualizados: 2, semPedido: 0, erros: [] } }),
}))

// Mock OmieIntegration
vi.mock('../components/omie/OmieIntegration', () => ({
  default: () => <div data-testid="omie-integration">OmieIntegration Mock</div>,
}))

import OmieView from '../components/views/OmieView'
import {
  omieGetPedidosAcompanhamento,
  omieConsultarEntrega,
  omieGetFinanceiroResumo,
  omieSyncLogistics,
} from '../lib/omieApi'
import type { Pedido, Cliente, Vendedor } from '../types'

const mockVendedor: Vendedor = {
  id: 1, nome: 'Rafael', email: 'rafael@test.com', telefone: '11999999999',
  cargo: 'gerente', avatar: 'R', usuario: 'rafael', metaVendas: 100000,
  metaLeads: 50, metaConversao: 20, ativo: true,
}

const mockPedidos: Pedido[] = [
  {
    id: 1, numero: 'PED-001', clienteId: 1, vendedorId: 1, itens: [],
    observacoes: '', status: 'confirmado', dataCriacao: '2025-03-01T10:00:00Z',
    totalValor: 5000, omieCodigo: '12345', omieStatus: 'faturado',
  },
]

const mockClientes: Cliente[] = [
  {
    id: 1, razaoSocial: 'Empresa Teste', nomeFantasia: 'Teste', cnpj: '12345678000199',
    contatoNome: 'João', contatoTelefone: '11999999999', contatoEmail: 'joao@teste.com',
    etapa: 'follow_up', vendedorId: 1, valorEstimado: 10000, score: 80,
    produtosInteresse: [], tags: [], dataCadastro: '2025-01-01',
  } as any,
]

describe('OmieView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza header e tabs', () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    expect(screen.getByText('Omie ERP')).toBeInTheDocument()
    expect(screen.getByText('Acompanhamento')).toBeInTheDocument()
    expect(screen.getByText('Financeiro')).toBeInTheDocument()
    expect(screen.getByText('Logística')).toBeInTheDocument()
    expect(screen.getByText('Configuração')).toBeInTheDocument()
  })

  it('inicia na tab Acompanhamento', () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    // Should show the search input from Acompanhamento tab
    expect(screen.getByPlaceholderText(/Buscar por número/i)).toBeInTheDocument()
  })

  it('chama omieGetPedidosAcompanhamento ao montar', async () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(omieGetPedidosAcompanhamento).toHaveBeenCalledTimes(1)
    })
  })

  it('mostra mensagem quando não há pedidos', async () => {
    render(<OmieView pedidos={[]} clientes={[]} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(screen.getByText(/Nenhum pedido encontrado no Omie/i)).toBeInTheDocument()
    })
  })

  it('mostra pedidos na tabela quando dados retornam', async () => {
    vi.mocked(omieGetPedidosAcompanhamento).mockResolvedValue({
      success: true,
      data: [
        {
          pedidoId: 1, numero: 'PED-001', clienteNome: 'Empresa Teste', clienteId: 1,
          vendedorNome: 'Rafael', valor: 5000, dataCriacao: '2025-03-01T10:00:00Z',
          statusCrm: 'confirmado', statusOmie: 'faturado', etapaOmie: 'Faturar',
          nf: '1234', codigoRastreio: 'BR123', dataFaturamento: '10/03/2025', omieCodigo: '12345',
        },
      ],
    })

    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(screen.getByText('PED-001')).toBeInTheDocument()
      expect(screen.getByText('Empresa Teste')).toBeInTheDocument()
      expect(screen.getByText('1234')).toBeInTheDocument()
    })
  })

  it('filtra pedidos pela busca', async () => {
    vi.mocked(omieGetPedidosAcompanhamento).mockResolvedValue({
      success: true,
      data: [
        {
          pedidoId: 1, numero: 'PED-001', clienteNome: 'Empresa A', clienteId: 1,
          vendedorNome: 'Rafael', valor: 5000, dataCriacao: '2025-03-01T10:00:00Z',
          statusCrm: 'confirmado', statusOmie: 'faturado', etapaOmie: '', nf: '', codigoRastreio: '', dataFaturamento: '', omieCodigo: '1',
        },
        {
          pedidoId: 2, numero: 'PED-002', clienteNome: 'Empresa B', clienteId: 2,
          vendedorNome: 'Rafael', valor: 3000, dataCriacao: '2025-03-02T10:00:00Z',
          statusCrm: 'confirmado', statusOmie: 'enviado', etapaOmie: '', nf: '', codigoRastreio: '', dataFaturamento: '', omieCodigo: '2',
        },
      ],
    })

    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(screen.getByText('PED-001')).toBeInTheDocument()
      expect(screen.getByText('PED-002')).toBeInTheDocument()
    })

    // Type in search box
    const searchInput = screen.getByPlaceholderText(/Buscar por número/i)
    fireEvent.change(searchInput, { target: { value: 'Empresa A' } })

    expect(screen.getByText('PED-001')).toBeInTheDocument()
    expect(screen.queryByText('PED-002')).not.toBeInTheDocument()
  })

  // ─── Tab Financeiro ───

  it('muda para tab Financeiro e carrega dados', async () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    fireEvent.click(screen.getByText('Financeiro'))

    await waitFor(() => {
      expect(omieGetFinanceiroResumo).toHaveBeenCalled()
    })
  })

  it('mostra KPIs financeiros', async () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    fireEvent.click(screen.getByText('Financeiro'))

    await waitFor(() => {
      expect(screen.getByText('Total a Receber')).toBeInTheDocument()
      expect(screen.getByText('Total a Pagar')).toBeInTheDocument()
      expect(screen.getByText('Saldo')).toBeInTheDocument()
    })
  })

  // ─── Tab Logística ───

  it('muda para tab Logística', async () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    fireEvent.click(screen.getByText('Logística'))

    expect(screen.getByText(/Logística & Entregas/i)).toBeInTheDocument()
  })

  it('botão Sync Logístico funciona', async () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    fireEvent.click(screen.getByText('Logística'))
    fireEvent.click(screen.getByText('Sync Logístico'))

    await waitFor(() => {
      expect(omieSyncLogistics).toHaveBeenCalledTimes(1)
    })
  })

  // ─── Tab Config ───

  it('muda para tab Configuração e mostra OmieIntegration', () => {
    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    fireEvent.click(screen.getByText('Configuração'))

    expect(screen.getByTestId('omie-integration')).toBeInTheDocument()
  })

  // ─── Modal Entrega ───

  it('abre modal ao clicar em Detalhar', async () => {
    vi.mocked(omieGetPedidosAcompanhamento).mockResolvedValue({
      success: true,
      data: [
        {
          pedidoId: 1, numero: 'PED-001', clienteNome: 'Empresa Teste', clienteId: 1,
          vendedorNome: 'Rafael', valor: 5000, dataCriacao: '2025-03-01T10:00:00Z',
          statusCrm: 'confirmado', statusOmie: 'faturado', etapaOmie: 'Faturar',
          nf: '1234', codigoRastreio: 'BR123', dataFaturamento: '10/03/2025', omieCodigo: '12345',
        },
      ],
    })

    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(screen.getByText('PED-001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Detalhar/i))

    await waitFor(() => {
      expect(omieConsultarEntrega).toHaveBeenCalledWith(1)
      expect(screen.getByText('Detalhes da Entrega')).toBeInTheDocument()
    })
  })

  it('mostra erro no modal quando consulta falha', async () => {
    vi.mocked(omieGetPedidosAcompanhamento).mockResolvedValue({
      success: true,
      data: [
        {
          pedidoId: 99, numero: 'PED-099', clienteNome: 'Test', clienteId: 1,
          vendedorNome: 'Rafael', valor: 1000, dataCriacao: '2025-03-01T10:00:00Z',
          statusCrm: 'confirmado', statusOmie: 'enviado', etapaOmie: '',
          nf: '', codigoRastreio: '', dataFaturamento: '', omieCodigo: '99',
        },
      ],
    })
    vi.mocked(omieConsultarEntrega).mockResolvedValue({ success: false, error: 'Pedido não encontrado no Omie' })

    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(screen.getByText('PED-099')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Detalhar/i))

    await waitFor(() => {
      expect(screen.getByText(/Pedido não encontrado/i)).toBeInTheDocument()
    })
  })

  // ─── Error states ───

  it('mostra erro quando acompanhamento falha', async () => {
    vi.mocked(omieGetPedidosAcompanhamento).mockResolvedValue({ success: false, error: 'Erro de conexão' })

    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(screen.getByText(/Erro de conexão/i)).toBeInTheDocument()
    })
  })

  it('mostra erro quando financeiro falha', async () => {
    vi.mocked(omieGetFinanceiroResumo).mockResolvedValue({ success: false, error: 'Credenciais inválidas' })

    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    fireEvent.click(screen.getByText('Financeiro'))

    await waitFor(() => {
      expect(screen.getByText(/Credenciais inválidas/i)).toBeInTheDocument()
    })
  })

  // ─── KPI counts ───

  it('mostra KPIs com contagem correta por status', async () => {
    vi.mocked(omieGetPedidosAcompanhamento).mockResolvedValue({
      success: true,
      data: [
        { pedidoId: 1, numero: 'P1', clienteNome: 'A', clienteId: 1, vendedorNome: 'R', valor: 100, dataCriacao: '2025-01-01', statusCrm: 'confirmado', statusOmie: 'faturado', etapaOmie: '', nf: '', codigoRastreio: '', dataFaturamento: '', omieCodigo: '1' },
        { pedidoId: 2, numero: 'P2', clienteNome: 'B', clienteId: 2, vendedorNome: 'R', valor: 200, dataCriacao: '2025-01-02', statusCrm: 'confirmado', statusOmie: 'faturado', etapaOmie: '', nf: '', codigoRastreio: '', dataFaturamento: '', omieCodigo: '2' },
        { pedidoId: 3, numero: 'P3', clienteNome: 'C', clienteId: 3, vendedorNome: 'R', valor: 300, dataCriacao: '2025-01-03', statusCrm: 'confirmado', statusOmie: 'entregue', etapaOmie: '', nf: '', codigoRastreio: '', dataFaturamento: '', omieCodigo: '3' },
      ],
    })

    render(<OmieView pedidos={mockPedidos} clientes={mockClientes} vendedores={[mockVendedor]} loggedUser={mockVendedor} />)

    await waitFor(() => {
      expect(screen.getByText('Faturados')).toBeInTheDocument()
      expect(screen.getByText('Entregues')).toBeInTheDocument()
    })
  })
})
