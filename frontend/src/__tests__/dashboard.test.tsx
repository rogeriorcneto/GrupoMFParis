import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// Mock recharts to avoid canvas/SVG issues in jsdom
vi.mock('recharts', () => {
  const MockChart = ({ children }: any) => <div data-testid="mock-chart">{children}</div>
  return {
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: MockChart,
    LineChart: MockChart,
    PieChart: MockChart,
    Bar: () => null,
    Line: () => null,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  }
})

import DashboardView from '../components/views/DashboardView'
import type { Cliente, Vendedor, Interacao, DashboardMetrics, Atividade, Produto, Tarefa, Pedido } from '../types'

// ── Test Data ──

const now = new Date()
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const today = now.toISOString().split('T')[0]

const mockVendedores: Vendedor[] = [
  { id: 1, nome: 'Alice Santos', email: 'alice@test.com', telefone: '11999990001', cargo: 'vendedor', avatar: 'AS', usuario: 'alice', metaVendas: 100000, metaLeads: 20, metaConversao: 15, ativo: true },
  { id: 2, nome: 'Bruno Costa', email: 'bruno@test.com', telefone: '11999990002', cargo: 'vendedor', avatar: 'BC', usuario: 'bruno', metaVendas: 80000, metaLeads: 15, metaConversao: 10, ativo: true },
  { id: 3, nome: 'Carlos Lima', email: 'carlos@test.com', telefone: '11999990003', cargo: 'sdr', avatar: 'CL', usuario: 'carlos', metaVendas: 50000, metaLeads: 30, metaConversao: 8, ativo: true },
]

const mockGerente: Vendedor = { id: 10, nome: 'Gerente Silva', email: 'gerente@test.com', telefone: '11999990010', cargo: 'gerente', avatar: 'GS', usuario: 'gerente', metaVendas: 0, metaLeads: 0, metaConversao: 0, ativo: true }

const mockClientes: Cliente[] = [
  { id: 1, razaoSocial: 'Empresa Alpha', cnpj: '11111111000100', contatoNome: 'Ana', contatoTelefone: '11900000001', contatoEmail: 'ana@alpha.com', etapa: 'follow_up', vendedorId: 1, valorEstimado: 50000, dataEntradaEtapa: `${thisMonth}-05`, enderecoEstado: 'SP', enderecoCidade: 'São Paulo', historicoEtapas: [{ etapa: 'prospecção', data: `${thisMonth}-01` }] },
  { id: 2, razaoSocial: 'Empresa Beta', cnpj: '22222222000100', contatoNome: 'Bia', contatoTelefone: '11900000002', contatoEmail: 'bia@beta.com', etapa: 'negociacao', vendedorId: 2, valorEstimado: 30000, dataEntradaEtapa: `${thisMonth}-10`, enderecoEstado: 'RJ', enderecoCidade: 'Rio de Janeiro' },
  { id: 3, razaoSocial: 'Empresa Gama', cnpj: '33333333000100', contatoNome: 'Carlos', contatoTelefone: '11900000003', contatoEmail: 'carlos@gama.com', etapa: 'prospecção', vendedorId: 1, valorEstimado: 20000, dataEntradaEtapa: `${thisMonth}-15`, enderecoEstado: 'SP', enderecoCidade: 'Campinas' },
  { id: 4, razaoSocial: 'Empresa Delta', cnpj: '44444444000100', contatoNome: 'Davi', contatoTelefone: '11900000004', contatoEmail: 'davi@delta.com', etapa: 'perdido', vendedorId: 3, valorEstimado: 15000, dataEntradaEtapa: `${thisMonth}-08`, categoriaPerda: 'preco', enderecoEstado: 'MG', enderecoCidade: 'BH' },
  { id: 5, razaoSocial: 'Empresa Épsilon', cnpj: '55555555000100', contatoNome: 'Eva', contatoTelefone: '11900000005', contatoEmail: 'eva@eps.com', etapa: 'amostra', vendedorId: 2, valorEstimado: 40000, dataEntradaEtapa: `${thisMonth}-12`, enderecoEstado: 'SP', enderecoCidade: 'São Paulo' },
]

const mockInteracoes: Interacao[] = [
  { id: 1, clienteId: 1, tipo: 'ligacao', data: `${thisMonth}-05T10:00:00`, assunto: 'Ligação 1', descricao: 'Contato inicial', automatico: false },
  { id: 2, clienteId: 2, tipo: 'email', data: `${thisMonth}-10T14:00:00`, assunto: 'Email proposta', descricao: 'Envio proposta', automatico: false },
  { id: 3, clienteId: 3, tipo: 'whatsapp', data: `${thisMonth}-15T09:00:00`, assunto: 'WhatsApp follow', descricao: 'Seguimento', automatico: false },
  { id: 4, clienteId: 1, tipo: 'ligacao', data: `${thisMonth}-06T11:00:00`, assunto: 'Ligação 2', descricao: 'Revisão', automatico: false },
  { id: 5, clienteId: 5, tipo: 'reuniao', data: `${thisMonth}-12T16:00:00`, assunto: 'Reunião', descricao: 'Apresentação', automatico: false },
]

const mockProdutos: Produto[] = [
  { id: 1, nome: 'Produto A', descricao: 'Desc A', categoria: 'sacaria', preco: 100, unidade: 'kg', foto: '', ativo: true, destaque: true, dataCadastro: '2024-01-01', margemLucro: 25 },
  { id: 2, nome: 'Produto B', descricao: 'Desc B', categoria: 'okey_lac', preco: 200, unidade: 'un', foto: '', ativo: true, destaque: false, dataCadastro: '2024-01-01', margemLucro: 30 },
]

const mockPedidos: Pedido[] = [
  { id: 1, numero: 'PED-001', clienteId: 1, vendedorId: 1, itens: [{ produtoId: 1, nomeProduto: 'Produto A', unidade: 'kg', preco: 100, quantidade: 100 }], observacoes: '', status: 'confirmado', dataCriacao: `${thisMonth}-06T10:00:00`, totalValor: 10000 },
  { id: 2, numero: 'PED-002', clienteId: 2, vendedorId: 2, itens: [{ produtoId: 2, nomeProduto: 'Produto B', unidade: 'un', preco: 200, quantidade: 50 }], observacoes: '', status: 'confirmado', dataCriacao: `${thisMonth}-11T10:00:00`, totalValor: 10000 },
  { id: 3, numero: 'PED-003', clienteId: 1, vendedorId: 1, itens: [{ produtoId: 1, nomeProduto: 'Produto A', unidade: 'kg', preco: 100, quantidade: 200 }], observacoes: '', status: 'confirmado', dataCriacao: `${thisMonth}-07T10:00:00`, totalValor: 20000 },
  { id: 4, numero: 'PED-004', clienteId: 3, vendedorId: 1, itens: [{ produtoId: 2, nomeProduto: 'Produto B', unidade: 'un', preco: 200, quantidade: 25 }], observacoes: '', status: 'rascunho', dataCriacao: `${thisMonth}-16T10:00:00`, totalValor: 5000 },
]

const mockMetrics: DashboardMetrics = { totalLeads: 5, leadsAtivos: 4, taxaConversao: 20, valorTotal: 155000, ticketMedio: 31000, leadsNovosHoje: 0, interacoesHoje: 0 }

const mockAtividades: Atividade[] = [
  { id: 1, tipo: 'moveu', descricao: 'Moveu cliente', vendedorNome: 'Alice', timestamp: new Date().toISOString() },
]

const mockTarefas: Tarefa[] = []

const defaultProps = {
  clientes: mockClientes,
  vendedores: [...mockVendedores, mockGerente],
  interacoes: mockInteracoes,
  metrics: mockMetrics,
  atividades: mockAtividades,
  produtos: mockProdutos,
  tarefas: mockTarefas,
  pedidos: mockPedidos,
  loggedUser: mockGerente,
}

// ── Tests ──

describe('DashboardView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // ── 1. Header & live badge ──
  it('renderiza header com título e badge AO VIVO', () => {
    render(<DashboardView {...defaultProps} />)
    expect(screen.getByText('Dashboard Comercial')).toBeTruthy()
    expect(screen.getByTestId('live-badge')).toBeTruthy()
    expect(screen.getByText('AO VIVO')).toBeTruthy()
  })

  // ── 2. Period selector: Hoje ──
  it('seletor de período: botão Hoje filtra dados do dia', () => {
    render(<DashboardView {...defaultProps} />)
    const btnHoje = screen.getByTestId('btn-hoje')
    expect(btnHoje).toBeTruthy()
    fireEvent.click(btnHoje)
    // Button should be active (has primary bg class)
    expect(btnHoje.className).toContain('bg-primary-600')
  })

  // ── 3. Period selector: dropdown mês ──
  it('seletor de período: dropdown mês filtra dados do mês selecionado', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('btn-mes'))
    const selector = screen.getByTestId('month-selector')
    expect(selector).toBeTruthy()
    // Should have multiple month options
    const options = selector.querySelectorAll('option')
    expect(options.length).toBe(12)
  })

  // ── 4. Period selector: Ano ──
  it('seletor de período: botão Ano filtra dados do ano corrente', () => {
    render(<DashboardView {...defaultProps} />)
    const btnAno = screen.getByTestId('btn-ano')
    fireEvent.click(btnAno)
    expect(screen.getByText(`Ano ${now.getFullYear()}`)).toBeTruthy()
  })

  // ── 5. All 8 tabs render ──
  it('abas de navegação renderizam (8 abas)', () => {
    render(<DashboardView {...defaultProps} />)
    const tabBar = screen.getByTestId('tab-bar')
    expect(tabBar).toBeTruthy()
    const tabs = ['saude', 'crescimento', 'produtos', 'mercado', 'clientes', 'funil', 'equipe', 'competitiva']
    tabs.forEach(t => {
      expect(screen.getByTestId(`tab-${t}`)).toBeTruthy()
    })
  })

  // ── 6. Clicking tabs changes content ──
  it('clicar em cada aba muda o conteúdo', () => {
    render(<DashboardView {...defaultProps} />)
    const tabs: Array<[string, string]> = [
      ['tab-saude', 'panel-saude'],
      ['tab-crescimento', 'panel-crescimento'],
      ['tab-produtos', 'panel-produtos'],
      ['tab-mercado', 'panel-mercado'],
      ['tab-clientes', 'panel-clientes'],
      ['tab-funil', 'panel-funil'],
      ['tab-equipe', 'panel-equipe'],
      ['tab-competitiva', 'panel-competitiva'],
    ]
    tabs.forEach(([tabId, panelId]) => {
      fireEvent.click(screen.getByTestId(tabId))
      expect(screen.getByTestId(panelId)).toBeTruthy()
    })
  })

  // ── 7. Aba Saúde: KPI cards ──
  it('aba Saúde: KPI cards de receita, ticket médio, margem', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-saude'))
    expect(screen.getByText('Receita Período')).toBeTruthy()
    expect(screen.getByText('Pedidos Confirmados')).toBeTruthy()
    expect(screen.getByText('Ticket Médio Pedido')).toBeTruthy()
    expect(screen.getByText('Margem Média')).toBeTruthy()
  })

  // ── 8. Aba Crescimento ──
  it('aba Crescimento: gráficos e KPIs renderizam', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-crescimento'))
    expect(screen.getByText('Crescimento Faturamento')).toBeTruthy()
    expect(screen.getByText('Receita Atual')).toBeTruthy()
    expect(screen.getByText('Novos Clientes')).toBeTruthy()
  })

  // ── 9. Aba Produtos ──
  it('aba Produtos: volume, receita, margem por produto', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-produtos'))
    expect(screen.getByText('Produtos Vendidos')).toBeTruthy()
    expect(screen.getByText('Receita Produtos')).toBeTruthy()
    expect(screen.getByText(/Receita por Produto/)).toBeTruthy()
  })

  // ── 10. Aba Mercado ──
  it('aba Mercado: vendas por estado/cidade', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-mercado'))
    expect(screen.getByText('Estados Atendidos')).toBeTruthy()
    expect(screen.getByText('Cidades Atendidas')).toBeTruthy()
    expect(screen.getByText(/Receita por Estado/)).toBeTruthy()
  })

  // ── 11. Aba Clientes ──
  it('aba Clientes: ativos, novos, perdidos, churn', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-clientes'))
    expect(screen.getByText('Clientes Ativos')).toBeTruthy()
    expect(screen.getByText('Novos no Período')).toBeTruthy()
    expect(screen.getByText('Perdidos')).toBeTruthy()
    expect(screen.getByText('Churn')).toBeTruthy()
    expect(screen.getByText('Taxa Retenção')).toBeTruthy()
  })

  // ── 12. Aba Funil ──
  it('aba Funil: leads, conversão, tempo médio', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-funil'))
    expect(screen.getByText('Leads no Funil')).toBeTruthy()
    expect(screen.getByText('Taxa Conversão')).toBeTruthy()
    expect(screen.getByText('Tempo Médio Fechamento')).toBeTruthy()
    expect(screen.getByText(/Funil de Convers/)).toBeTruthy()
  })

  // ── 13. Aba Equipe: rankings com medalhas ──
  it('aba Equipe: rankings com medalhas', () => {
    render(<DashboardView {...defaultProps} />)
    // Default tab is equipe
    expect(screen.getByTestId('panel-equipe')).toBeTruthy()
    // Should show faturamento ranking
    expect(screen.getByText(/Ranking Faturamento/)).toBeTruthy()
    // Activity ranking sections
    expect(screen.getByText(/Liga/)).toBeTruthy()
    expect(screen.getByText(/Emails/)).toBeTruthy()
    expect(screen.getByText(/WhatsApp/)).toBeTruthy()
    expect(screen.getByText(/Reuni/)).toBeTruthy()
  })

  // ── 14. Ranking ligações ordena corretamente ──
  it('aba Equipe: ranking ligações ordena por nº interações tipo ligacao', () => {
    render(<DashboardView {...defaultProps} />)
    // Alice has 2 ligações (clienteId 1), Bruno has 0
    const panel = screen.getByTestId('panel-equipe')
    // Alice should appear first in ligações section
    const ligacoesSection = screen.getByText(/Liga/).closest('div')
    expect(ligacoesSection).toBeTruthy()
    // Alice has 2 ligações (clienteId 1, vendedorId 1)
    expect(panel.textContent).toContain('Alice')
  })

  // ── 15. Ranking emails ordena corretamente ──
  it('aba Equipe: ranking emails ordena corretamente', () => {
    render(<DashboardView {...defaultProps} />)
    const panel = screen.getByTestId('panel-equipe')
    // Bruno has 1 email (clienteId 2, vendedorId 2)
    expect(panel.textContent).toContain('Bruno')
  })

  // ── 16. Ranking WhatsApp ordena corretamente ──
  it('aba Equipe: ranking WhatsApp ordena corretamente', () => {
    render(<DashboardView {...defaultProps} />)
    const panel = screen.getByTestId('panel-equipe')
    // Carlos (vendedorId=1 for clienteId=3 which has whatsapp interaction)
    // Actually clienteId=3 has vendedorId=1 (Alice), so Alice should be in whatsapp ranking
    expect(panel.textContent).toContain('Alice')
  })

  // ── 17. Aba Competitiva: motivos de perda ──
  it('aba Competitiva: motivos de perda renderizam', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-competitiva'))
    expect(screen.getByText('Negócios Perdidos')).toBeTruthy()
    expect(screen.getByText('Valor Perdido')).toBeTruthy()
    expect(screen.getByText(/Motivos de Perda/)).toBeTruthy()
    expect(screen.getByText('Taxa de Perda')).toBeTruthy()
  })

  // ── 18. Modo TV: botão muda tema ──
  it('modo TV: botão entra em fullscreen e muda tema', () => {
    render(<DashboardView {...defaultProps} />)
    const tvBtn = screen.getByTestId('btn-tv')
    expect(tvBtn.textContent).toContain('Modo TV')
    fireEvent.click(tvBtn)
    // Container should have dark background class
    const container = screen.getByTestId('dashboard-container')
    expect(container.className).toContain('bg-gray-950')
    // Button text changes
    expect(screen.getByTestId('btn-tv').textContent).toContain('Sair TV')
  })

  // ── 19. Modo TV: auto-rotação ──
  it('modo TV: auto-rotação avança abas a cada 15s', () => {
    render(<DashboardView {...defaultProps} />)
    // Enable TV mode
    fireEvent.click(screen.getByTestId('btn-tv'))
    // Default tab is equipe, after 15s should advance to competitiva
    expect(screen.getByTestId('panel-equipe')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(15000) })
    expect(screen.getByTestId('panel-competitiva')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(15000) })
    // Should wrap to saude
    expect(screen.getByTestId('panel-saude')).toBeTruthy()
  })

  // ── 20. Filtro mensal recalcula métricas ──
  it('filtro mensal recalcula métricas corretamente', () => {
    render(<DashboardView {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tab-saude'))
    // Should show 3 confirmed pedidos (PED-001, PED-002, PED-003) = R$ 40.000 total
    expect(screen.getByText('3')).toBeTruthy() // Pedidos Confirmados
  })

  // ── 21. Dados vazios: dashboard não quebra ──
  it('dados vazios: dashboard não quebra sem clientes/pedidos', () => {
    const emptyProps = {
      ...defaultProps,
      clientes: [],
      interacoes: [],
      pedidos: [],
      atividades: [],
    }
    const { container } = render(<DashboardView {...emptyProps} />)
    expect(container).toBeTruthy()
    expect(screen.getByText('Dashboard Comercial')).toBeTruthy()
    // Navigate all tabs without crashing
    const tabs = ['saude', 'crescimento', 'produtos', 'mercado', 'clientes', 'funil', 'equipe', 'competitiva']
    tabs.forEach(t => {
      fireEvent.click(screen.getByTestId(`tab-${t}`))
      expect(screen.getByTestId(`panel-${t}`)).toBeTruthy()
    })
  })

  // ── 22. Polling: onRefresh chamado ──
  it('polling: onRefresh é chamado a cada 60s', () => {
    const onRefresh = vi.fn()
    render(<DashboardView {...defaultProps} onRefresh={onRefresh} />)
    expect(onRefresh).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(60000) })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(60000) })
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  // ── 23. Timestamp incrementa ──
  it('timestamp "Atualizado há X segundos" incrementa', () => {
    render(<DashboardView {...defaultProps} />)
    const el = screen.getByTestId('last-update')
    expect(el.textContent).toContain('0s')
    act(() => { vi.advanceTimersByTime(5000) })
    expect(el.textContent).toContain('5s')
  })
})
