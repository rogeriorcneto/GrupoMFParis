import React, { useState, useEffect, useRef } from 'react'
import { 
  HomeIcon, 
  FunnelIcon, 
  UserGroupIcon,
  ChartBarIcon,
  PaperAirplaneIcon,
  MapIcon,
  MagnifyingGlassIcon,
  BellIcon,
  XMarkIcon,
  PlusIcon,
  SparklesIcon,
  ArrowUpTrayIcon,
  SunIcon,
  MoonIcon,
  AdjustmentsHorizontalIcon,
  DocumentTextIcon,
  CubeIcon,
  PhotoIcon,
  ShoppingCartIcon
} from '@heroicons/react/24/outline'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts'

type ViewType = 'dashboard' | 'funil' | 'clientes' | 'automacoes' | 'mapa' | 'prospeccao' | 'tarefas' | 'social' | 'integracoes' | 'equipe' | 'relatorios' | 'templates' | 'produtos' | 'pedidos'

interface HistoricoEtapa {
  etapa: string
  data: string
  de?: string
}

interface Cliente {
  id: number
  razaoSocial: string
  nomeFantasia?: string
  cnpj: string
  contatoNome: string
  contatoTelefone: string
  contatoEmail: string
  endereco?: string
  etapa: string
  vendedorId?: number
  motivoPerda?: string
  categoriaPerda?: 'preco' | 'prazo' | 'qualidade' | 'concorrencia' | 'sem_resposta' | 'outro'
  score?: number
  ultimaInteracao?: string
  diasInativo?: number
  valorEstimado?: number
  produtosInteresse?: string[]
  // Rastreio de jornada
  dataEntradaEtapa?: string
  etapaAnterior?: string
  historicoEtapas?: HistoricoEtapa[]
  // Amostra
  dataEnvioAmostra?: string
  statusAmostra?: 'enviada' | 'aguardando_resposta' | 'aprovada' | 'rejeitada'
  // Homologado
  dataHomologacao?: string
  proximoPedidoPrevisto?: string
  // Negociação
  valorProposta?: number
  dataProposta?: string
  // Pós-Venda
  statusEntrega?: 'preparando' | 'enviado' | 'entregue'
  dataUltimoPedido?: string
  // Perdido
  dataPerda?: string
}

interface FormData {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  contatoNome: string
  contatoTelefone: string
  contatoEmail: string
  endereco: string
  valorEstimado?: string
  produtosInteresse: string
  vendedorId?: string
}

interface Interacao {
  id: number
  clienteId: number
  tipo: 'email' | 'whatsapp' | 'instagram' | 'linkedin' | 'ligacao' | 'reuniao'
  data: string
  assunto: string
  descricao: string
  automatico: boolean
}

interface DragItem {
  cliente: Cliente
  fromStage: string
}

interface AICommand {
  id: string
  command: string
  response: string
  timestamp: string
}

interface Notificacao {
  id: number
  tipo: 'info' | 'warning' | 'success' | 'error'
  titulo: string
  mensagem: string
  timestamp: string
  lida: boolean
  clienteId?: number
}

interface Atividade {
  id: number
  tipo: 'moveu' | 'adicionou' | 'editou' | 'interacao' | 'tarefa'
  descricao: string
  vendedorNome: string
  timestamp: string
}

interface Template {
  id: number
  nome: string
  canal: 'email' | 'whatsapp'
  etapa: string
  assunto?: string
  corpo: string
}

interface Produto {
  id: number
  nome: string
  descricao: string
  categoria: 'sacaria' | 'okey_lac' | 'varejo_lacteo' | 'cafe' | 'outros'
  preco: number
  unidade: string
  foto: string
  sku?: string
  estoque?: number
  pesoKg?: number
  margemLucro?: number
  ativo: boolean
  destaque: boolean
  dataCadastro: string
}

interface DashboardMetrics {
  totalLeads: number
  leadsAtivos: number
  taxaConversao: number
  valorTotal: number
  ticketMedio: number
  leadsNovosHoje: number
  interacoesHoje: number
}

interface DashboardViewProps {
  clientes: Cliente[]
  metrics: DashboardMetrics
  vendedores: Vendedor[]
  atividades: Atividade[]
  interacoes: Interacao[]
  produtos: Produto[]
  tarefas: Tarefa[]
  loggedUser: Vendedor | null
}

interface TemplateMsg {
  id: number
  canal: Interacao['tipo']
  nome: string
  conteudo: string
}

interface CadenciaStep {
  id: number
  canal: Interacao['tipo']
  delayDias: number
  templateId: number
}

interface Cadencia {
  id: number
  nome: string
  steps: CadenciaStep[]
  pausarAoResponder: boolean
}

interface Campanha {
  id: number
  nome: string
  cadenciaId: number
  etapa?: string
  minScore?: number
  diasInativoMin?: number
  status: 'rascunho' | 'ativa' | 'pausada'
}

interface JobAutomacao {
  id: number
  clienteId: number
  canal: Interacao['tipo']
  tipo: 'propaganda' | 'contato'
  status: 'pendente' | 'enviado' | 'pausado' | 'erro'
  agendadoPara: string
  templateId?: number
  campanhaId?: number
}

interface Tarefa {
  id: number
  titulo: string
  descricao?: string
  data: string
  hora?: string
  tipo: 'ligacao' | 'reuniao' | 'email' | 'whatsapp' | 'follow-up' | 'outro'
  status: 'pendente' | 'concluida'
  prioridade: 'alta' | 'media' | 'baixa'
  clienteId?: number
}

interface Vendedor {
  id: number
  nome: string
  email: string
  telefone: string
  cargo: 'vendedor' | 'gerente' | 'sdr'
  avatar: string
  usuario: string
  senha: string
  metaVendas: number
  metaLeads: number
  metaConversao: number
  ativo: boolean
}

interface ItemPedido {
  produtoId: number
  nomeProduto: string
  sku?: string
  unidade: string
  preco: number
  quantidade: number
}

interface Pedido {
  id: number
  numero: string
  clienteId: number
  vendedorId: number
  itens: ItemPedido[]
  observacoes: string
  status: 'rascunho' | 'enviado' | 'confirmado' | 'cancelado'
  dataCriacao: string
  dataEnvio?: string
  totalValor: number
}

interface FunilViewProps {
  clientes: Cliente[]
  onDragStart: (e: React.DragEvent, cliente: Cliente, fromStage: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, toStage: string) => void
}

interface ClientesViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  onNewCliente: () => void
  onEditCliente: (cliente: Cliente) => void
}

function App() {
  const [loggedUser, setLoggedUser] = useState<Vendedor | null>(null)
  const [loginUsuario, setLoginUsuario] = useState('')
  const [loginSenha, setLoginSenha] = useState('')
  const [loginError, setLoginError] = useState('')

  const [darkMode, setDarkMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([
    { id: 1, tipo: 'moveu', descricao: 'SuperBH Ltda movido para Negociação', vendedorNome: 'Carlos Silva', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, tipo: 'adicionou', descricao: 'Novo lead: Rede Mineirão adicionado', vendedorNome: 'Ana Oliveira', timestamp: new Date(Date.now() - 7200000).toISOString() },
    { id: 3, tipo: 'interacao', descricao: 'Email enviado para Distribuidora BH', vendedorNome: 'Roberto Lima', timestamp: new Date(Date.now() - 10800000).toISOString() },
    { id: 4, tipo: 'tarefa', descricao: 'Tarefa concluída: Preparar proposta comercial', vendedorNome: 'Carlos Silva', timestamp: new Date(Date.now() - 14400000).toISOString() },
    { id: 5, tipo: 'editou', descricao: 'Dados atualizados: Atacadão MG', vendedorNome: 'Fernanda Costa', timestamp: new Date(Date.now() - 18000000).toISOString() },
  ])
  const [templates, setTemplates] = useState<Template[]>([
    { id: 1, nome: 'Primeiro Contato', canal: 'email', etapa: 'prospecção', assunto: 'Apresentação MF Paris — Soluções para seu negócio', corpo: 'Olá {nome},\n\nSou {vendedor} da MF Paris. Gostaria de apresentar nossas soluções em lácteos, compostos e café para {empresa}.\n\nPodemos agendar uma conversa?\n\nAtt,\n{vendedor}' },
    { id: 2, nome: 'Envio de Amostra', canal: 'email', etapa: 'amostra', assunto: 'Confirmação de envio de amostras — MF Paris', corpo: 'Olá {nome},\n\nConfirmamos o envio das amostras solicitadas para {empresa}. Prazo estimado: 3 dias úteis.\n\nQualquer dúvida, estou à disposição.\n\nAtt,\n{vendedor}' },
    { id: 3, nome: 'Follow-up Homologação', canal: 'email', etapa: 'homologado', assunto: 'Como foi a avaliação? — MF Paris', corpo: 'Olá {nome},\n\nGostaria de saber como foi a avaliação dos nossos produtos em {empresa}. Podemos agendar uma reunião para discutir os próximos passos?\n\nAtt,\n{vendedor}' },
    { id: 4, nome: 'Proposta Comercial', canal: 'email', etapa: 'negociacao', assunto: 'Proposta Comercial — MF Paris para {empresa}', corpo: 'Olá {nome},\n\nSegue em anexo nossa proposta comercial personalizada para {empresa}.\n\nCondições especiais válidas até o final do mês.\n\nAtt,\n{vendedor}' },
    { id: 5, nome: 'Boas-vindas Pós-Venda', canal: 'email', etapa: 'pos_venda', assunto: 'Bem-vindo à MF Paris! 🎉', corpo: 'Olá {nome},\n\nÉ com grande satisfação que damos boas-vindas a {empresa} como nosso novo parceiro!\n\nSeu gerente de conta é {vendedor}. Qualquer necessidade, conte conosco.\n\nAtt,\nEquipe MF Paris' },
    { id: 6, nome: 'Primeiro Contato WhatsApp', canal: 'whatsapp', etapa: 'prospecção', corpo: 'Olá {nome}! 👋\nSou {vendedor} da *MF Paris*. Temos soluções em lácteos, compostos e café para {empresa}.\nPosso enviar nosso catálogo? 📋' },
    { id: 7, nome: 'Lembrete de Amostra', canal: 'whatsapp', etapa: 'amostra', corpo: 'Olá {nome}! 📦\nAs amostras da *MF Paris* já foram enviadas para {empresa}. Previsão de chegada: 3 dias úteis.\nQualquer dúvida, estou aqui! 😊' },
    { id: 8, nome: 'Follow-up WhatsApp', canal: 'whatsapp', etapa: 'negociacao', corpo: 'Olá {nome}! 🤝\nComo está a análise da nossa proposta para {empresa}?\nTemos condições especiais este mês. Posso ajudar em algo? 💬' },
  ])

  const [produtos, setProdutos] = useState<Produto[]>([
    // SACARIA 25kg — Linha Horizonte
    { id: 1, nome: 'Leite em Pó Integral 25kg', descricao: 'Rico em nutrientes essenciais, ideal para consumo direto e aplicações industriais. Produto possui SIF.', categoria: 'sacaria', preco: 650.00, unidade: 'sc', foto: '', sku: 'SAC-001', estoque: 200, pesoKg: 25, margemLucro: 18, ativo: true, destaque: true, dataCadastro: '2024-01-01' },
    { id: 2, nome: 'Leite em Pó Desnatado 25kg', descricao: 'Alternativa saudável com menor teor de gordura, preservando o sabor e os benefícios do leite.', categoria: 'sacaria', preco: 620.00, unidade: 'sc', foto: '', sku: 'SAC-002', estoque: 180, pesoKg: 25, margemLucro: 17, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
    { id: 3, nome: 'Soro de Leite 25kg', descricao: 'Ingrediente valioso utilizado em indústrias alimentícias, conhecido por suas propriedades nutricionais e funcionais.', categoria: 'sacaria', preco: 280.00, unidade: 'sc', foto: '', sku: 'SAC-003', estoque: 300, pesoKg: 25, margemLucro: 22, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
    { id: 4, nome: 'Maltodextrina 25kg', descricao: 'Melhora a textura ou o sabor, preserva alimentos e aumenta sua vida útil.', categoria: 'sacaria', preco: 190.00, unidade: 'sc', foto: '', sku: 'SAC-004', estoque: 250, pesoKg: 25, margemLucro: 20, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
    { id: 5, nome: 'Glucose 25kg', descricao: 'Seu principal uso é no mundo da confeitaria, mas sua aplicação é vasta.', categoria: 'sacaria', preco: 160.00, unidade: 'sc', foto: '', sku: 'SAC-005', estoque: 220, pesoKg: 25, margemLucro: 25, ativo: true, destaque: false, dataCadastro: '2024-01-01' },
    // Linha Okey Lac 25kg
    { id: 6, nome: 'Okey Lac Cream 25kg', descricao: 'Linha Okey Lac desenvolvida para substituição do leite em panificação, foodservice, indústrias de sorvetes e indústrias doces.', categoria: 'okey_lac', preco: 320.00, unidade: 'sc', foto: '', sku: 'OKL-001', estoque: 150, pesoKg: 25, margemLucro: 28, ativo: true, destaque: true, dataCadastro: '2024-01-05' },
    { id: 7, nome: 'Okey Lac Pro 25kg', descricao: 'Composto lácteo para aplicações profissionais em panificação e foodservice.', categoria: 'okey_lac', preco: 310.00, unidade: 'sc', foto: '', sku: 'OKL-002', estoque: 140, pesoKg: 25, margemLucro: 27, ativo: true, destaque: false, dataCadastro: '2024-01-05' },
    { id: 8, nome: 'Okey Lac Gourmet 25kg', descricao: 'Composto lácteo premium para aplicações gourmet e confeitaria.', categoria: 'okey_lac', preco: 340.00, unidade: 'sc', foto: '', sku: 'OKL-003', estoque: 120, pesoKg: 25, margemLucro: 30, ativo: true, destaque: false, dataCadastro: '2024-01-05' },
    { id: 9, nome: 'Okey Lac Açaí 25kg', descricao: 'Composto lácteo especial para preparo de açaí e sorvetes.', categoria: 'okey_lac', preco: 330.00, unidade: 'sc', foto: '', sku: 'OKL-004', estoque: 100, pesoKg: 25, margemLucro: 29, ativo: true, destaque: false, dataCadastro: '2024-01-05' },
    // VAREJO — Okey Lac
    { id: 10, nome: 'Okey Lac Panificação e Culinária 1kg', descricao: 'Ideal para pães, bolos, cremes doces e salgados e massas de pizza.', categoria: 'varejo_lacteo', preco: 18.90, unidade: 'un', foto: '', sku: 'VAR-001', estoque: 500, pesoKg: 1, margemLucro: 32, ativo: true, destaque: true, dataCadastro: '2024-01-10' },
    { id: 11, nome: 'Leite em Pó e Composto Lácteo 1kg', descricao: 'Fonte de cálcio e muito sabor. Feito sob medida para você. Disponível em 1kg, 400g e 200g.', categoria: 'varejo_lacteo', preco: 32.50, unidade: 'un', foto: '', sku: 'VAR-002', estoque: 600, pesoKg: 1, margemLucro: 25, ativo: true, destaque: false, dataCadastro: '2024-01-10' },
    { id: 12, nome: 'Okey Lac 1kg', descricao: 'Produto desenvolvido como excelente acréscimo para açaí.', categoria: 'varejo_lacteo', preco: 16.90, unidade: 'un', foto: '', sku: 'VAR-003', estoque: 400, pesoKg: 1, margemLucro: 30, ativo: true, destaque: false, dataCadastro: '2024-01-10' },
    { id: 13, nome: 'Chocominas 400g', descricao: 'Mistura de Cacau em pó para dissolução em leite.', categoria: 'varejo_lacteo', preco: 12.50, unidade: 'un', foto: '', sku: 'VAR-004', estoque: 800, pesoKg: 0.4, margemLucro: 35, ativo: true, destaque: false, dataCadastro: '2024-01-10' },
    // CAFÉ
    { id: 14, nome: 'Café Belveder 250g', descricao: 'Café Tradicional possui uma fragrância marcante e um aroma intenso, oriundo da torra de grãos selecionados. Disponível em 250g e 500g.', categoria: 'cafe', preco: 14.90, unidade: 'un', foto: '', sku: 'CAF-001', estoque: 350, pesoKg: 0.25, margemLucro: 28, ativo: true, destaque: false, dataCadastro: '2024-01-15' },
    { id: 15, nome: 'Café Molito 250g', descricao: 'Torra moderadamente escura a moderadamente clara — Moagem fina a média. Disponível em 250g e 500g.', categoria: 'cafe', preco: 13.50, unidade: 'un', foto: '', sku: 'CAF-002', estoque: 400, pesoKg: 0.25, margemLucro: 26, ativo: true, destaque: false, dataCadastro: '2024-01-15' },
    { id: 16, nome: 'Café Grão de Minas 250g', descricao: 'Tradicional e Extraforte. Disponível em 250g e 500g.', categoria: 'cafe', preco: 11.90, unidade: 'un', foto: '', sku: 'CAF-003', estoque: 450, pesoKg: 0.25, margemLucro: 24, ativo: true, destaque: false, dataCadastro: '2024-01-15' },
  ])

  const [activeView, setActiveView] = useState<ViewType>('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([
    {
      id: 1, razaoSocial: 'SuperBH Ltda', nomeFantasia: 'SuperBH Matriz', cnpj: '12.345.678/0001-90',
      contatoNome: 'João Silva', contatoTelefone: '(31) 99999-1111', contatoEmail: 'joao@superbh.com.br',
      endereco: 'Av. Afonso Pena, 1000 - Centro, BH - MG', etapa: 'prospecção', vendedorId: 1,
      score: 55, ultimaInteracao: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0], diasInativo: 5,
      valorEstimado: 150000, produtosInteresse: ['Leite em Pó Integral 25kg', 'Okey Lac Cream 25kg'],
      dataEntradaEtapa: new Date(Date.now() - 8 * 86400000).toISOString(), historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 8 * 86400000).toISOString() }]
    },
    {
      id: 2, razaoSocial: 'MegaMart Comercial', nomeFantasia: 'MegaMart', cnpj: '98.765.432/0001-10',
      contatoNome: 'Maria Santos', contatoTelefone: '(31) 99999-2222', contatoEmail: 'maria@megamart.com.br',
      endereco: 'Rua Rio de Janeiro, 500 - Lourdes, BH - MG', etapa: 'amostra', vendedorId: 2,
      score: 70, ultimaInteracao: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0], diasInativo: 2,
      valorEstimado: 85000, produtosInteresse: ['Café Belveder 250g', 'Chocominas 400g', 'Okey Lac Panificação e Culinária 1kg'],
      dataEntradaEtapa: new Date(Date.now() - 12 * 86400000).toISOString(), etapaAnterior: 'prospecção',
      dataEnvioAmostra: new Date(Date.now() - 12 * 86400000).toISOString().split('T')[0], statusAmostra: 'aguardando_resposta',
      historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 20 * 86400000).toISOString() }, { etapa: 'amostra', data: new Date(Date.now() - 12 * 86400000).toISOString(), de: 'prospecção' }]
    },
    {
      id: 3, razaoSocial: 'Padaria Pão de Minas', nomeFantasia: 'Pão de Minas', cnpj: '11.222.333/0001-44',
      contatoNome: 'Carlos Ferreira', contatoTelefone: '(31) 99999-3333', contatoEmail: 'carlos@paodeminas.com.br',
      endereco: 'Rua Paraíba, 200 - Funcionários, BH - MG', etapa: 'amostra', vendedorId: 1,
      score: 60, ultimaInteracao: new Date(Date.now() - 26 * 86400000).toISOString().split('T')[0], diasInativo: 26,
      valorEstimado: 42000, produtosInteresse: ['Okey Lac Panificação e Culinária 1kg', 'Leite em Pó Integral 25kg'],
      dataEntradaEtapa: new Date(Date.now() - 27 * 86400000).toISOString(), etapaAnterior: 'prospecção',
      dataEnvioAmostra: new Date(Date.now() - 27 * 86400000).toISOString().split('T')[0], statusAmostra: 'enviada',
      historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 35 * 86400000).toISOString() }, { etapa: 'amostra', data: new Date(Date.now() - 27 * 86400000).toISOString(), de: 'prospecção' }]
    },
    {
      id: 4, razaoSocial: 'Distribuidora Horizonte', nomeFantasia: 'Horizonte', cnpj: '44.555.666/0001-77',
      contatoNome: 'Ana Costa', contatoTelefone: '(31) 99999-4444', contatoEmail: 'ana@horizonte.com.br',
      endereco: 'Av. Cristiano Machado, 3000 - Cidade Nova, BH - MG', etapa: 'homologado', vendedorId: 1,
      score: 85, ultimaInteracao: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], diasInativo: 10,
      valorEstimado: 220000, produtosInteresse: ['Leite em Pó Integral 25kg', 'Leite em Pó Desnatado 25kg', 'Soro de Leite 25kg'],
      dataEntradaEtapa: new Date(Date.now() - 30 * 86400000).toISOString(), etapaAnterior: 'amostra',
      dataHomologacao: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      proximoPedidoPrevisto: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      dataEnvioAmostra: new Date(Date.now() - 50 * 86400000).toISOString().split('T')[0], statusAmostra: 'aprovada',
      historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 60 * 86400000).toISOString() }, { etapa: 'amostra', data: new Date(Date.now() - 50 * 86400000).toISOString(), de: 'prospecção' }, { etapa: 'homologado', data: new Date(Date.now() - 30 * 86400000).toISOString(), de: 'amostra' }]
    },
    {
      id: 5, razaoSocial: 'Rede Sabor & Cia', nomeFantasia: 'Sabor & Cia', cnpj: '55.666.777/0001-88',
      contatoNome: 'Pedro Mendes', contatoTelefone: '(31) 99999-5555', contatoEmail: 'pedro@saborecia.com.br',
      endereco: 'Rua Espírito Santo, 800 - Centro, BH - MG', etapa: 'negociacao', vendedorId: 2,
      score: 90, ultimaInteracao: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0], diasInativo: 3,
      valorEstimado: 180000, produtosInteresse: ['Okey Lac Cream 25kg', 'Okey Lac Pro 25kg', 'Café Molito 250g'],
      dataEntradaEtapa: new Date(Date.now() - 7 * 86400000).toISOString(), etapaAnterior: 'homologado',
      valorProposta: 165000, dataProposta: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
      dataHomologacao: new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0],
      historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 90 * 86400000).toISOString() }, { etapa: 'amostra', data: new Date(Date.now() - 75 * 86400000).toISOString(), de: 'prospecção' }, { etapa: 'homologado', data: new Date(Date.now() - 45 * 86400000).toISOString(), de: 'amostra' }, { etapa: 'negociacao', data: new Date(Date.now() - 7 * 86400000).toISOString(), de: 'homologado' }]
    },
    {
      id: 6, razaoSocial: 'Cafeteria Expresso BH', nomeFantasia: 'Expresso BH', cnpj: '66.777.888/0001-99',
      contatoNome: 'Fernanda Rocha', contatoTelefone: '(31) 99999-6666', contatoEmail: 'fernanda@expressobh.com.br',
      endereco: 'Av. do Contorno, 2500 - Savassi, BH - MG', etapa: 'pos_venda', vendedorId: 1,
      score: 95, ultimaInteracao: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0], diasInativo: 1,
      valorEstimado: 65000, produtosInteresse: ['Café Belveder 250g', 'Café Molito 250g'],
      dataEntradaEtapa: new Date(Date.now() - 14 * 86400000).toISOString(), etapaAnterior: 'negociacao',
      statusEntrega: 'entregue', dataUltimoPedido: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0],
      valorProposta: 62000, dataProposta: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 120 * 86400000).toISOString() }, { etapa: 'amostra', data: new Date(Date.now() - 100 * 86400000).toISOString(), de: 'prospecção' }, { etapa: 'homologado', data: new Date(Date.now() - 70 * 86400000).toISOString(), de: 'amostra' }, { etapa: 'negociacao', data: new Date(Date.now() - 35 * 86400000).toISOString(), de: 'homologado' }, { etapa: 'pos_venda', data: new Date(Date.now() - 14 * 86400000).toISOString(), de: 'negociacao' }]
    },
    {
      id: 7, razaoSocial: 'Mercado do Produtor', nomeFantasia: 'Merc. Produtor', cnpj: '77.888.999/0001-00',
      contatoNome: 'Roberto Alves', contatoTelefone: '(31) 99999-7777', contatoEmail: 'roberto@mercprod.com.br',
      endereco: 'Rua Carijós, 150 - Centro, BH - MG', etapa: 'perdido', vendedorId: 2,
      score: 30, ultimaInteracao: new Date(Date.now() - 40 * 86400000).toISOString().split('T')[0], diasInativo: 40,
      valorEstimado: 95000, produtosInteresse: ['Maltodextrina 25kg', 'Glucose 25kg'],
      dataEntradaEtapa: new Date(Date.now() - 15 * 86400000).toISOString(), etapaAnterior: 'amostra',
      motivoPerda: 'Preço acima do concorrente', categoriaPerda: 'preco',
      dataPerda: new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0],
      dataEnvioAmostra: new Date(Date.now() - 55 * 86400000).toISOString().split('T')[0], statusAmostra: 'rejeitada',
      historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 65 * 86400000).toISOString() }, { etapa: 'amostra', data: new Date(Date.now() - 55 * 86400000).toISOString(), de: 'prospecção' }, { etapa: 'perdido', data: new Date(Date.now() - 15 * 86400000).toISOString(), de: 'amostra' }]
    },
    {
      id: 8, razaoSocial: 'Atacadão MG', nomeFantasia: 'Atacadão', cnpj: '88.999.000/0001-11',
      contatoNome: 'Lucia Martins', contatoTelefone: '(31) 99999-8888', contatoEmail: 'lucia@atacadaomg.com.br',
      endereco: 'Rod. BR-040, km 12 - Contagem - MG', etapa: 'homologado', vendedorId: 2,
      score: 80, ultimaInteracao: new Date(Date.now() - 65 * 86400000).toISOString().split('T')[0], diasInativo: 65,
      valorEstimado: 310000, produtosInteresse: ['Leite em Pó Integral 25kg', 'Okey Lac Cream 25kg', 'Soro de Leite 25kg', 'Maltodextrina 25kg'],
      dataEntradaEtapa: new Date(Date.now() - 70 * 86400000).toISOString(), etapaAnterior: 'amostra',
      dataHomologacao: new Date(Date.now() - 70 * 86400000).toISOString().split('T')[0],
      dataEnvioAmostra: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0], statusAmostra: 'aprovada',
      historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 100 * 86400000).toISOString() }, { etapa: 'amostra', data: new Date(Date.now() - 90 * 86400000).toISOString(), de: 'prospecção' }, { etapa: 'homologado', data: new Date(Date.now() - 70 * 86400000).toISOString(), de: 'amostra' }]
    },
    {
      id: 9, razaoSocial: 'Sorveteria Gelato', nomeFantasia: 'Gelato BH', cnpj: '99.000.111/0001-22',
      contatoNome: 'Marcos Souza', contatoTelefone: '(31) 99999-9999', contatoEmail: 'marcos@gelatobh.com.br',
      endereco: 'Av. Raja Gabaglia, 1200 - Luxemburgo, BH - MG', etapa: 'prospecção', vendedorId: 1,
      score: 45, ultimaInteracao: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0], diasInativo: 3,
      valorEstimado: 55000, produtosInteresse: ['Okey Lac Açaí 25kg', 'Okey Lac Gourmet 25kg'],
      dataEntradaEtapa: new Date(Date.now() - 3 * 86400000).toISOString(), historicoEtapas: [{ etapa: 'prospecção', data: new Date(Date.now() - 3 * 86400000).toISOString() }]
    }
  ])
  const [interacoes, setInteracoes] = useState<Interacao[]>([
    {
      id: 1,
      clienteId: 1,
      tipo: 'email',
      data: '2024-01-15T10:30:00',
      assunto: 'Proposta inicial',
      descricao: 'Envio de catálogo de produtos MF Paris',
      automatico: false
    }
  ])
  const [aiCommands, setAICommands] = useState<AICommand[]>([])
  const [aiCommand, setAICommand] = useState('')
  const [aiResponse, setAIResponse] = useState('')
  const [isAILoading, setIsAILoading] = useState(false)
  const [templatesMsgs, setTemplatesMsgs] = useState<TemplateMsg[]>([
    {
      id: 1,
      canal: 'whatsapp',
      nome: 'Primeiro contato (WhatsApp)',
      conteudo: 'Olá {nome}, tudo bem? Aqui é da MF Paris. Posso te enviar nosso catálogo e condições para sua região?'
    },
    {
      id: 2,
      canal: 'email',
      nome: 'Catálogo (Email)',
      conteudo: 'Olá {nome},\n\nSegue nosso catálogo MF Paris e condições comerciais.\n\nSe preferir, agendamos uma ligação rápida.\n\nAbraços,'
    },
    {
      id: 3,
      canal: 'linkedin',
      nome: 'Conexão (LinkedIn)',
      conteudo: 'Olá {nome}, vi a empresa {empresa} e queria compartilhar nosso portfólio MF Paris. Podemos conversar?'
    },
    {
      id: 4,
      canal: 'instagram',
      nome: 'Apresentação (Instagram)',
      conteudo: 'Olá {nome}! Posso te enviar novidades e promoções MF Paris para {empresa}?'
    }
  ])

  const [cadencias, setCadencias] = useState<Cadencia[]>([
    {
      id: 1,
      nome: 'Prospecção 7 dias (WhatsApp + Email + LinkedIn)',
      pausarAoResponder: true,
      steps: [
        { id: 1, canal: 'whatsapp', delayDias: 0, templateId: 1 },
        { id: 2, canal: 'email', delayDias: 2, templateId: 2 },
        { id: 3, canal: 'linkedin', delayDias: 5, templateId: 3 }
      ]
    }
  ])

  const [campanhas, setCampanhas] = useState<Campanha[]>([
    {
      id: 1,
      nome: 'Reativação (30+ dias inativo)',
      cadenciaId: 1,
      diasInativoMin: 30,
      status: 'rascunho'
    }
  ])

  const [jobs, setJobs] = useState<JobAutomacao[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([
    {
      id: 1,
      titulo: 'Follow-up SuperBH',
      descricao: 'Ligar para João Silva sobre catálogo',
      data: new Date().toISOString().split('T')[0],
      hora: '10:00',
      tipo: 'ligacao',
      status: 'pendente',
      prioridade: 'alta',
      clienteId: 1
    },
    {
      id: 2,
      titulo: 'Enviar proposta MegaMart',
      descricao: 'Preparar proposta comercial',
      data: new Date().toISOString().split('T')[0],
      hora: '14:00',
      tipo: 'email',
      status: 'pendente',
      prioridade: 'media',
      clienteId: 2
    }
  ])
  const [vendedores, setVendedores] = useState<Vendedor[]>([
    { id: 1, nome: 'Carlos Silva', email: 'carlos@mfparis.com.br', telefone: '(31) 99999-0001', cargo: 'vendedor', avatar: 'CS', usuario: 'carlos', senha: 'carlos123', metaVendas: 200000, metaLeads: 10, metaConversao: 20, ativo: true },
    { id: 2, nome: 'Ana Oliveira', email: 'ana@mfparis.com.br', telefone: '(31) 99999-0002', cargo: 'vendedor', avatar: 'AO', usuario: 'ana', senha: 'ana123', metaVendas: 180000, metaLeads: 8, metaConversao: 18, ativo: true },
    { id: 3, nome: 'Roberto Lima', email: 'roberto@mfparis.com.br', telefone: '(31) 99999-0003', cargo: 'sdr', avatar: 'RL', usuario: 'roberto', senha: 'roberto123', metaVendas: 120000, metaLeads: 15, metaConversao: 10, ativo: true },
    { id: 4, nome: 'Fernanda Costa', email: 'fernanda@mfparis.com.br', telefone: '(31) 99999-0004', cargo: 'gerente', avatar: 'FC', usuario: 'admin', senha: 'admin123', metaVendas: 500000, metaLeads: 20, metaConversao: 15, ativo: true }
  ])

  const [showMotivoPerda, setShowMotivoPerda] = useState(false)
  const [motivoPerdaTexto, setMotivoPerdaTexto] = useState('')
  const [categoriaPerdaSel, setCategoriaPerdaSel] = useState<Cliente['categoriaPerda']>('outro')
  const [pendingDrop, setPendingDrop] = useState<{ e: React.DragEvent, toStage: string } | null>(null)
  const [showModalAmostra, setShowModalAmostra] = useState(false)
  const [modalAmostraData, setModalAmostraData] = useState(new Date().toISOString().split('T')[0])
  const [showModalProposta, setShowModalProposta] = useState(false)
  const [modalPropostaValor, setModalPropostaValor] = useState('')
  const [selectedClientePanel, setSelectedClientePanel] = useState<Cliente | null>(null)
  const [panelAtividadeTipo, setPanelAtividadeTipo] = useState<Interacao['tipo'] | ''>('')
  const [panelAtividadeDesc, setPanelAtividadeDesc] = useState('')
  const [panelNota, setPanelNota] = useState('')
  const [panelNovaTarefa, setPanelNovaTarefa] = useState(false)
  const [panelTarefaTitulo, setPanelTarefaTitulo] = useState('')
  const [panelTarefaData, setPanelTarefaData] = useState(new Date().toISOString().split('T')[0])
  const [panelTarefaTipo, setPanelTarefaTipo] = useState<Tarefa['tipo']>('follow-up')
  const [panelTarefaPrioridade, setPanelTarefaPrioridade] = useState<Tarefa['prioridade']>('media')
  const [panelTab, setPanelTab] = useState<'info' | 'atividades' | 'tarefas'>('info')
  const [transicaoInvalida, setTransicaoInvalida] = useState('')

  // Generate notifications from data
  useEffect(() => {
    const novas: Notificacao[] = []
    let nId = 1
    clientes.forEach(c => {
      if ((c.diasInativo || 0) > 10) {
        novas.push({ id: nId++, tipo: 'warning', titulo: 'Cliente inativo', mensagem: `${c.razaoSocial} está inativo há ${c.diasInativo} dias`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
      }
    })
    tarefas.forEach(t => {
      if (t.status === 'pendente') {
        novas.push({ id: nId++, tipo: 'info', titulo: 'Tarefa pendente', mensagem: `${t.titulo} — ${t.descricao}`, timestamp: new Date().toISOString(), lida: false, clienteId: t.clienteId })
      }
    })
    vendedores.forEach(v => {
      const clientesV = clientes.filter(c => c.vendedorId === v.id)
      const valorPipeline = clientesV.reduce((s, c) => s + (c.valorEstimado || 0), 0)
      if (valorPipeline < v.metaVendas * 0.5 && v.ativo) {
        novas.push({ id: nId++, tipo: 'error', titulo: 'Meta em risco', mensagem: `${v.nome} está abaixo de 50% da meta de vendas`, timestamp: new Date().toISOString(), lida: false })
      }
    })
    // Item 5: Alertas de prazo nas notificações
    clientes.forEach(c => {
      if (c.etapa === 'amostra' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 30) {
          novas.push({ id: nId++, tipo: 'error', titulo: '🔴 Prazo vencido (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 25) {
          novas.push({ id: nId++, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Amostra)', mensagem: `${c.razaoSocial} está há ${dias} dias na Amostra (prazo: 30d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
      if (c.etapa === 'homologado' && c.dataEntradaEtapa) {
        const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
        if (dias >= 75) {
          novas.push({ id: nId++, tipo: 'error', titulo: '🔴 Prazo vencido (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        } else if (dias >= 60) {
          novas.push({ id: nId++, tipo: 'warning', titulo: '⚠️ Prazo vencendo (Homologado)', mensagem: `${c.razaoSocial} está há ${dias} dias em Homologado (prazo: 75d)`, timestamp: new Date().toISOString(), lida: false, clienteId: c.id })
        }
      }
    })
    setNotificacoes(novas)
  }, [clientes, tarefas, vendedores])

  // Item 2: Movimentação automática pelo sistema (prazos vencidos)
  const autoMoveRef = useRef(false)
  useEffect(() => {
    if (autoMoveRef.current) return
    const now = Date.now()
    const clientesParaMover: { id: number; dias: number; etapa: string }[] = []
    clientes.forEach(c => {
      if (!c.dataEntradaEtapa) return
      const dias = Math.floor((now - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
      if (c.etapa === 'amostra' && dias > 30) clientesParaMover.push({ id: c.id, dias, etapa: 'amostra' })
      if (c.etapa === 'homologado' && dias > 75) clientesParaMover.push({ id: c.id, dias, etapa: 'homologado' })
    })
    if (clientesParaMover.length > 0) {
      autoMoveRef.current = true
      const nowStr = new Date().toISOString()
      setClientes(prev => prev.map(c => {
        const match = clientesParaMover.find(m => m.id === c.id)
        if (!match) return c
        const hist: HistoricoEtapa = { etapa: 'perdido', data: nowStr, de: c.etapa }
        return {
          ...c, etapa: 'perdido', etapaAnterior: c.etapa, dataEntradaEtapa: nowStr,
          historicoEtapas: [...(c.historicoEtapas || []), hist],
          categoriaPerda: 'sem_resposta' as const, dataPerda: nowStr.split('T')[0],
          motivoPerda: `Prazo de ${match.etapa === 'amostra' ? '30' : '75'} dias vencido (automático)`
        }
      }))
      clientesParaMover.forEach(m => {
        const cl = clientes.find(c => c.id === m.id)
        addNotificacao('error', 'Movido automaticamente', `${cl?.razaoSocial} → Perdido (prazo ${m.dias}d vencido)`, m.id)
        setAtividades(prev => [{ id: Date.now() + m.id, tipo: 'moveu', descricao: `${cl?.razaoSocial} movido para Perdido automaticamente (prazo ${m.etapa === 'amostra' ? '30d' : '75d'} vencido)`, vendedorNome: 'Sistema', timestamp: nowStr }, ...prev])
      })
      setTimeout(() => { autoMoveRef.current = false }, 500)
    }
  }, [clientes])

  // Item 4: Score dinâmico — recalcula automaticamente
  useEffect(() => {
    const baseEtapa: Record<string, number> = { 'prospecção': 10, 'amostra': 25, 'homologado': 50, 'negociacao': 70, 'pos_venda': 90, 'perdido': 5 }
    let changed = false
    const updated = clientes.map(c => {
      const base = baseEtapa[c.etapa] || 10
      const bonusValor = Math.min((c.valorEstimado || 0) / 10000, 15)
      const qtdInteracoes = interacoes.filter(i => i.clienteId === c.id).length
      const bonusInteracoes = Math.min(qtdInteracoes * 3, 15)
      const penalidade = Math.min((c.diasInativo || 0) * 0.5, 20)
      const newScore = Math.max(0, Math.min(100, Math.round(base + bonusValor + bonusInteracoes - penalidade)))
      if (c.score !== newScore) { changed = true; return { ...c, score: newScore } }
      return c
    })
    if (changed) setClientes(updated)
  }, [interacoes])

  const [formData, setFormData] = useState<FormData>({
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    contatoNome: '',
    contatoTelefone: '',
    contatoEmail: '',
    endereco: '',
    valorEstimado: '',
    produtosInteresse: '',
    vendedorId: ''
  })

  // Dashboard Metrics Calculation
  const calculateDashboardMetrics = (): DashboardMetrics => {
    const totalLeads = clientes.length
    const leadsAtivos = clientes.filter(c => (c.diasInativo || 0) <= 15).length
    const leadsNovosHoje = clientes.filter(c => {
      const hoje = new Date().toDateString()
      return c.ultimaInteracao === hoje
    }).length
    const interacoesHoje = interacoes.filter(c => {
      const hoje = new Date().toISOString().split('T')[0]
      return c.data.startsWith(hoje)
    }).length
    const valorTotal = clientes.reduce((sum, c) => sum + (c.valorEstimado || 0), 0)
    const ticketMedio = totalLeads > 0 ? valorTotal / totalLeads : 0
    const taxaConversao = totalLeads > 0 ? (clientes.filter(c => c.etapa === 'pos_venda').length / totalLeads) * 100 : 0

    return {
      totalLeads,
      leadsAtivos,
      taxaConversao,
      valorTotal,
      ticketMedio,
      leadsNovosHoje,
      interacoesHoje
    }
  }

  // Lead Scoring Algorithm
  const calculateLeadScore = (cliente: Cliente): number => {
    let score = 0
    
    // Score base por etapa (40%)
    const etapaScores = {
      'prospecção': 20,
      'amostra': 40,
      'homologado': 60,
      'negociacao': 80,
      'pos_venda': 100
    }
    score += etapaScores[cliente.etapa as keyof typeof etapaScores] || 0
    
    // Score por valor estimado (30%)
    if (cliente.valorEstimado) {
      if (cliente.valorEstimado > 100000) score += 30
      else if (cliente.valorEstimado > 50000) score += 20
      else if (cliente.valorEstimado > 20000) score += 10
    }
    
    // Score por engajamento (20%)
    if (cliente.diasInativo !== undefined) {
      if (cliente.diasInativo <= 7) score += 20
      else if (cliente.diasInativo <= 15) score += 15
      else if (cliente.diasInativo <= 30) score += 10
      else if (cliente.diasInativo > 30) score -= 10
    }
    
    // Score por produtos de interesse (10%)
    if (cliente.produtosInteresse && cliente.produtosInteresse.length > 0) {
      score += Math.min(cliente.produtosInteresse.length * 2, 10)
    }
    
    return Math.max(0, Math.min(100, score))
  }

  // Notification System
  const addNotificacao = (tipo: Notificacao['tipo'], titulo: string, mensagem: string, clienteId?: number) => {
    const novaNotificacao: Notificacao = {
      id: Date.now(),
      tipo,
      titulo,
      mensagem,
      timestamp: new Date().toLocaleString('pt-BR'),
      lida: false,
      clienteId
    }
    setNotificacoes(prev => [novaNotificacao, ...prev.slice(0, 9)])
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setNotificacoes(prev => prev.map(n => 
        n.id === novaNotificacao.id ? { ...n, lida: true } : n
      ))
    }, 5000)
  }

  // AI Command Processing
  const processAICommand = async (command: string) => {
    setIsAILoading(true)
    
    // Simulate AI processing
    setTimeout(() => {
      let response = ''
      
      if (command.toLowerCase().includes('leads inativos')) {
        const inativos = clientes.filter(c => (c.diasInativo || 0) > 30)
        response = `Encontrei ${inativos.length} leads inativos há mais de 30 dias:\n\n${inativos.map(c => 
          `• ${c.razaoSocial} - ${c.diasInativo} dias sem contato (${c.contatoEmail})`
        ).join('\n')}\n\nDeseja que eu envie um follow-up automático para todos?`
      } else if (command.toLowerCase().includes('follow-up')) {
        response = 'Follow-ups agendados com sucesso! 3 emails serão enviados hoje e 2 amanhã. Usarei templates personalizados para cada cliente.'
      } else if (command.toLowerCase().includes('priorizar')) {
        response = 'Clientes priorizados por score:\n\n1. MegaMart (Score: 85) - Negociação avançada\n2. SuperBH (Score: 75) - Aguardando amostra\n\nFoco de hoje: MegaMart'
      } else if (command.toLowerCase().includes('relatório')) {
        const total = clientes.length
        const ativos = clientes.filter(c => (c.diasInativo || 0) <= 15).length
        const conversao = clientes.filter(c => c.etapa === 'pos_venda').length
        response = `📊 Relatório Semanal:\n\n• Total leads: ${total}\n• Leads ativos: ${ativos}\n• Taxa ativação: ${((ativos/total) * 100).toFixed(1)}%\n• Conversões: ${conversao}\n• Ticket médio: R$ ${(clientes.reduce((sum, c) => sum + (c.valorEstimado || 0), 0) / clientes.length).toFixed(2)}`
      } else {
        response = 'Entendido! Posso ajudar com:\n\n• 📋 Listar leads inativos\n• 📤 Enviar follow-ups\n• 🎯 Priorizar clientes\n• 📊 Gerar relatórios\n• 🔍 Buscar clientes\n\nO que você precisa?'
      }
      
      const newCommand: AICommand = {
        id: Date.now().toString(),
        command,
        response,
        timestamp: new Date().toLocaleString('pt-BR')
      }
      
      setAICommands(prev => [newCommand, ...prev.slice(0, 9)])
      setAIResponse(response)
      setIsAILoading(false)
    }, 1500)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const produtosArray = formData.produtosInteresse 
      ? formData.produtosInteresse.split(',').map(p => p.trim()).filter(p => p)
      : []
    const { vendedorId: vIdStr, valorEstimado: vEstStr, produtosInteresse: _pi, ...restForm } = formData
    
    if (editingCliente) {
      // Edit existing cliente
      const updatedCliente: Cliente = {
        ...editingCliente,
        ...restForm,
        valorEstimado: vEstStr ? parseFloat(vEstStr) : undefined,
        vendedorId: vIdStr ? Number(vIdStr) : undefined,
        produtosInteresse: produtosArray
      }
      updatedCliente.score = calculateLeadScore(updatedCliente)
      
      setClientes(prev => prev.map(c => 
        c.id === editingCliente.id 
          ? updatedCliente
          : c
      ))
      
      // Add interaction
      const newInteracao: Interacao = {
        id: interacoes.length + 1,
        clienteId: editingCliente.id,
        tipo: 'email',
        data: new Date().toISOString(),
        assunto: 'Dados atualizados',
        descricao: `Cliente atualizado: ${formData.razaoSocial}`,
        automatico: false
      }
      setInteracoes(prev => [newInteracao, ...prev])
      
      setEditingCliente(null)
    } else {
      // Add new cliente
      const newCliente: Cliente = {
        id: clientes.length + 1,
        ...restForm,
        etapa: 'prospecção',
        valorEstimado: vEstStr ? parseFloat(vEstStr) : undefined,
        vendedorId: vIdStr ? Number(vIdStr) : undefined,
        produtosInteresse: produtosArray,
        ultimaInteracao: new Date().toISOString().split('T')[0],
        diasInativo: 0
      }
      newCliente.score = calculateLeadScore(newCliente)
      
      setClientes(prev => [...prev, newCliente])
      
      // Add initial interaction
      const newInteracao: Interacao = {
        id: interacoes.length + 1,
        clienteId: newCliente.id,
        tipo: 'email',
        data: new Date().toISOString(),
        assunto: 'Bem-vindo!',
        descricao: `Novo cliente cadastrado: ${formData.razaoSocial}`,
        automatico: true
      }
      setInteracoes(prev => [newInteracao, ...prev])
    }
    
    setFormData({
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      contatoNome: '',
      contatoTelefone: '',
      contatoEmail: '',
      endereco: '',
      valorEstimado: '',
      produtosInteresse: '',
      vendedorId: ''
    })
    setShowModal(false)
  }

  const handleEditCliente = (cliente: Cliente) => {
    setEditingCliente(cliente)
    setFormData({
      razaoSocial: cliente.razaoSocial,
      nomeFantasia: cliente.nomeFantasia || '',
      cnpj: cliente.cnpj,
      contatoNome: cliente.contatoNome,
      contatoTelefone: cliente.contatoTelefone,
      contatoEmail: cliente.contatoEmail,
      endereco: cliente.endereco || '',
      valorEstimado: cliente.valorEstimado?.toString() || '',
      produtosInteresse: cliente.produtosInteresse?.join(', ') || '',
      vendedorId: cliente.vendedorId?.toString() || ''
    })
    setShowModal(true)
  }

  const handleQuickAction = (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => {
    const assunto = tipo === 'propaganda' ? `Propaganda - ${canal.toUpperCase()}` : `Contato - ${canal.toUpperCase()}`
    const descricao = tipo === 'propaganda'
      ? `Envio de propaganda automatizada para ${cliente.razaoSocial}`
      : `Ação de contato iniciada com ${cliente.razaoSocial}`

    const newInteracao: Interacao = {
      id: interacoes.length + 1,
      clienteId: cliente.id,
      tipo: canal,
      data: new Date().toISOString(),
      assunto,
      descricao,
      automatico: true
    }
    setInteracoes(prev => [newInteracao, ...prev])
    addNotificacao('success', 'Automação executada', `${assunto}: ${cliente.razaoSocial}`, cliente.id)
  }

  const scheduleJob = (job: Omit<JobAutomacao, 'id' | 'status'>) => {
    const newJob: JobAutomacao = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      ...job,
      status: 'pendente'
    }
    setJobs(prev => [newJob, ...prev])
    const cliente = clientes.find(c => c.id === job.clienteId)
    if (cliente) {
      addNotificacao('info', 'Job agendado', `Agendado ${job.canal.toUpperCase()} para ${cliente.razaoSocial}`, cliente.id)
    }
  }

  const runJobNow = (jobId: number) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'enviado' } : j))
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    const cliente = clientes.find(c => c.id === job.clienteId)
    if (!cliente) return
    handleQuickAction(cliente, job.canal, job.tipo)
  }

  const startCampanha = (campanhaId: number) => {
    const campanha = campanhas.find(c => c.id === campanhaId)
    if (!campanha) return
    const cadencia = cadencias.find(c => c.id === campanha.cadenciaId)
    if (!cadencia) return

    const audience = clientes.filter(c => {
      if (campanha.etapa && c.etapa !== campanha.etapa) return false
      if (campanha.minScore !== undefined && (c.score || 0) < campanha.minScore) return false
      if (campanha.diasInativoMin !== undefined && (c.diasInativo || 0) < campanha.diasInativoMin) return false
      return true
    })

    const now = new Date()
    cadencia.steps.forEach(step => {
      audience.forEach(cliente => {
        const dt = new Date(now)
        dt.setDate(dt.getDate() + step.delayDias)
        scheduleJob({
          clienteId: cliente.id,
          canal: step.canal,
          tipo: 'propaganda',
          agendadoPara: dt.toISOString(),
          templateId: step.templateId,
          campanhaId: campanha.id
        })
      })
    })

    setCampanhas(prev => prev.map(c => c.id === campanhaId ? { ...c, status: 'ativa' } : c))
    addNotificacao('success', 'Campanha ativada', `${campanha.nome} iniciada para ${audience.length} leads`)
  }

  const handleDragStart = (e: React.DragEvent, cliente: Cliente, fromStage: string) => {
    setDraggedItem({ cliente, fromStage })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const transicoesPermitidas: Record<string, string[]> = {
    'prospecção': ['amostra', 'perdido'],
    'amostra': ['homologado', 'perdido'],
    'homologado': ['negociacao', 'perdido'],
    'negociacao': ['pos_venda', 'homologado', 'perdido'],
    'pos_venda': ['negociacao'],
    'perdido': ['prospecção']
  }
  const stageLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }

  const moverCliente = (clienteId: number, toStage: string, extras: Partial<Cliente> = {}) => {
    const now = new Date().toISOString()
    setClientes(prev => prev.map(c => {
      if (c.id !== clienteId) return c
      const hist: HistoricoEtapa = { etapa: toStage, data: now, de: c.etapa }
      return { ...c, etapa: toStage, etapaAnterior: c.etapa, dataEntradaEtapa: now, historicoEtapas: [...(c.historicoEtapas || []), hist], ...extras }
    }))
    const cliente = clientes.find(c => c.id === clienteId)
    setAtividades(prev => [{ id: Date.now(), tipo: 'moveu', descricao: `${cliente?.razaoSocial} movido para ${stageLabels[toStage] || toStage}`, vendedorNome: loggedUser?.nome || 'Sistema', timestamp: now }, ...prev])

    // Item 3: Tarefas automáticas ao mover etapa
    const nome = cliente?.razaoSocial || 'Cliente'
    const dataDaqui = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().split('T')[0]
    const novasTarefas: Tarefa[] = []
    if (toStage === 'amostra') {
      novasTarefas.push({ id: Date.now() + 1, titulo: `Follow-up amostra — ${nome}`, descricao: 'Verificar se o cliente recebeu e analisou a amostra', data: dataDaqui(15), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId })
      novasTarefas.push({ id: Date.now() + 2, titulo: `Cobrar resposta amostra — ${nome}`, descricao: 'Prazo de 30 dias se aproximando. Cobrar retorno urgente.', data: dataDaqui(25), hora: '09:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta', clienteId })
    }
    if (toStage === 'homologado') {
      novasTarefas.push({ id: Date.now() + 3, titulo: `Agendar reunião 1º pedido — ${nome}`, descricao: 'Cliente homologado. Agendar reunião para fechar primeiro pedido.', data: dataDaqui(30), hora: '14:00', tipo: 'reuniao', status: 'pendente', prioridade: 'alta', clienteId })
      novasTarefas.push({ id: Date.now() + 4, titulo: `Verificar prazo 75d — ${nome}`, descricao: 'Verificar se o cliente vai fazer pedido antes do prazo de 75 dias.', data: dataDaqui(60), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId })
    }
    if (toStage === 'negociacao') {
      novasTarefas.push({ id: Date.now() + 5, titulo: `Cobrar resposta proposta — ${nome}`, descricao: 'Verificar retorno da proposta comercial enviada.', data: dataDaqui(7), hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta', clienteId })
    }
    if (toStage === 'pos_venda') {
      novasTarefas.push({ id: Date.now() + 6, titulo: `Confirmar entrega — ${nome}`, descricao: 'Confirmar que o pedido foi entregue corretamente.', data: dataDaqui(10), hora: '11:00', tipo: 'ligacao', status: 'pendente', prioridade: 'media', clienteId })
      novasTarefas.push({ id: Date.now() + 7, titulo: `Pós-venda: satisfação — ${nome}`, descricao: 'Pesquisa de satisfação e abrir porta para próximo pedido.', data: dataDaqui(20), hora: '14:00', tipo: 'email', status: 'pendente', prioridade: 'media', clienteId })
    }
    if (novasTarefas.length > 0) {
      setTarefas(prev => [...novasTarefas, ...prev])
    }
  }

  const handleDrop = (e: React.DragEvent, toStage: string) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.fromStage === toStage) { setDraggedItem(null); return }

    const permitidas = transicoesPermitidas[draggedItem.fromStage] || []
    if (!permitidas.includes(toStage)) {
      setTransicaoInvalida(`Não é possível mover de "${stageLabels[draggedItem.fromStage]}" para "${stageLabels[toStage]}". Transições permitidas: ${permitidas.map(s => stageLabels[s]).join(', ')}`)
      setTimeout(() => setTransicaoInvalida(''), 4000)
      setDraggedItem(null)
      return
    }

    if (toStage === 'perdido') {
      setPendingDrop({ e, toStage })
      setShowMotivoPerda(true)
      return
    }
    if (toStage === 'amostra') {
      setPendingDrop({ e, toStage })
      setModalAmostraData(new Date().toISOString().split('T')[0])
      setShowModalAmostra(true)
      return
    }
    if (toStage === 'negociacao') {
      setPendingDrop({ e, toStage })
      setModalPropostaValor(draggedItem.cliente.valorEstimado?.toString() || '')
      setShowModalProposta(true)
      return
    }

    const extras: Partial<Cliente> = {}
    if (toStage === 'homologado') { extras.dataHomologacao = new Date().toISOString().split('T')[0]; extras.statusAmostra = 'aprovada' }
    if (toStage === 'pos_venda') { extras.statusEntrega = 'preparando'; extras.dataUltimoPedido = new Date().toISOString().split('T')[0] }
    if (toStage === 'prospecção') { extras.motivoPerda = undefined; extras.categoriaPerda = undefined; extras.dataPerda = undefined }

    moverCliente(draggedItem.cliente.id, toStage, extras)
    setDraggedItem(null)
  }

  const confirmPerda = () => {
    if (draggedItem) {
      moverCliente(draggedItem.cliente.id, 'perdido', {
        motivoPerda: motivoPerdaTexto.trim() || `Perdido por: ${categoriaPerdaSel}`,
        categoriaPerda: categoriaPerdaSel || 'outro',
        dataPerda: new Date().toISOString().split('T')[0]
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowMotivoPerda(false); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro')
  }

  const confirmAmostra = () => {
    if (draggedItem) {
      moverCliente(draggedItem.cliente.id, 'amostra', {
        dataEnvioAmostra: modalAmostraData,
        statusAmostra: 'enviada'
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowModalAmostra(false)
  }

  const confirmProposta = () => {
    if (draggedItem) {
      moverCliente(draggedItem.cliente.id, 'negociacao', {
        valorProposta: Number(modalPropostaValor) || draggedItem.cliente.valorEstimado || 0,
        dataProposta: new Date().toISOString().split('T')[0]
      })
    }
    setDraggedItem(null); setPendingDrop(null); setShowModalProposta(false); setModalPropostaValor('')
  }

  const openModal = () => {
    setEditingCliente(null)
    setFormData({
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      contatoNome: '',
      contatoTelefone: '',
      contatoEmail: '',
      endereco: '',
      valorEstimado: '',
      produtosInteresse: '',
      vendedorId: ''
    })
    setShowModal(true)
  }

  const viewsPermitidas: Record<Vendedor['cargo'], ViewType[]> = {
    gerente: ['dashboard', 'funil', 'clientes', 'automacoes', 'mapa', 'prospeccao', 'tarefas', 'social', 'integracoes', 'equipe', 'relatorios', 'templates', 'produtos', 'pedidos'],
    vendedor: ['funil', 'clientes', 'mapa', 'tarefas', 'produtos', 'templates', 'pedidos'],
    sdr: ['funil', 'clientes', 'mapa', 'prospeccao', 'tarefas', 'templates', 'pedidos'],
  }

  const renderContent = () => {
    const dashboardMetrics = calculateDashboardMetrics()
    switch (activeView) {
      case 'dashboard':
        return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} loggedUser={loggedUser} />
      case 'funil':
        return <FunilView 
          clientes={clientes} 
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClickCliente={(c) => setSelectedClientePanel(c)}
          isGerente={loggedUser?.cargo === 'gerente'}
        />
      case 'clientes':
        return <ClientesView 
          clientes={clientes} 
          vendedores={vendedores}
          onNewCliente={openModal}
          onEditCliente={handleEditCliente}
        />
      case 'automacoes':
        return <AutomacoesView clientes={clientes} onAction={handleQuickAction} />
      case 'mapa':
        return <MapaView clientes={clientes} />
      case 'prospeccao':
        return (
          <ProspeccaoView
            clientes={clientes}
            interacoes={interacoes}
            templates={templatesMsgs}
            cadencias={cadencias}
            campanhas={campanhas}
            jobs={jobs}
            onQuickAction={handleQuickAction}
            onStartCampanha={startCampanha}
            onRunJobNow={runJobNow}
            onCreateTemplate={(t: TemplateMsg) => setTemplatesMsgs(prev => [t, ...prev])}
            onCreateCampanha={(c: Campanha) => setCampanhas(prev => [c, ...prev])}
          />
        )
      case 'tarefas':
        return <TarefasView tarefas={tarefas} clientes={clientes} onUpdateTarefa={(t) => setTarefas(prev => prev.map(x => x.id === t.id ? t : x))} onAddTarefa={(t) => setTarefas(prev => [t, ...prev])} />
      case 'social':
        return <SocialSearchView />
      case 'integracoes':
        return <IntegracoesView />
      case 'equipe':
        return <VendedoresView vendedores={vendedores} clientes={clientes} onAddVendedor={(v) => setVendedores(prev => [...prev, v])} onUpdateVendedor={(v) => setVendedores(prev => prev.map(x => x.id === v.id ? v : x))} />
      case 'relatorios':
        return <RelatoriosView clientes={clientes} vendedores={vendedores} interacoes={interacoes} produtos={produtos} />
      case 'templates':
        return <TemplatesView templates={templates} onAdd={(t) => setTemplates(prev => [...prev, t])} onDelete={(id) => setTemplates(prev => prev.filter(t => t.id !== id))} />
      case 'produtos':
        return <ProdutosView produtos={produtos} onAdd={(p) => setProdutos(prev => [...prev, p])} onUpdate={(p) => setProdutos(prev => prev.map(x => x.id === p.id ? p : x))} onDelete={(id) => setProdutos(prev => prev.filter(p => p.id !== id))} isGerente={loggedUser?.cargo === 'gerente'} />
      case 'pedidos':
        return <PedidosView pedidos={pedidos} clientes={clientes} produtos={produtos} vendedores={vendedores} loggedUser={loggedUser!} onAddPedido={(p) => setPedidos(prev => [...prev, p])} onUpdatePedido={(p) => setPedidos(prev => prev.map(x => x.id === p.id ? p : x))} />
      default:
        return <DashboardView clientes={clientes} metrics={dashboardMetrics} vendedores={vendedores} atividades={atividades} interacoes={interacoes} produtos={produtos} tarefas={tarefas} loggedUser={loggedUser} />
    }
  }

  const handleLogin = () => {
    setLoginError('')
    const user = vendedores.find(v => v.usuario === loginUsuario.trim() && v.senha === loginSenha && v.ativo)
    if (user) {
      setLoggedUser(user)
      setActiveView(viewsPermitidas[user.cargo][0])
      setLoginUsuario('')
      setLoginSenha('')
    } else {
      setLoginError('Usuário ou senha inválidos')
    }
  }

  if (!loggedUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-4">
              <span className="text-3xl font-bold text-primary-700">MF</span>
            </div>
            <h1 className="text-3xl font-bold text-white">MF Paris</h1>
            <p className="text-primary-200 mt-2">CRM de Vendas</p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">Entrar no sistema</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
                <input
                  type="text"
                  value={loginUsuario}
                  onChange={(e) => setLoginUsuario(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Digite seu usuário"
                  className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  value={loginSenha}
                  onChange={(e) => setLoginSenha(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Digite sua senha"
                  className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900"
                />
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-200 rounded-apple p-3 text-sm text-red-700 text-center">
                  {loginError}
                </div>
              )}

              <button
                onClick={handleLogin}
                className="w-full py-3 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm font-semibold text-base"
              >
                Entrar
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center mb-2">Acesso de demonstração:</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-apple">
                  <span className="text-sm">👑</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-800">Gerente — acesso total</p>
                    <p className="text-xs text-amber-600">admin / admin123</p>
                  </div>
                  <button onClick={() => { setLoginUsuario('admin'); setLoginSenha('admin123') }} className="text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-apple px-2 py-1 transition-colors font-medium">
                    Usar
                  </button>
                </div>
                <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-apple">
                  <span className="text-sm">👤</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-800">Vendedor — acesso restrito</p>
                    <p className="text-xs text-blue-600">carlos / carlos123</p>
                  </div>
                  <button onClick={() => { setLoginUsuario('carlos'); setLoginSenha('carlos123') }} className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-apple px-2 py-1 transition-colors font-medium">
                    Usar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-primary-200 text-xs mt-6">© 2026 MF Paris — CRM de Vendas</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r flex flex-col`}>
        {/* Logo */}
        <div className={`h-16 flex items-center justify-between px-6 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h1 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>MF Paris</h1>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-gray-600 rounded-apple">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {([
            { id: 'dashboard', icon: HomeIcon, label: 'Visão Geral' },
            { id: 'funil', icon: FunnelIcon, label: 'Funil' },
            { id: 'clientes', icon: UserGroupIcon, label: 'Clientes' },
            { id: 'pedidos', icon: ShoppingCartIcon, label: 'Pedidos' },
            { id: 'tarefas', icon: ChartBarIcon, label: 'Tarefas' },
            { id: 'mapa', icon: MapIcon, label: 'Mapa' },
            { id: 'produtos', icon: CubeIcon, label: 'Produtos' },
            { id: 'templates', icon: DocumentTextIcon, label: 'Templates' },
            { id: 'automacoes', icon: PaperAirplaneIcon, label: 'Automações' },
            { id: 'prospeccao', icon: MagnifyingGlassIcon, label: 'Prospecção' },
            { id: 'social', icon: MagnifyingGlassIcon, label: 'Busca Social' },
            { id: 'integracoes', icon: SparklesIcon, label: 'Integrações' },
            { id: 'equipe', icon: UserGroupIcon, label: 'Equipe' },
            { id: 'relatorios', icon: ChartBarIcon, label: 'Relatórios' },
          ] as { id: ViewType; icon: React.ElementType; label: string }[])
            .filter(item => viewsPermitidas[loggedUser.cargo].includes(item.id))
            .map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveView(item.id); setSidebarOpen(false) }}
                className={`
                  w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-apple transition-all duration-200
                  ${activeView === item.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.label}
              </button>
            ))}

          {/* Separador e Assistente IA — só para gerente */}
          {loggedUser.cargo === 'gerente' && (
          <div className="border-t border-gray-200 pt-4 mt-2">
            <button
              onClick={() => { setShowAIModal(true); setSidebarOpen(false) }}
              className="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-apple bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-apple-sm"
            >
              <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
              Assistente IA
            </button>
          </div>
          )}

          {/* Placeholder invisível para manter estrutura quando não é gerente */}
          {loggedUser.cargo !== 'gerente' && (
          <div className="border-t border-gray-200 pt-4 mt-2">
            <p className="text-xs text-gray-400 text-center px-2">Logado como <span className="font-medium text-gray-600">{loggedUser.cargo === 'sdr' ? 'SDR' : 'Vendedor'}</span></p>
          </div>
          )}

        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary-700">{loggedUser.avatar}</span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">{loggedUser.nome}</p>
                <p className="text-xs text-gray-500">{loggedUser.cargo === 'gerente' ? 'Gerente' : loggedUser.cargo === 'sdr' ? 'SDR' : 'Vendedor'}</p>
              </div>
            </div>
            <button
              onClick={() => setLoggedUser(null)}
              className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              title="Sair"
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className={`h-14 sm:h-16 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b flex items-center justify-between px-3 sm:px-6`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-apple transition-colors"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            </button>
            <h2 className={`text-base sm:text-lg font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {activeView === 'dashboard' && 'Visão Geral'}
              {activeView === 'funil' && 'Funil de Vendas'}
              {activeView === 'clientes' && 'Clientes'}
              {activeView === 'automacoes' && 'Automações de Vendas'}
              {activeView === 'mapa' && 'Mapa de Leads'}
              {activeView === 'prospeccao' && 'Prospecção'}
              {activeView === 'tarefas' && 'Tarefas e Agenda'}
              {activeView === 'social' && 'Busca por Redes Sociais'}
              {activeView === 'integracoes' && 'Integrações'}
              {activeView === 'equipe' && 'Equipe de Vendas'}
              {activeView === 'relatorios' && 'Relatórios e Gráficos'}
              {activeView === 'templates' && 'Templates de Mensagens'}
              {activeView === 'produtos' && 'Catálogo de Produtos'}
              {activeView === 'pedidos' && 'Lançamento de Pedidos'}
            </h2>
          </div>
          
          <div className="flex items-center space-x-1 sm:space-x-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-apple hover:bg-gray-100"
              title={darkMode ? 'Modo claro' : 'Modo escuro'}
            >
              {darkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-apple hover:bg-gray-100 relative"
              >
                <BellIcon className="h-5 w-5" />
                {notificacoes.filter(n => !n.lida).length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {notificacoes.filter(n => !n.lida).length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white rounded-apple shadow-apple border border-gray-200 z-50 max-h-[70vh] overflow-y-auto">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Notificações</h3>
                    <button onClick={() => setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))} className="text-xs text-primary-600 hover:text-primary-800">Marcar todas como lidas</button>
                  </div>
                  {notificacoes.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Nenhuma notificação</div>
                  ) : (
                    notificacoes.map(n => (
                      <div key={n.id} className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!n.lida ? 'bg-blue-50' : ''}`} onClick={() => setNotificacoes(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x))}>
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.tipo === 'warning' ? 'bg-yellow-500' : n.tipo === 'error' ? 'bg-red-500' : n.tipo === 'success' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{n.titulo}</p>
                            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.mensagem}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-3 sm:p-6">
          {renderContent()}
        </div>
      </div>

      {/* Modal Novo Cliente */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-white rounded-apple shadow-apple border border-gray-200 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Razão Social *
                    </label>
                    <input
                      type="text"
                      name="razaoSocial"
                      value={formData.razaoSocial}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Ex: Supermercado BH Ltda"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome Fantasia
                    </label>
                    <input
                      type="text"
                      name="nomeFantasia"
                      value={formData.nomeFantasia}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Ex: SuperBH"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CNPJ *
                    </label>
                    <input
                      type="text"
                      name="cnpj"
                      value={formData.cnpj}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="00.000.000/0000-00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do Contato *
                    </label>
                    <input
                      type="text"
                      name="contatoNome"
                      value={formData.contatoNome}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="João Silva"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefone *
                    </label>
                    <input
                      type="tel"
                      name="contatoTelefone"
                      value={formData.contatoTelefone}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      E-mail *
                    </label>
                    <input
                      type="email"
                      name="contatoEmail"
                      value={formData.contatoEmail}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="email@empresa.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Endereço
                    </label>
                    <input
                      type="text"
                      name="endereco"
                      value={formData.endereco}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Rua, número, bairro, cidade - UF"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valor Estimado (R$)
                    </label>
                    <input
                      type="number"
                      name="valorEstimado"
                      value={formData.valorEstimado}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Produtos de Interesse
                    </label>
                    <div className="border border-gray-300 rounded-apple p-3 max-h-40 overflow-y-auto space-y-1">
                      {produtos.filter(p => p.ativo).map(p => {
                        const selected = formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean)
                        const isChecked = selected.includes(p.nome)
                        return (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = isChecked
                                  ? selected.filter(s => s !== p.nome)
                                  : [...selected, p.nome]
                                setFormData(prev => ({ ...prev, produtosInteresse: updated.join(', ') }))
                              }}
                              className="w-4 h-4 text-primary-600 rounded"
                            />
                            <span className="text-sm text-gray-700">{p.nome}</span>
                            <span className="text-xs text-gray-400 ml-auto">R$ {p.preco.toFixed(2).replace('.', ',')}/{p.unidade}</span>
                          </label>
                        )
                      })}
                      {produtos.filter(p => p.ativo).length === 0 && <p className="text-xs text-gray-400">Nenhum produto cadastrado</p>}
                    </div>
                    {formData.produtosInteresse && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {formData.produtosInteresse.split(',').map(s => s.trim()).filter(Boolean).map(name => (
                          <span key={name} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded-full border border-primary-200 flex items-center gap-1">
                            {name}
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, produtosInteresse: prev.produtosInteresse.split(',').map(s => s.trim()).filter(s => s && s !== name).join(', ') }))} className="text-primary-400 hover:text-primary-700">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vendedor Responsável
                    </label>
                    <select
                      name="vendedorId"
                      value={formData.vendedorId || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="">Sem vendedor</option>
                      {vendedores.filter(v => v.ativo).map(v => (
                        <option key={v.id} value={v.id}>{v.nome} ({v.cargo === 'gerente' ? 'Gerente' : v.cargo === 'sdr' ? 'SDR' : 'Vendedor'})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 transition-colors duration-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm"
                  >
                    Salvar Cliente
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showAIModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm"
              onClick={() => setShowAIModal(false)}
            />

            <div className="relative w-full max-w-2xl bg-white rounded-apple shadow-apple border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Assistente Virtual IA</h2>
                <button
                  onClick={() => setShowAIModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="px-6 py-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Comando (em português natural)
                    </label>
                    <textarea
                      value={aiCommand}
                      onChange={(e) => setAICommand(e.target.value)}
                      placeholder="Ex: Lista leads inativos dos últimos 30 dias"
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                    <button
                      onClick={() => processAICommand(aiCommand)}
                      disabled={!aiCommand.trim() || isAILoading}
                      className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm flex items-center justify-center"
                    >
                      {isAILoading ? 'Processando...' : 'Enviar Comando'}
                    </button>

                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Comandos Rápidos:</p>
                      <div className="space-y-2">
                        <button
                          onClick={() => setAICommand('Listar leads inativos dos últimos 30 dias')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Leads inativos (30 dias)
                        </button>
                        <button
                          onClick={() => setAICommand('Enviar follow-up automático para leads inativos')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Follow-up automático
                        </button>
                        <button
                          onClick={() => setAICommand('Priorizar clientes por score')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Priorizar clientes
                        </button>
                        <button
                          onClick={() => setAICommand('Gerar relatório semanal de vendas')}
                          className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                        >
                          Relatório semanal
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Resposta da IA
                    </label>
                    {aiResponse && (
                      <div className="bg-gray-50 rounded-apple p-4 border border-gray-200">
                        <div className="whitespace-pre-wrap text-sm text-gray-800">{aiResponse}</div>
                      </div>
                    )}

                    {aiCommands.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Histórico:</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {aiCommands.map((cmd) => (
                            <div key={cmd.id} className="bg-white border border-gray-200 rounded-apple p-3">
                              <div className="text-xs text-gray-500 mb-1">{cmd.timestamp}</div>
                              <div className="text-sm font-medium text-gray-900 mb-1">{cmd.command}</div>
                              <div className="text-sm text-gray-700">{cmd.response}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Painel lateral do cliente */}
      {selectedClientePanel && (() => {
        const c = clientes.find(x => x.id === selectedClientePanel.id) || selectedClientePanel
        const vendedor = vendedores.find(v => v.id === c.vendedorId)
        const diasNaEtapa = c.dataEntradaEtapa ? Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000) : 0
        const etapaLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
        const etapaCores: Record<string, string> = { 'prospecção': 'bg-blue-100 text-blue-800', 'amostra': 'bg-yellow-100 text-yellow-800', 'homologado': 'bg-green-100 text-green-800', 'negociacao': 'bg-purple-100 text-purple-800', 'pos_venda': 'bg-pink-100 text-pink-800', 'perdido': 'bg-red-100 text-red-800' }
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        const clienteInteracoes = interacoes.filter(i => i.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        const clienteTarefas = tarefas.filter(t => t.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        const tipoInteracaoIcon: Record<string, string> = { email: '📧', whatsapp: '💬', ligacao: '📞', reuniao: '🤝', instagram: '📸', linkedin: '💼' }
        const tipoInteracaoLabel: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', ligacao: 'Ligação', reuniao: 'Reunião', instagram: 'Instagram', linkedin: 'LinkedIn' }

        const handleRegistrarAtividade = () => {
          if (!panelAtividadeTipo || !panelAtividadeDesc.trim()) return
          const newInteracao: Interacao = {
            id: Date.now(),
            clienteId: c.id,
            tipo: panelAtividadeTipo,
            data: new Date().toISOString(),
            assunto: `${tipoInteracaoLabel[panelAtividadeTipo]} - ${c.razaoSocial}`,
            descricao: panelAtividadeDesc.trim(),
            automatico: false
          }
          setInteracoes(prev => [newInteracao, ...prev])
          setPanelAtividadeTipo('')
          setPanelAtividadeDesc('')
          addNotificacao('success', 'Atividade registrada', `${tipoInteracaoLabel[panelAtividadeTipo]}: ${c.razaoSocial}`, c.id)
        }

        const handleSalvarNota = () => {
          if (!panelNota.trim()) return
          const newInteracao: Interacao = {
            id: Date.now(),
            clienteId: c.id,
            tipo: 'email',
            data: new Date().toISOString(),
            assunto: `📝 Observação - ${c.razaoSocial}`,
            descricao: panelNota.trim(),
            automatico: false
          }
          setInteracoes(prev => [newInteracao, ...prev])
          setPanelNota('')
          addNotificacao('success', 'Observação salva', c.razaoSocial, c.id)
        }

        const handleCriarTarefa = () => {
          if (!panelTarefaTitulo.trim()) return
          const novaTarefa: Tarefa = {
            id: Date.now(),
            titulo: panelTarefaTitulo.trim(),
            data: panelTarefaData,
            tipo: panelTarefaTipo,
            status: 'pendente',
            prioridade: panelTarefaPrioridade,
            clienteId: c.id
          }
          setTarefas(prev => [novaTarefa, ...prev])
          setPanelTarefaTitulo('')
          setPanelNovaTarefa(false)
          addNotificacao('success', 'Tarefa criada', `${panelTarefaTitulo.trim()} - ${c.razaoSocial}`, c.id)
        }

        return (
          <div className="fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black bg-opacity-30" onClick={() => setSelectedClientePanel(null)} />
            <div className="relative w-full sm:max-w-xl bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
                <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 truncate">{c.razaoSocial}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${etapaCores[c.etapa] || 'bg-gray-100 text-gray-800'}`}>{etapaLabels[c.etapa] || c.etapa}</span>
                      <span className="text-xs text-gray-500">Há {diasNaEtapa}d nesta etapa</span>
                      {c.score !== undefined && <span className="text-xs font-bold text-gray-600 ml-auto">Score: {c.score}</span>}
                    </div>
                  </div>
                  <button onClick={() => setSelectedClientePanel(null)} className="p-2 hover:bg-gray-100 rounded-apple ml-2"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-t border-gray-100">
                  {([['info', '📋 Info'], ['atividades', '📞 Atividades'], ['tarefas', '✅ Tarefas']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setPanelTab(key)} className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${panelTab === key ? 'text-primary-700 border-b-2 border-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>{label} {key === 'atividades' && clienteInteracoes.length > 0 ? `(${clienteInteracoes.length})` : ''}{key === 'tarefas' && clienteTarefas.length > 0 ? `(${clienteTarefas.length})` : ''}</button>
                  ))}
                </div>
              </div>

              <div className="px-4 sm:px-6 py-5 space-y-5">

                {/* === ABA INFO === */}
                {panelTab === 'info' && (
                  <>
                    {/* Contato */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📇 Contato</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><p className="text-xs text-gray-500">Nome</p><p className="font-medium text-gray-900">{c.contatoNome}</p></div>
                        <div><p className="text-xs text-gray-500">CNPJ</p><p className="font-medium text-gray-900">{c.cnpj}</p></div>
                        <div><p className="text-xs text-gray-500">Telefone</p><p className="font-medium text-gray-900">{c.contatoTelefone}</p></div>
                        <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900 truncate">{c.contatoEmail}</p></div>
                      </div>
                      {c.endereco && <div><p className="text-xs text-gray-500">Endereço</p><p className="text-sm text-gray-900">{c.endereco}</p></div>}
                    </div>

                    {/* Dados comerciais */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">💼 Dados Comerciais</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {c.valorEstimado && <div><p className="text-xs text-gray-500">Valor estimado</p><p className="font-bold text-primary-600">R$ {c.valorEstimado.toLocaleString('pt-BR')}</p></div>}
                        {vendedor && <div><p className="text-xs text-gray-500">Vendedor</p><p className="font-medium text-gray-900">{vendedor.nome}</p></div>}
                        {c.valorProposta && <div><p className="text-xs text-gray-500">Valor proposta</p><p className="font-bold text-purple-700">R$ {c.valorProposta.toLocaleString('pt-BR')}</p></div>}
                        {c.dataProposta && <div><p className="text-xs text-gray-500">Data proposta</p><p className="text-gray-900">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</p></div>}
                      </div>
                      {c.produtosInteresse && c.produtosInteresse.length > 0 && (
                        <div><p className="text-xs text-gray-500 mb-1">Produtos de interesse</p><div className="flex flex-wrap gap-1">{c.produtosInteresse.map(p => <span key={p} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded-full border border-primary-100">{p}</span>)}</div></div>
                      )}
                    </div>

                    {/* Info da etapa atual */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📊 Info da Etapa</h3>
                      {c.etapa === 'amostra' && (
                        <div className="space-y-1 text-sm">
                          {c.dataEnvioAmostra && <p className="text-gray-700">📦 Amostra enviada em: <span className="font-medium">{new Date(c.dataEnvioAmostra).toLocaleDateString('pt-BR')}</span></p>}
                          {c.statusAmostra && <p className="text-gray-700">Status: <span className="font-medium">{({ enviada: '📤 Enviada', aguardando_resposta: '⏳ Aguardando', aprovada: '✅ Aprovada', rejeitada: '❌ Rejeitada' })[c.statusAmostra]}</span></p>}
                          <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(30 - (c.dataEnvioAmostra ? Math.floor((Date.now() - new Date(c.dataEnvioAmostra).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
                        </div>
                      )}
                      {c.etapa === 'homologado' && (
                        <div className="space-y-1 text-sm">
                          {c.dataHomologacao && <p className="text-gray-700">✅ Homologado em: <span className="font-medium">{new Date(c.dataHomologacao).toLocaleDateString('pt-BR')}</span></p>}
                          {c.proximoPedidoPrevisto && <p className="text-gray-700">🛒 Próximo pedido: <span className="font-medium">{new Date(c.proximoPedidoPrevisto).toLocaleDateString('pt-BR')}</span></p>}
                          <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(75 - (c.dataHomologacao ? Math.floor((Date.now() - new Date(c.dataHomologacao).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
                        </div>
                      )}
                      {c.etapa === 'negociacao' && (
                        <div className="space-y-1 text-sm">
                          {c.valorProposta && <p className="text-gray-700">💰 Proposta: <span className="font-bold">R$ {c.valorProposta.toLocaleString('pt-BR')}</span></p>}
                          {c.dataProposta && <p className="text-gray-700">📅 Enviada em: <span className="font-medium">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</span></p>}
                        </div>
                      )}
                      {c.etapa === 'pos_venda' && (
                        <div className="space-y-1 text-sm">
                          {c.statusEntrega && <p className="text-gray-700">Status: <span className="font-medium">{({ preparando: '📋 Preparando', enviado: '🚚 Enviado', entregue: '✅ Entregue' })[c.statusEntrega]}</span></p>}
                          {c.dataUltimoPedido && <p className="text-gray-700">📦 Último pedido: <span className="font-medium">{new Date(c.dataUltimoPedido).toLocaleDateString('pt-BR')}</span></p>}
                        </div>
                      )}
                      {c.etapa === 'perdido' && (
                        <div className="space-y-1 text-sm">
                          {c.categoriaPerda && <p className="text-gray-700">Categoria: <span className="font-medium">{catLabels[c.categoriaPerda]}</span></p>}
                          {c.motivoPerda && <p className="text-gray-700">Motivo: <span className="font-medium">{c.motivoPerda}</span></p>}
                          {c.etapaAnterior && <p className="text-gray-700">Veio de: <span className="font-medium">{etapaLabels[c.etapaAnterior]}</span></p>}
                          {c.dataPerda && <p className="text-gray-700">Data: <span className="font-medium">{new Date(c.dataPerda).toLocaleDateString('pt-BR')}</span></p>}
                        </div>
                      )}
                      {c.etapa === 'prospecção' && (
                        <div className="space-y-1 text-sm">
                          <p className="text-gray-700">📅 Em prospecção há {diasNaEtapa} dias</p>
                          {c.diasInativo !== undefined && <p className="text-gray-700">⏳ Última interação: {c.diasInativo} dias atrás</p>}
                        </div>
                      )}
                    </div>

                    {/* Timeline */}
                    {c.historicoEtapas && c.historicoEtapas.length > 0 && (
                      <div className="bg-gray-50 rounded-apple border border-gray-200 p-4">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">🗺️ Jornada no Funil</h3>
                        <div className="relative pl-4 border-l-2 border-gray-300 space-y-3">
                          {c.historicoEtapas.map((h, i) => (
                            <div key={i} className="relative">
                              <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${i === c.historicoEtapas!.length - 1 ? 'bg-primary-600 ring-2 ring-primary-200' : 'bg-gray-400'}`} />
                              <div className="ml-2">
                                <p className="text-sm font-medium text-gray-900">{etapaLabels[h.etapa] || h.etapa}</p>
                                <p className="text-xs text-gray-500">{new Date(h.data).toLocaleDateString('pt-BR')} {h.de && `← ${etapaLabels[h.de] || h.de}`}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ações rápidas */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">⚡ Ações Rápidas</h3>
                      <div className="flex flex-wrap gap-2">
                        {c.etapa !== 'perdido' && (
                          <button onClick={() => { handleEditCliente(c); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-apple hover:bg-gray-50">✏️ Editar</button>
                        )}
                        {c.etapa === 'prospecção' && (
                          <button onClick={() => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: 'prospecção' }); setPendingDrop({ e: fakeE, toStage: 'amostra' }); setModalAmostraData(new Date().toISOString().split('T')[0]); setShowModalAmostra(true); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-apple hover:bg-yellow-700">📦 Enviar Amostra</button>
                        )}
                        {c.etapa === 'amostra' && (
                          <button onClick={() => { moverCliente(c.id, 'homologado', { dataHomologacao: new Date().toISOString().split('T')[0], statusAmostra: 'aprovada' }); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">✅ Homologar</button>
                        )}
                        {c.etapa === 'homologado' && (
                          <button onClick={() => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: 'homologado' }); setPendingDrop({ e: fakeE, toStage: 'negociacao' }); setModalPropostaValor(c.valorEstimado?.toString() || ''); setShowModalProposta(true); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-apple hover:bg-purple-700">💰 Negociar</button>
                        )}
                        {c.etapa === 'negociacao' && (
                          <>
                            <button onClick={() => { moverCliente(c.id, 'pos_venda', { statusEntrega: 'preparando', dataUltimoPedido: new Date().toISOString().split('T')[0] }); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">🎉 Ganhou</button>
                            <button onClick={() => { moverCliente(c.id, 'homologado', {}); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-apple hover:bg-gray-300">↩ Voltou p/ Homologado</button>
                          </>
                        )}
                        {c.etapa !== 'perdido' && (
                          <button onClick={() => { const fakeE = { preventDefault: () => {}, dataTransfer: { effectAllowed: 'move' } } as any; setDraggedItem({ cliente: c, fromStage: c.etapa }); setPendingDrop({ e: fakeE, toStage: 'perdido' }); setShowMotivoPerda(true); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">❌ Perdido</button>
                        )}
                        {c.etapa === 'perdido' && (
                          <button onClick={() => { moverCliente(c.id, 'prospecção', { motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined }); setSelectedClientePanel(null) }} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-apple hover:bg-blue-700">🔄 Reativar</button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* === ABA ATIVIDADES === */}
                {panelTab === 'atividades' && (
                  <>
                    {/* Registrar Atividade */}
                    <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-900">📞 Registrar Atividade</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {([['ligacao', '📞', 'Ligação'], ['whatsapp', '💬', 'WhatsApp'], ['email', '📧', 'Email'], ['reuniao', '🤝', 'Reunião'], ['instagram', '📸', 'Instagram'], ['linkedin', '💼', 'LinkedIn']] as const).map(([tipo, icon, label]) => (
                          <button key={tipo} onClick={() => setPanelAtividadeTipo(panelAtividadeTipo === tipo ? '' : tipo)} className={`flex flex-col items-center gap-1 p-2 rounded-apple text-xs font-medium transition-all ${panelAtividadeTipo === tipo ? 'bg-primary-100 border-2 border-primary-500 text-primary-700 shadow-sm' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                            <span className="text-lg">{icon}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                      {panelAtividadeTipo && (
                        <div className="space-y-2">
                          <textarea
                            value={panelAtividadeDesc}
                            onChange={(e) => setPanelAtividadeDesc(e.target.value)}
                            placeholder={`Descreva a ${tipoInteracaoLabel[panelAtividadeTipo] || 'atividade'}...`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                            rows={3}
                          />
                          <button onClick={handleRegistrarAtividade} disabled={!panelAtividadeDesc.trim()} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            ✅ Registrar {tipoInteracaoLabel[panelAtividadeTipo]}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Observação rápida */}
                    <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📝 Observação Rápida</h3>
                      <textarea
                        value={panelNota}
                        onChange={(e) => setPanelNota(e.target.value)}
                        placeholder="Escreva uma nota ou observação sobre este cliente..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white"
                        rows={2}
                      />
                      <button onClick={handleSalvarNota} disabled={!panelNota.trim()} className="px-4 py-1.5 bg-gray-800 text-white rounded-apple text-xs font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        💾 Salvar Observação
                      </button>
                    </div>

                    {/* Histórico de interações */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">🕐 Histórico de Interações ({clienteInteracoes.length})</h3>
                      {clienteInteracoes.length === 0 ? (
                        <div className="bg-gray-50 rounded-apple border border-gray-200 p-6 text-center">
                          <p className="text-sm text-gray-500">Nenhuma interação registrada ainda.</p>
                          <p className="text-xs text-gray-400 mt-1">Use os botões acima para registrar a primeira atividade!</p>
                        </div>
                      ) : (
                        <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
                          {clienteInteracoes.slice(0, 15).map((inter) => (
                            <div key={inter.id} className="relative">
                              <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${inter.automatico ? 'bg-gray-400' : 'bg-primary-500'}`} />
                              <div className="ml-2 bg-white rounded-apple border border-gray-200 p-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-900">{tipoInteracaoIcon[inter.tipo] || '📋'} {inter.assunto}</span>
                                  {inter.automatico && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full">Auto</span>}
                                </div>
                                <p className="text-xs text-gray-600 mt-1">{inter.descricao}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{new Date(inter.data).toLocaleDateString('pt-BR')} às {new Date(inter.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          ))}
                          {clienteInteracoes.length > 15 && <p className="text-xs text-gray-400 text-center">... e mais {clienteInteracoes.length - 15} interações</p>}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* === ABA TAREFAS === */}
                {panelTab === 'tarefas' && (
                  <>
                    {/* Botão nova tarefa */}
                    {!panelNovaTarefa ? (
                      <button onClick={() => setPanelNovaTarefa(true)} className="w-full px-4 py-3 bg-primary-50 border-2 border-dashed border-primary-300 rounded-apple text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors">
                        ➕ Nova Tarefa para {c.razaoSocial}
                      </button>
                    ) : (
                      <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">📋 Nova Tarefa</h3>
                        <input
                          type="text"
                          value={panelTarefaTitulo}
                          onChange={(e) => setPanelTarefaTitulo(e.target.value)}
                          placeholder="Título da tarefa... ex: Ligar para confirmar pedido"
                          className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Data</label>
                            <input type="date" value={panelTarefaData} onChange={(e) => setPanelTarefaData(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                            <select value={panelTarefaTipo} onChange={(e) => setPanelTarefaTipo(e.target.value as Tarefa['tipo'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                              <option value="follow-up">Follow-up</option>
                              <option value="ligacao">Ligação</option>
                              <option value="email">Email</option>
                              <option value="whatsapp">WhatsApp</option>
                              <option value="reuniao">Reunião</option>
                              <option value="outro">Outro</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Prioridade</label>
                            <select value={panelTarefaPrioridade} onChange={(e) => setPanelTarefaPrioridade(e.target.value as Tarefa['prioridade'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                              <option value="alta">Alta</option>
                              <option value="media">Média</option>
                              <option value="baixa">Baixa</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleCriarTarefa} disabled={!panelTarefaTitulo.trim()} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">✅ Criar Tarefa</button>
                          <button onClick={() => setPanelNovaTarefa(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-apple text-sm font-medium hover:bg-gray-200">Cancelar</button>
                        </div>
                      </div>
                    )}

                    {/* Lista de tarefas */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900">📋 Tarefas do Cliente ({clienteTarefas.length})</h3>
                      {clienteTarefas.length === 0 ? (
                        <div className="bg-gray-50 rounded-apple border border-gray-200 p-6 text-center">
                          <p className="text-sm text-gray-500">Nenhuma tarefa vinculada a este cliente.</p>
                          <p className="text-xs text-gray-400 mt-1">Crie a primeira tarefa acima!</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {clienteTarefas.map((t) => (
                            <div key={t.id} className={`bg-white rounded-apple border p-3 ${t.status === 'concluida' ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                              <div className="flex items-start gap-2">
                                <button onClick={() => setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: x.status === 'concluida' ? 'pendente' : 'concluida' } : x))} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${t.status === 'concluida' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-primary-500'}`}>
                                  {t.status === 'concluida' && <span className="text-xs">✓</span>}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${t.status === 'concluida' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.titulo}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-[10px] text-gray-400">{new Date(t.data).toLocaleDateString('pt-BR')}</span>
                                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${t.prioridade === 'alta' ? 'bg-red-100 text-red-700' : t.prioridade === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{t.prioridade}</span>
                                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded-full">{t.tipo}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast transição inválida */}
      {transicaoInvalida && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-5 py-3 rounded-apple shadow-apple-lg max-w-md animate-pulse">
          <p className="text-sm font-medium">⛔ {transicaoInvalida}</p>
        </div>
      )}

      {/* Modal Motivo de Perda */}
      {showMotivoPerda && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">❌ Marcar como Perdido</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { key: 'preco', label: '💲 Preço', color: 'yellow' },
                { key: 'prazo', label: '⏰ Prazo', color: 'orange' },
                { key: 'qualidade', label: '⭐ Qualidade', color: 'blue' },
                { key: 'concorrencia', label: '🏁 Concorrência', color: 'red' },
                { key: 'sem_resposta', label: '📵 Sem resposta', color: 'gray' },
                { key: 'outro', label: '📝 Outro', color: 'purple' },
              ] as { key: NonNullable<Cliente['categoriaPerda']>; label: string; color: string }[]).map(cat => (
                <button key={cat.key} onClick={() => setCategoriaPerdaSel(cat.key)}
                  className={`px-2 py-2 text-xs font-medium rounded-apple border-2 transition-all ${categoriaPerdaSel === cat.key ? `border-${cat.color}-500 bg-${cat.color}-50 text-${cat.color}-800` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >{cat.label}</button>
              ))}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da perda <span className="text-red-500">*</span></label>
            <textarea value={motivoPerdaTexto} onChange={(e) => setMotivoPerdaTexto(e.target.value)} rows={2} placeholder="Descreva o motivo da perda... (obrigatório)" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowMotivoPerda(false); setDraggedItem(null); setPendingDrop(null); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro') }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmPerda} disabled={!categoriaPerdaSel || !motivoPerdaTexto.trim()} className="px-4 py-2 bg-red-600 text-white rounded-apple hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Perda</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Envio de Amostra */}
      {showModalAmostra && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">📦 Enviar Amostra</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de envio da amostra</label>
            <input type="date" value={modalAmostraData} onChange={(e) => setModalAmostraData(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2 text-sm" />
            <p className="text-xs text-gray-500 mb-4">O prazo de 30 dias para resposta começará a contar a partir desta data.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowModalAmostra(false); setDraggedItem(null); setPendingDrop(null) }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmAmostra} className="px-4 py-2 bg-yellow-600 text-white rounded-apple hover:bg-yellow-700 text-sm font-medium">Confirmar Envio</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Valor da Proposta */}
      {showModalProposta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">💰 Nova Negociação</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor da proposta (R$)</label>
            <input type="number" value={modalPropostaValor} onChange={(e) => setModalPropostaValor(e.target.value)} placeholder="Ex: 150000" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowModalProposta(false); setDraggedItem(null); setPendingDrop(null); setModalPropostaValor('') }} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmProposta} className="px-4 py-2 bg-purple-600 text-white rounded-apple hover:bg-purple-700 text-sm font-medium">Iniciar Negociação</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Dashboard View
const DashboardView: React.FC<DashboardViewProps> = ({ clientes, metrics, vendedores, atividades, interacoes, produtos, tarefas, loggedUser }) => {
  const stages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda', 'perdido']
  const stageLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
  const pipelineData = stages.map(s => ({
    name: stageLabels[s] || s,
    valor: clientes.filter(c => c.etapa === s).reduce((sum, c) => sum + (c.valorEstimado || 0), 0),
    qtd: clientes.filter(c => c.etapa === s).length
  }))
  const COLORS = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899', '#EF4444']

  const vendedorData = vendedores.filter(v => v.ativo).map(v => ({
    name: v.nome.split(' ')[0],
    pipeline: clientes.filter(c => c.vendedorId === v.id).reduce((s, c) => s + (c.valorEstimado || 0), 0),
    leads: clientes.filter(c => c.vendedorId === v.id).length
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Visão geral das suas vendas e métricas em tempo real</p>
      </div>

      {/* Item 6: Painel Ações do Dia */}
      {(() => {
        const hoje = new Date().toISOString().split('T')[0]
        const isVendedor = loggedUser?.cargo === 'vendedor' || loggedUser?.cargo === 'sdr'
        const meusClientes = isVendedor ? clientes.filter(c => c.vendedorId === loggedUser?.id) : clientes
        const meusClienteIds = new Set(meusClientes.map(c => c.id))

        const acoes: { id: string; prioridade: number; icon: string; titulo: string; subtitulo: string; tipo: 'vencida' | 'hoje' | 'prazo' | 'proposta' }[] = []

        // Tarefas vencidas
        tarefas.filter(t => t.status === 'pendente' && t.data < hoje && (!isVendedor || (t.clienteId && meusClienteIds.has(t.clienteId)))).forEach(t => {
          const cl = clientes.find(c => c.id === t.clienteId)
          acoes.push({ id: `tv-${t.id}`, prioridade: 0, icon: '🔴', titulo: t.titulo, subtitulo: `Vencida em ${new Date(t.data).toLocaleDateString('pt-BR')}${cl ? ` • ${cl.razaoSocial}` : ''}`, tipo: 'vencida' })
        })
        // Tarefas de hoje
        tarefas.filter(t => t.status === 'pendente' && t.data === hoje && (!isVendedor || (t.clienteId && meusClienteIds.has(t.clienteId)))).forEach(t => {
          const cl = clientes.find(c => c.id === t.clienteId)
          acoes.push({ id: `th-${t.id}`, prioridade: 1, icon: '🟡', titulo: t.titulo, subtitulo: `Hoje${t.hora ? ` às ${t.hora}` : ''}${cl ? ` • ${cl.razaoSocial}` : ''}`, tipo: 'hoje' })
        })
        // Clientes com prazo vencendo
        meusClientes.filter(c => c.etapa === 'amostra' && c.dataEntradaEtapa).forEach(c => {
          const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa!).getTime()) / 86400000)
          if (dias >= 25 && dias <= 30) acoes.push({ id: `pa-${c.id}`, prioridade: 2, icon: '⚠️', titulo: `Prazo amostra vencendo — ${c.razaoSocial}`, subtitulo: `${dias}/30 dias — ${30 - dias} dias restantes`, tipo: 'prazo' })
        })
        meusClientes.filter(c => c.etapa === 'homologado' && c.dataEntradaEtapa).forEach(c => {
          const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa!).getTime()) / 86400000)
          if (dias >= 60 && dias <= 75) acoes.push({ id: `ph-${c.id}`, prioridade: 2, icon: '⚠️', titulo: `Prazo homologação vencendo — ${c.razaoSocial}`, subtitulo: `${dias}/75 dias — ${75 - dias} dias restantes`, tipo: 'prazo' })
        })
        // Propostas sem resposta > 7 dias
        meusClientes.filter(c => c.etapa === 'negociacao' && c.dataProposta).forEach(c => {
          const dias = Math.floor((Date.now() - new Date(c.dataProposta!).getTime()) / 86400000)
          if (dias > 7) acoes.push({ id: `pr-${c.id}`, prioridade: 3, icon: '💰', titulo: `Proposta sem resposta — ${c.razaoSocial}`, subtitulo: `Enviada há ${dias} dias • R$ ${(c.valorProposta || c.valorEstimado || 0).toLocaleString('pt-BR')}`, tipo: 'proposta' })
        })

        acoes.sort((a, b) => a.prioridade - b.prioridade)
        const acoesVisiveis = acoes.slice(0, 8)

        if (acoesVisiveis.length === 0) return null
        return (
          <div className="bg-white rounded-apple shadow-apple-sm border-2 border-primary-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Ações do Dia</h3>
                  <p className="text-xs text-gray-500">{acoesVisiveis.length} ação{acoesVisiveis.length !== 1 ? 'ões' : ''} pendente{acoesVisiveis.length !== 1 ? 's' : ''}{isVendedor ? ' (seus clientes)' : ''}</p>
                </div>
              </div>
              {acoes.length > 8 && <span className="text-xs text-gray-400">+{acoes.length - 8} mais</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {acoesVisiveis.map(a => (
                <div key={a.id} className={`flex items-start gap-2.5 p-3 rounded-apple border ${a.tipo === 'vencida' ? 'border-red-200 bg-red-50' : a.tipo === 'hoje' ? 'border-yellow-200 bg-yellow-50' : a.tipo === 'prazo' ? 'border-orange-200 bg-orange-50' : 'border-purple-200 bg-purple-50'}`}>
                  <span className="text-sm flex-shrink-0 mt-0.5">{a.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.titulo}</p>
                    <p className="text-xs text-gray-600">{a.subtitulo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total Leads', value: metrics.totalLeads, icon: '📊', color: 'blue' },
          { label: 'Leads Ativos', value: metrics.leadsAtivos, icon: '✓', color: 'green' },
          { label: 'Conversão', value: `${metrics.taxaConversao.toFixed(1)}%`, icon: '📈', color: 'purple' },
          { label: 'Valor Total', value: `R$ ${metrics.valorTotal.toLocaleString('pt-BR')}`, icon: '💰', color: 'gray' },
          { label: 'Ticket Médio', value: `R$ ${metrics.ticketMedio.toLocaleString('pt-BR')}`, icon: '🎯', color: 'orange' },
          { label: 'Novos Hoje', value: metrics.leadsNovosHoje, icon: '🆕', color: 'blue' },
          { label: 'Interações', value: metrics.interacoesHoje, icon: '💬', color: 'indigo' },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500">{m.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Metas de Vendas */}
      {(() => {
        const metaVendasMensal = 500000
        const metaLeadsMensal = 20
        const metaConversaoMensal = 15
        const metaTicketMedio = 80000

        const progressoVendas = Math.min((metrics.valorTotal / metaVendasMensal) * 100, 100)
        const progressoLeads = Math.min((metrics.totalLeads / metaLeadsMensal) * 100, 100)
        const progressoConversao = Math.min((metrics.taxaConversao / metaConversaoMensal) * 100, 100)
        const progressoTicket = Math.min((metrics.ticketMedio / metaTicketMedio) * 100, 100)

        const faltaVendas = Math.max(metaVendasMensal - metrics.valorTotal, 0)
        const diasRestantesMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()

        const getBarColor = (pct: number) => {
          if (pct >= 100) return 'bg-green-500'
          if (pct >= 75) return 'bg-blue-500'
          if (pct >= 50) return 'bg-yellow-500'
          return 'bg-red-500'
        }

        const getStatusLabel = (pct: number) => {
          if (pct >= 100) return { text: '✅ Meta atingida!', color: 'text-green-700 bg-green-50 border-green-200' }
          if (pct >= 75) return { text: '🔥 Quase lá!', color: 'text-blue-700 bg-blue-50 border-blue-200' }
          if (pct >= 50) return { text: '⚡ No caminho', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
          return { text: '⚠️ Atenção', color: 'text-red-700 bg-red-50 border-red-200' }
        }

        const statusVendas = getStatusLabel(progressoVendas)

        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">🎯 Metas do Mês</h3>
                <p className="text-sm text-gray-500 mt-1">{diasRestantesMes} dias restantes no mês</p>
              </div>
              <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${statusVendas.color}`}>
                {statusVendas.text}
              </span>
            </div>

            {/* Meta Principal - Vendas */}
            <div className="mb-6 p-4 bg-gray-50 rounded-apple border border-gray-200">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-600">Meta de Vendas Mensal</p>
                  <p className="text-3xl font-bold text-gray-900">R$ {metrics.valorTotal.toLocaleString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">de R$ {metaVendasMensal.toLocaleString('pt-BR')}</p>
                  <p className="text-2xl font-bold text-primary-600">{progressoVendas.toFixed(1)}%</p>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div className={`h-4 rounded-full transition-all duration-500 ${getBarColor(progressoVendas)}`} style={{ width: `${progressoVendas}%` }}></div>
              </div>
              {faltaVendas > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Faltam <span className="font-semibold text-gray-700">R$ {faltaVendas.toLocaleString('pt-BR')}</span> para bater a meta
                  {diasRestantesMes > 0 && <> — média de <span className="font-semibold text-gray-700">R$ {Math.ceil(faltaVendas / diasRestantesMes).toLocaleString('pt-BR')}</span>/dia</>}
                </p>
              )}
            </div>

            {/* Metas Secundárias */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">📋 Leads</p>
                  <p className="text-sm font-bold text-gray-900">{metrics.totalLeads}/{metaLeadsMensal}</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-2.5 rounded-full transition-all duration-500 ${getBarColor(progressoLeads)}`} style={{ width: `${progressoLeads}%` }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{progressoLeads.toFixed(0)}% da meta</p>
              </div>

              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">🔄 Conversão</p>
                  <p className="text-sm font-bold text-gray-900">{metrics.taxaConversao.toFixed(1)}%/{metaConversaoMensal}%</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-2.5 rounded-full transition-all duration-500 ${getBarColor(progressoConversao)}`} style={{ width: `${progressoConversao}%` }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{progressoConversao.toFixed(0)}% da meta</p>
              </div>

              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">💰 Ticket Médio</p>
                  <p className="text-sm font-bold text-gray-900">R$ {metrics.ticketMedio.toLocaleString('pt-BR')}</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-2.5 rounded-full transition-all duration-500 ${getBarColor(progressoTicket)}`} style={{ width: `${progressoTicket}%` }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{progressoTicket.toFixed(0)}% da meta (R$ {metaTicketMedio.toLocaleString('pt-BR')})</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Projeção de Receita Futura */}
      {(() => {
        const probEtapa: Record<string, number> = { 'prospecção': 0.10, 'amostra': 0.25, 'homologado': 0.50, 'negociacao': 0.75, 'pos_venda': 0.95 }
        const etapasAtivas = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
        const etapaLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda' }
        const projColors: Record<string, string> = { 'prospecção': '#93C5FD', 'amostra': '#FDE68A', 'homologado': '#86EFAC', 'negociacao': '#C4B5FD', 'pos_venda': '#FBCFE8' }

        const projecaoPorEtapa = etapasAtivas.map(etapa => {
          const clientesEtapa = clientes.filter(c => c.etapa === etapa)
          const valor = clientesEtapa.reduce((s, c) => s + (c.valorEstimado || 0), 0)
          const projetado = valor * (probEtapa[etapa] || 0)
          return { etapa, label: etapaLabels[etapa], valor, prob: (probEtapa[etapa] || 0) * 100, projetado, qtd: clientesEtapa.length }
        })

        const totalProjetado = projecaoPorEtapa.reduce((s, p) => s + p.projetado, 0)
        const totalPipeline = projecaoPorEtapa.reduce((s, p) => s + p.valor, 0)

        const chartData = projecaoPorEtapa.filter(p => p.valor > 0).map(p => ({
          name: p.label,
          pipeline: p.valor,
          projetado: p.projetado
        }))

        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">🔮 Projeção de Receita</h3>
                <p className="text-sm text-gray-500">Baseada na probabilidade de conversão por etapa do funil</p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm text-gray-500">Receita projetada</p>
                <p className="text-2xl font-bold text-green-600">R$ {totalProjetado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
              {projecaoPorEtapa.map(p => (
                <div key={p.etapa} className="p-3 rounded-apple border border-gray-200 text-center">
                  <p className="text-[10px] text-gray-500 font-medium">{p.label}</p>
                  <p className="text-xs font-bold text-gray-900 mt-0.5">{p.qtd} lead{p.qtd !== 1 ? 's' : ''}</p>
                  <p className="text-[10px] text-gray-400">{p.prob}% prob.</p>
                  <p className="text-xs font-bold mt-1" style={{ color: projColors[p.etapa] ? '#059669' : '#6B7280' }}>R$ {p.projetado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number, name: string) => [`R$ ${value.toLocaleString('pt-BR')}`, name === 'pipeline' ? 'Pipeline Total' : 'Projetado']} />
                <Bar dataKey="pipeline" fill="#E5E7EB" name="Pipeline Total" radius={[4, 4, 0, 0]} />
                <Bar dataKey="projetado" fill="#10B981" name="Projetado" radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-apple flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📈</span>
                <div>
                  <p className="text-sm font-medium text-green-800">Pipeline total: R$ {totalPipeline.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-green-600">Taxa de conversão ponderada: {totalPipeline > 0 ? ((totalProjetado / totalPipeline) * 100).toFixed(1) : 0}%</p>
                </div>
              </div>
              <p className="text-lg font-bold text-green-700">→ R$ {totalProjetado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        )
      })()}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline por Etapa */}
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Pipeline por Etapa (R$)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Valor']} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {pipelineData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline por Vendedor */}
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 Pipeline por Vendedor (R$)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={vendedorData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={70} />
              <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Pipeline']} />
              <Bar dataKey="pipeline" fill="#6366F1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Produtos Ranking + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📦 Produtos Mais Procurados</h3>
          <div className="space-y-3">
            {(() => {
              const prodCount: Record<string, number> = {}
              clientes.forEach(c => (c.produtosInteresse || []).forEach(p => { prodCount[p] = (prodCount[p] || 0) + 1 }))
              const ranked = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
              const maxCount = ranked.length > 0 ? ranked[0][1] : 1
              if (ranked.length === 0) return <p className="text-sm text-gray-500">Nenhum produto vinculado a leads ainda</p>
              return ranked.map(([name, count], i) => {
                const prod = produtos.find(p => p.nome === name)
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400 w-5">{i + 1}.</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900">{name}</p>
                        <span className="text-xs text-gray-500">{count} leads</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-primary-500 transition-all" style={{ width: `${(count / maxCount) * 100}%` }}></div>
                      </div>
                      {prod && <p className="text-xs text-gray-400 mt-0.5">R$ {prod.preco.toFixed(2).replace('.', ',')} / {prod.unidade}</p>}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>

      {/* Activity Feed */}
      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">⚡ Atividades Recentes</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {atividades.slice(0, 8).map((a) => (
            <div key={a.id} className="px-6 py-3 flex items-center gap-3 hover:bg-gray-50">
              <span className="text-lg flex-shrink-0">
                {a.tipo === 'moveu' && '🔄'}
                {a.tipo === 'adicionou' && '➕'}
                {a.tipo === 'editou' && '✏️'}
                {a.tipo === 'interacao' && '💬'}
                {a.tipo === 'tarefa' && '✅'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{a.descricao}</p>
                <p className="text-xs text-gray-500">{a.vendedorNome} — {new Date(a.timestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>
              </div>
            </div>
          ))}
          {atividades.length === 0 && <div className="p-6 text-center text-gray-500 text-sm">Nenhuma atividade registrada</div>}
        </div>
      </div>
      </div>
    </div>
  )
}
// Funil View
function FunilView({ clientes, onDragStart, onDragOver, onDrop, onClickCliente, isGerente = false }: FunilViewProps & { onClickCliente?: (c: Cliente) => void; isGerente?: boolean }) {
  const stages = [
    { title: 'Prospecção', key: 'prospecção', color: 'blue', icon: '📞' },
    { title: 'Amostra', key: 'amostra', color: 'yellow', icon: '📦' },
    { title: 'Homologado', key: 'homologado', color: 'green', icon: '✅' },
    { title: 'Negociação', key: 'negociacao', color: 'purple', icon: '💰' },
    { title: 'Pós-Venda', key: 'pos_venda', color: 'pink', icon: '🚚' },
    { title: 'Perdido', key: 'perdido', color: 'red', icon: '❌' }
  ]

  const diasDesde = (dateStr?: string) => {
    if (!dateStr) return 0
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  }

  const getCardUrgencia = (cliente: Cliente): 'normal' | 'atencao' | 'critico' => {
    const dias = diasDesde(cliente.dataEntradaEtapa)
    if (cliente.etapa === 'amostra') {
      if (dias >= 30) return 'critico'
      if (dias >= 25) return 'atencao'
    }
    if (cliente.etapa === 'homologado') {
      if (dias >= 75) return 'critico'
      if (dias >= 60) return 'atencao'
    }
    return 'normal'
  }

  const urgenciaBorder = (u: string) => {
    if (u === 'critico') return 'border-l-4 border-l-red-500 bg-red-50'
    if (u === 'atencao') return 'border-l-4 border-l-yellow-500 bg-yellow-50'
    return 'bg-gray-50 border border-gray-200'
  }

  const renderCardInfo = (cliente: Cliente) => {
    const dias = diasDesde(cliente.dataEntradaEtapa)
    switch (cliente.etapa) {
      case 'prospecção':
        return (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[10px] text-gray-500">📅 Há {dias} dia{dias !== 1 ? 's' : ''} em prospecção</p>
            {cliente.diasInativo !== undefined && cliente.diasInativo > 7 && <p className="text-[10px] text-orange-600 font-medium">⚠️ {cliente.diasInativo}d sem interação</p>}
          </div>
        )
      case 'amostra': {
        const diasAmostra = diasDesde(cliente.dataEnvioAmostra || cliente.dataEntradaEtapa)
        const pctPrazo = Math.min((diasAmostra / 30) * 100, 100)
        const diasRestam = Math.max(30 - diasAmostra, 0)
        const statusLabel: Record<string, string> = { enviada: '📤 Enviada', aguardando_resposta: '⏳ Aguardando', aprovada: '✅ Aprovada', rejeitada: '❌ Rejeitada' }
        return (
          <div className="mt-1.5 space-y-1">
            {cliente.statusAmostra && <p className="text-[10px] font-medium text-gray-700">{statusLabel[cliente.statusAmostra] || cliente.statusAmostra}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 83 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pctPrazo}%` }} />
              </div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 5 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
            </div>
          </div>
        )
      }
      case 'homologado': {
        const diasHomol = diasDesde(cliente.dataHomologacao || cliente.dataEntradaEtapa)
        const pctPrazo = Math.min((diasHomol / 75) * 100, 100)
        const diasRestam = Math.max(75 - diasHomol, 0)
        return (
          <div className="mt-1.5 space-y-1">
            <p className="text-[10px] text-gray-500">✅ Homologado há {diasHomol}d</p>
            {cliente.proximoPedidoPrevisto && <p className="text-[10px] text-green-700 font-medium">🛒 Pedido prev.: {new Date(cliente.proximoPedidoPrevisto).toLocaleDateString('pt-BR')}</p>}
            <div className="flex items-center gap-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${pctPrazo >= 100 ? 'bg-red-500' : pctPrazo >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pctPrazo}%` }} />
              </div>
              <span className={`text-[9px] font-bold ${diasRestam <= 0 ? 'text-red-600' : diasRestam <= 15 ? 'text-yellow-600' : 'text-gray-500'}`}>{diasRestam > 0 ? `${diasRestam}d` : 'Vencido!'}</span>
            </div>
          </div>
        )
      }
      case 'negociacao':
        return (
          <div className="mt-1.5 space-y-0.5">
            {cliente.valorProposta && <p className="text-[10px] font-bold text-purple-700">💰 Proposta: R$ {cliente.valorProposta.toLocaleString('pt-BR')}</p>}
            {cliente.dataProposta && <p className="text-[10px] text-gray-500">📅 Enviada há {diasDesde(cliente.dataProposta)}d</p>}
          </div>
        )
      case 'pos_venda': {
        const statusLabel: Record<string, string> = { preparando: '📋 Preparando', enviado: '🚚 Enviado', entregue: '✅ Entregue' }
        return (
          <div className="mt-1.5 space-y-0.5">
            {cliente.statusEntrega && <p className="text-[10px] font-medium text-gray-700">{statusLabel[cliente.statusEntrega]}</p>}
            {cliente.dataUltimoPedido && <p className="text-[10px] text-gray-500">📦 Último pedido: {new Date(cliente.dataUltimoPedido).toLocaleDateString('pt-BR')}</p>}
          </div>
        )
      }
      case 'perdido': {
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        return (
          <div className="mt-1.5 space-y-0.5">
            {cliente.categoriaPerda && <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-red-100 text-red-700 rounded-full">{catLabels[cliente.categoriaPerda]}</span>}
            {cliente.etapaAnterior && <p className="text-[10px] text-gray-500">↩ Veio de: {cliente.etapaAnterior}</p>}
            {cliente.dataPerda && <p className="text-[10px] text-gray-500">📅 Perdido há {diasDesde(cliente.dataPerda)}d</p>}
          </div>
        )
      }
      default: return null
    }
  }

  const alertCount = clientes.filter(c => getCardUrgencia(c) !== 'normal').length

  return (
    <div className="space-y-4">
      {alertCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-apple p-3 flex items-center gap-2">
          <span className="text-lg">🚨</span>
          <p className="text-sm text-red-800"><span className="font-bold">{alertCount} cliente{alertCount > 1 ? 's' : ''}</span> com prazo vencendo ou vencido. Verifique os cards em vermelho/amarelo.</p>
        </div>
      )}
      <div className="flex lg:grid lg:grid-cols-6 gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:overflow-x-visible lg:pb-0">
        {stages.map((stage) => {
          const stageClientes = clientes.filter(c => c.etapa === stage.key)
          return (
            <div
              key={stage.title}
              className="bg-white rounded-apple shadow-apple-sm border border-gray-200 min-w-[260px] sm:min-w-[280px] lg:min-w-0 snap-start flex-shrink-0 lg:flex-shrink"
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, stage.key)}
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-gray-900 text-sm">{stage.icon} {stage.title}</h3>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full bg-${stage.color}-100 text-${stage.color}-800`}>
                    {stageClientes.length}
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-500 mb-2">R$ {stageClientes.reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</p>
                <div className="space-y-2 min-h-[200px] lg:min-h-[300px] max-h-[calc(100vh-280px)] overflow-y-auto">
                  {stageClientes.map((cliente) => {
                    const urgencia = getCardUrgencia(cliente)
                    return (
                      <div
                        key={cliente.id}
                        className={`p-2.5 rounded-apple ${isGerente ? 'cursor-move' : 'cursor-pointer'} hover:shadow-apple transition-all duration-200 ${urgenciaBorder(urgencia)}`}
                        draggable={isGerente}
                        onDragStart={(e) => isGerente ? onDragStart(e, cliente, stage.key) : e.preventDefault()}
                        onClick={() => onClickCliente?.(cliente)}
                      >
                        <div className="flex items-start justify-between">
                          <h4 className="font-semibold text-xs text-gray-900 leading-tight">{cliente.razaoSocial}</h4>
                          {urgencia !== 'normal' && <span className="text-xs flex-shrink-0">{urgencia === 'critico' ? '🔴' : '🟡'}</span>}
                        </div>
                        <p className="text-[10px] text-gray-500">{cliente.contatoNome}</p>
                        {cliente.valorEstimado && <p className="text-[10px] font-bold text-primary-600">R$ {cliente.valorEstimado.toLocaleString('pt-BR')}</p>}
                        {renderCardInfo(cliente)}
                        {cliente.produtosInteresse && cliente.produtosInteresse.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {cliente.produtosInteresse.slice(0, 2).map(p => (
                              <span key={p} className="px-1 py-0.5 text-[9px] bg-primary-50 text-primary-700 rounded-full border border-primary-100 truncate max-w-[90px]">{p}</span>
                            ))}
                            {cliente.produtosInteresse.length > 2 && <span className="text-[9px] text-gray-400">+{cliente.produtosInteresse.length - 2}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {stageClientes.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      Arraste clientes aqui
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Clientes View
const ClientesView: React.FC<ClientesViewProps> = ({ clientes, vendedores, onNewCliente, onEditCliente }) => {
  const [searchTerm, setSearchTerm] = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)
  const [filterEtapa, setFilterEtapa] = React.useState('')
  const [filterVendedor, setFilterVendedor] = React.useState('')
  const [filterScoreMin, setFilterScoreMin] = React.useState('')
  const [filterValorMin, setFilterValorMin] = React.useState('')
  const [selectedClienteId, setSelectedClienteId] = React.useState<number | null>(null)
  
  const filteredClientes = clientes.filter(cliente => {
    const matchSearch = cliente.razaoSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.contatoNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.cnpj.includes(searchTerm)
    const matchEtapa = !filterEtapa || cliente.etapa === filterEtapa
    const matchVendedor = !filterVendedor || String(cliente.vendedorId) === filterVendedor
    const matchScore = !filterScoreMin || (cliente.score || 0) >= Number(filterScoreMin)
    const matchValor = !filterValorMin || (cliente.valorEstimado || 0) >= Number(filterValorMin)
    return matchSearch && matchEtapa && matchVendedor && matchScore && matchValor
  })

  const getEtapaColor = (etapa: string) => {
    switch (etapa) {
      case 'prospecção': return 'bg-blue-100 text-blue-800'
      case 'amostra': return 'bg-yellow-100 text-yellow-800'
      case 'homologado': return 'bg-green-100 text-green-800'
      case 'negociacao': return 'bg-purple-100 text-purple-800'
      case 'pos_venda': return 'bg-pink-100 text-pink-800'
      case 'perdido': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
        <input
          type="text"
          placeholder="Buscar clientes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent w-full sm:w-80 lg:w-96"
        />
        <div className="flex gap-2 flex-wrap">
          <label className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-3 sm:px-4 rounded-apple transition-colors duration-200 shadow-apple-sm border border-gray-300 flex items-center cursor-pointer text-sm">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  const text = ev.target?.result as string
                  const lines = text.split('\n').filter(l => l.trim())
                  if (lines.length < 2) { alert('CSV vazio ou sem dados'); return }
                  alert(`✅ ${lines.length - 1} clientes importados com sucesso!\n\n(MVP: dados mockados - integração real em breve)`)
                }
                reader.readAsText(file)
                e.target.value = ''
              }}
            />
            📥 Importar CSV
          </label>
          <button
            onClick={() => {
              const csv = 'razaoSocial,cnpj,contatoNome,contatoTelefone,contatoEmail,endereco,valorEstimado,etapa,score\n' +
                clientes.map(c => `"${c.razaoSocial}","${c.cnpj}","${c.contatoNome}","${c.contatoTelefone}","${c.contatoEmail}","${c.endereco || ''}","${c.valorEstimado || ''}","${c.etapa}","${c.score || 0}"`).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm border border-gray-300 flex items-center"
          >
            📤 Exportar CSV
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm border flex items-center font-medium ${showFilters ? 'bg-primary-50 text-primary-700 border-primary-300' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2" />
            Filtros
          </button>
          <button 
            onClick={onNewCliente}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Novo Cliente
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etapa</label>
              <select value={filterEtapa} onChange={(e) => setFilterEtapa(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Todas</option>
                <option value="prospecção">Prospecção</option>
                <option value="amostra">Amostra</option>
                <option value="homologado">Homologado</option>
                <option value="negociacao">Negociação</option>
                <option value="pos_venda">Pós-Venda</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor</label>
              <select value={filterVendedor} onChange={(e) => setFilterVendedor(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Todos</option>
                {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Score mínimo</label>
              <input type="number" value={filterScoreMin} onChange={(e) => setFilterScoreMin(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor mínimo (R$)</label>
              <input type="number" value={filterValorMin} onChange={(e) => setFilterValorMin(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-gray-500">{filteredClientes.length} de {clientes.length} clientes</p>
            <button onClick={() => { setFilterEtapa(''); setFilterVendedor(''); setFilterScoreMin(''); setFilterValorMin('') }} className="text-xs text-primary-600 hover:text-primary-800 font-medium">Limpar filtros</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Cliente</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Contato</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Etapa</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Vendedor</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Score</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredClientes.map((cliente) => (
                <tr key={cliente.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-gray-900">{cliente.razaoSocial}</p>
                      <p className="text-sm text-gray-500">{cliente.cnpj}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-gray-900">{cliente.contatoNome}</p>
                      <p className="text-sm text-gray-500">{cliente.contatoTelefone}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getEtapaColor(cliente.etapa)}`}>
                      {cliente.etapa.charAt(0).toUpperCase() + cliente.etapa.slice(1)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {(() => {
                      const v = vendedores.find(v => v.id === cliente.vendedorId)
                      return v ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-primary-700">{v.avatar}</span>
                          </div>
                          <span className="text-sm text-gray-900">{v.nome}</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>
                    })()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <span className="text-gray-900">{cliente.score}</span>
                      <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${cliente.score}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <button 
                      onClick={() => onEditCliente(cliente)}
                      className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const ProspeccaoView: React.FC<{
  clientes: Cliente[]
  interacoes: Interacao[]
  templates: TemplateMsg[]
  cadencias: Cadencia[]
  campanhas: Campanha[]
  jobs: JobAutomacao[]
  onQuickAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
  onStartCampanha: (campanhaId: number) => void
  onRunJobNow: (jobId: number) => void
  onCreateTemplate: (t: TemplateMsg) => void
  onCreateCampanha: (c: Campanha) => void
}> = ({
  clientes,
  interacoes,
  templates,
  cadencias,
  campanhas,
  jobs,
  onQuickAction,
  onStartCampanha,
  onRunJobNow,
  onCreateTemplate,
  onCreateCampanha
}) => {
  const [tab, setTab] = React.useState<'painel' | 'fila' | 'campanhas' | 'cadencias' | 'templates'>('painel')
  const [query, setQuery] = React.useState('')
  const [selectedLeadId, setSelectedLeadId] = React.useState<number>(clientes[0]?.id ?? 0)
  const selectedLead = clientes.find((c) => c.id === selectedLeadId) ?? null

  const [newTemplateNome, setNewTemplateNome] = React.useState('')
  const [newTemplateCanal, setNewTemplateCanal] = React.useState<Interacao['tipo']>('whatsapp')
  const [newTemplateConteudo, setNewTemplateConteudo] = React.useState('')

  const [newCampanhaNome, setNewCampanhaNome] = React.useState('')
  const [newCampanhaCadenciaId, setNewCampanhaCadenciaId] = React.useState<number>(cadencias[0]?.id ?? 1)
  const [newCampanhaEtapa, setNewCampanhaEtapa] = React.useState<string>('')
  const [newCampanhaMinScore, setNewCampanhaMinScore] = React.useState<string>('')
  const [newCampanhaDiasInativo, setNewCampanhaDiasInativo] = React.useState<string>('')

  const filteredLeads = clientes.filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      c.razaoSocial.toLowerCase().includes(q) ||
      c.contatoNome.toLowerCase().includes(q) ||
      c.cnpj.includes(q)
    )
  })

  const leadInteracoes = selectedLead
    ? interacoes.filter((i) => i.clienteId === selectedLead.id)
    : []

  const topLeads = [...clientes]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10)

  const badge = (status: string) => {
    switch (status) {
      case 'ativa':
        return 'bg-green-100 text-green-800'
      case 'pausada':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const jobBadge = (status: JobAutomacao['status']) => {
    switch (status) {
      case 'pendente':
        return 'bg-blue-100 text-blue-800'
      case 'enviado':
        return 'bg-green-100 text-green-800'
      case 'pausado':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-red-100 text-red-800'
    }
  }

  const TabButton: React.FC<{ id: typeof tab; label: string }> = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-2 text-sm font-medium rounded-apple transition-colors duration-200 ${
        tab === id
          ? 'bg-primary-600 text-white'
          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )

  const createTemplate = () => {
    if (!newTemplateNome.trim() || !newTemplateConteudo.trim()) return
    onCreateTemplate({
      id: Date.now(),
      canal: newTemplateCanal,
      nome: newTemplateNome.trim(),
      conteudo: newTemplateConteudo
    })
    setNewTemplateNome('')
    setNewTemplateConteudo('')
  }

  const createCampanha = () => {
    if (!newCampanhaNome.trim()) return
    onCreateCampanha({
      id: Date.now(),
      nome: newCampanhaNome.trim(),
      cadenciaId: newCampanhaCadenciaId,
      etapa: newCampanhaEtapa.trim() ? newCampanhaEtapa.trim() : undefined,
      minScore: newCampanhaMinScore.trim() ? Number(newCampanhaMinScore) : undefined,
      diasInativoMin: newCampanhaDiasInativo.trim() ? Number(newCampanhaDiasInativo) : undefined,
      status: 'rascunho'
    })
    setNewCampanhaNome('')
    setNewCampanhaEtapa('')
    setNewCampanhaMinScore('')
    setNewCampanhaDiasInativo('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Prospecção</h1>
          <p className="mt-1 text-sm text-gray-600">Painel operacional para cadências, campanhas, templates e fila do dia.</p>
        </div>
        <button
          onClick={() => {
            const sugestoes = clientes.map(cliente => {
              let acao = ''
              let prioridade = 'media'
              if ((cliente.diasInativo || 0) > 30) {
                acao = `Urgente: Reativar ${cliente.razaoSocial} - ${cliente.diasInativo} dias inativo`
                prioridade = 'alta'
              } else if (cliente.etapa === 'negociacao' && (cliente.score || 0) > 70) {
                acao = `Enviar proposta para ${cliente.razaoSocial} - Alta chance de conversão`
                prioridade = 'alta'
              } else if (cliente.etapa === 'prospecção' && (cliente.score || 0) < 40) {
                acao = `Qualificar melhor ${cliente.razaoSocial} - Score baixo`
                prioridade = 'baixa'
              } else if (cliente.etapa === 'amostra') {
                acao = `Follow-up amostra com ${cliente.razaoSocial}`
                prioridade = 'media'
              } else {
                acao = `Manter contato com ${cliente.razaoSocial}`
                prioridade = 'media'
              }
              return { cliente: cliente.razaoSocial, acao, prioridade }
            })
            const alta = sugestoes.filter(s => s.prioridade === 'alta').length
            const media = sugestoes.filter(s => s.prioridade === 'media').length
            const baixa = sugestoes.filter(s => s.prioridade === 'baixa').length
            const resumo = sugestoes.slice(0, 5).map(s =>
              `• ${s.prioridade === 'alta' ? '🔴' : s.prioridade === 'media' ? '🟡' : '⚪'} ${s.acao}`
            ).join('\n')
            alert(`✨ IA analisou ${clientes.length} clientes!\n\nPrioridades:\n🔴 Alta: ${alta}\n🟡 Média: ${media}\n⚪ Baixa: ${baixa}\n\nTOP 5 Ações Sugeridas:\n${resumo}\n\nDica: Execute as ações de alta prioridade primeiro!`)
          }}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-apple hover:from-purple-700 hover:to-blue-700 shadow-apple-sm flex items-center text-sm font-semibold"
        >
          <SparklesIcon className="h-4 w-4 mr-2" />
          IA Automatizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton id="painel" label="Painel do Lead" />
        <TabButton id="fila" label="Fila do dia" />
        <TabButton id="campanhas" label="Campanhas" />
        <TabButton id="cadencias" label="Cadências" />
        <TabButton id="templates" label="Templates" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 xl:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-900">Leads</div>
            <div className="text-xs text-gray-500">Top por score</div>
          </div>
          <div className="space-y-2">
            {topLeads.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedLeadId(c.id)}
                className={`w-full text-left p-3 rounded-apple border transition-colors ${
                  c.id === selectedLeadId
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.razaoSocial}</div>
                  <div className="text-xs font-semibold text-gray-700">{c.score || 0}</div>
                </div>
                <div className="text-xs text-gray-600 mt-1 truncate">{c.contatoNome}</div>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar lead..."
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
              {filteredLeads.slice(0, 20).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedLeadId(c.id)}
                  className="w-full text-left px-3 py-2 text-sm rounded-apple hover:bg-gray-50 border border-transparent"
                >
                  {c.razaoSocial}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          {tab === 'painel' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">{selectedLead?.razaoSocial || 'Selecione um lead'}</div>
                  {selectedLead && (
                    <div className="text-sm text-gray-600 mt-1">
                      {selectedLead.contatoNome} • {selectedLead.contatoEmail} • {selectedLead.contatoTelefone}
                    </div>
                  )}
                </div>
                {selectedLead && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Score</div>
                    <div className="text-lg font-bold text-gray-900">{selectedLead.score || 0}</div>
                  </div>
                )}
              </div>

              {selectedLead && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="rounded-apple border border-gray-200 p-4">
                    <div className="text-sm font-semibold text-gray-900">Ações rápidas</div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={() => onQuickAction(selectedLead, 'whatsapp', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato WhatsApp</button>
                      <button onClick={() => onQuickAction(selectedLead, 'email', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato Email</button>
                      <button onClick={() => onQuickAction(selectedLead, 'linkedin', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato LinkedIn</button>
                      <button onClick={() => onQuickAction(selectedLead, 'instagram', 'contato')} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Contato Instagram</button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={() => onQuickAction(selectedLead, 'whatsapp', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda WhatsApp</button>
                      <button onClick={() => onQuickAction(selectedLead, 'email', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda Email</button>
                      <button onClick={() => onQuickAction(selectedLead, 'linkedin', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda LinkedIn</button>
                      <button onClick={() => onQuickAction(selectedLead, 'instagram', 'propaganda')} className="px-3 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm">Propaganda Instagram</button>
                    </div>
                  </div>

                  <div className="rounded-apple border border-gray-200 p-4">
                    <div className="text-sm font-semibold text-gray-900">Próxima ação sugerida</div>
                    <div className="text-sm text-gray-700 mt-3">
                      {(selectedLead.diasInativo || 0) > 15
                        ? 'Lead inativo: sugerido follow-up por WhatsApp + Email.'
                        : 'Lead ativo: sugerido contato consultivo e envio de catálogo.'}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Inatividade: {selectedLead.diasInativo ?? '-'} dias • Etapa: {selectedLead.etapa}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <div className="text-sm font-semibold text-gray-900">Timeline</div>
                <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                  {leadInteracoes.length === 0 && (
                    <div className="text-sm text-gray-500">Sem interações ainda.</div>
                  )}
                  {leadInteracoes.map((i) => (
                    <div key={i.id} className="p-3 rounded-apple border border-gray-200 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-700">{i.tipo.toUpperCase()} • {i.assunto}</div>
                        <div className="text-xs text-gray-500">{new Date(i.data).toLocaleString('pt-BR')}</div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{i.descricao}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'fila' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="text-lg font-semibold text-gray-900">Fila do dia</div>
              <div className="text-sm text-gray-600 mt-1">Jobs pendentes para execução (MVP: executar agora).</div>
              <div className="mt-4 space-y-2">
                {jobs.length === 0 && <div className="text-sm text-gray-500">Sem jobs agendados ainda.</div>}
                {jobs.slice(0, 30).map((j) => {
                  const lead = clientes.find((c) => c.id === j.clienteId)
                  return (
                    <div key={j.id} className="flex items-center justify-between p-3 rounded-apple border border-gray-200">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{lead?.razaoSocial || `Lead ${j.clienteId}`}</div>
                        <div className="text-xs text-gray-600">{j.tipo} • {j.canal.toUpperCase()} • {new Date(j.agendadoPara).toLocaleString('pt-BR')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${jobBadge(j.status)}`}>{j.status}</span>
                        <button
                          disabled={j.status !== 'pendente'}
                          onClick={() => onRunJobNow(j.id)}
                          className="px-3 py-2 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-300"
                        >
                          Executar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'campanhas' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">Campanhas</div>
                  <div className="text-sm text-gray-600 mt-1">Defina audiência e inicie uma cadência automaticamente.</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Nova campanha</div>
                  <div className="mt-3 space-y-3">
                    <input value={newCampanhaNome} onChange={(e) => setNewCampanhaNome(e.target.value)} placeholder="Nome" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <select value={newCampanhaCadenciaId} onChange={(e) => setNewCampanhaCadenciaId(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-apple">
                      {cadencias.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                    <input value={newCampanhaEtapa} onChange={(e) => setNewCampanhaEtapa(e.target.value)} placeholder="Filtro etapa (opcional)" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <input value={newCampanhaMinScore} onChange={(e) => setNewCampanhaMinScore(e.target.value)} placeholder="Score mínimo (opcional)" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <input value={newCampanhaDiasInativo} onChange={(e) => setNewCampanhaDiasInativo(e.target.value)} placeholder="Dias inativo mínimo (opcional)" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <button onClick={createCampanha} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700">Criar</button>
                  </div>
                </div>

                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Campanhas existentes</div>
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                    {campanhas.map((c) => (
                      <div key={c.id} className="p-3 rounded-apple border border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900">{c.nome}</div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${badge(c.status)}`}>{c.status}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Cadência: {cadencias.find(x => x.id === c.cadenciaId)?.nome || c.cadenciaId}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button onClick={() => onStartCampanha(c.id)} className="px-3 py-2 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700">Iniciar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'cadencias' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="text-lg font-semibold text-gray-900">Cadências</div>
              <div className="text-sm text-gray-600 mt-1">Sequências de prospecção (layout). Edição avançada pode vir depois.</div>
              <div className="mt-4 space-y-3">
                {cadencias.map((c) => (
                  <div key={c.id} className="rounded-apple border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">{c.nome}</div>
                      <div className="text-xs text-gray-500">Pausa ao responder: {c.pausarAoResponder ? 'sim' : 'não'}</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {c.steps.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-apple px-3 py-2">
                          <div>Dia +{s.delayDias} • {s.canal.toUpperCase()}</div>
                          <div className="text-gray-500">Template: {templates.find(t => t.id === s.templateId)?.nome || s.templateId}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Novo template</div>
                  <div className="mt-3 space-y-3">
                    <input value={newTemplateNome} onChange={(e) => setNewTemplateNome(e.target.value)} placeholder="Nome" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <select value={newTemplateCanal} onChange={(e) => setNewTemplateCanal(e.target.value as Interacao['tipo'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple">
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                    </select>
                    <textarea value={newTemplateConteudo} onChange={(e) => setNewTemplateConteudo(e.target.value)} rows={6} placeholder="Conteúdo (use {nome}, {empresa})" className="w-full px-3 py-2 border border-gray-300 rounded-apple" />
                    <button onClick={createTemplate} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700">Criar</button>
                  </div>
                </div>

                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">Templates existentes</div>
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                    {templates.map((t) => (
                      <div key={t.id} className="p-3 rounded-apple border border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900">{t.nome}</div>
                          <div className="text-xs text-gray-500">{t.canal.toUpperCase()}</div>
                        </div>
                        <div className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{t.conteudo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const AutomacoesView: React.FC<{
  clientes: Cliente[]
  onAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
}> = ({ clientes, onAction }) => {
  const [selectedClienteId, setSelectedClienteId] = React.useState<number>(clientes[0]?.id ?? 0)
  const selectedCliente = clientes.find((c) => c.id === selectedClienteId) ?? null

  const disabled = !selectedCliente

  const actionButtonClass = (variant: 'primary' | 'secondary') =>
    variant === 'primary'
      ? 'px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm'
      : 'px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded-apple hover:bg-gray-50 transition-colors duration-200'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Automações de Vendas</h1>
        <p className="mt-1 text-sm text-gray-600">Dispare ações rápidas (MVP) por canal e registre no histórico.</p>
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Lead / Empresa</label>
            <select
              value={selectedClienteId}
              onChange={(e) => setSelectedClienteId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial}
                </option>
              ))}
            </select>

            {selectedCliente && (
              <div className="mt-4 rounded-apple border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-medium text-gray-900">{selectedCliente.razaoSocial}</div>
                <div className="text-xs text-gray-600 mt-1">Contato: {selectedCliente.contatoNome}</div>
                <div className="text-xs text-gray-600">Email: {selectedCliente.contatoEmail}</div>
                <div className="text-xs text-gray-600">WhatsApp: {selectedCliente.contatoTelefone}</div>
                <div className="text-xs text-gray-600">Etapa: {selectedCliente.etapa}</div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-apple border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Propaganda automática</div>
                <div className="text-xs text-gray-600 mt-1">Disparo rápido por canal (registrado no histórico).</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'whatsapp', 'propaganda')} className={actionButtonClass('primary')}>WhatsApp</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'email', 'propaganda')} className={actionButtonClass('primary')}>Email</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'instagram', 'propaganda')} className={actionButtonClass('primary')}>Instagram</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'linkedin', 'propaganda')} className={actionButtonClass('primary')}>LinkedIn</button>
                </div>
              </div>

              <div className="rounded-apple border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Entrar em contato</div>
                <div className="text-xs text-gray-600 mt-1">Ação de contato (registrada no histórico).</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'whatsapp', 'contato')} className={actionButtonClass('secondary')}>WhatsApp</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'email', 'contato')} className={actionButtonClass('secondary')}>Email</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'instagram', 'contato')} className={actionButtonClass('secondary')}>Instagram</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'linkedin', 'contato')} className={actionButtonClass('secondary')}>LinkedIn</button>
                </div>
              </div>
            </div>

            <div className="rounded-apple border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Templates (layout MVP)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="bg-gray-50 border border-gray-200 rounded-apple p-3">
                  <div className="text-xs font-medium text-gray-700">Template: Propaganda</div>
                  <div className="text-xs text-gray-600 mt-1">Olá {selectedCliente?.contatoNome || '[Nome]'}, temos condições especiais em produtos MF Paris. Quer receber o catálogo?</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-apple p-3">
                  <div className="text-xs font-medium text-gray-700">Template: Follow-up</div>
                  <div className="text-xs text-gray-600 mt-1">Oi {selectedCliente?.contatoNome || '[Nome]'}, passando para confirmar se você conseguiu analisar nossa proposta. Posso ajudar em algo?</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="text-sm font-semibold text-gray-900">Campanhas (layout)</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="rounded-apple border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-900">Recuperação de inativos</div>
            <div className="text-xs text-gray-600 mt-1">Sequência WhatsApp + Email</div>
            <div className="text-xs text-gray-500 mt-2">Status: rascunho</div>
          </div>
          <div className="rounded-apple border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-900">Lançamento de catálogo</div>
            <div className="text-xs text-gray-600 mt-1">Email + LinkedIn</div>
            <div className="text-xs text-gray-500 mt-2">Status: rascunho</div>
          </div>
          <div className="rounded-apple border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-900">Novos leads</div>
            <div className="text-xs text-gray-600 mt-1">Instagram + WhatsApp</div>
            <div className="text-xs text-gray-500 mt-2">Status: rascunho</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const TarefasView: React.FC<{
  tarefas: Tarefa[]
  clientes: Cliente[]
  onUpdateTarefa: (t: Tarefa) => void
  onAddTarefa: (t: Tarefa) => void
}> = ({ tarefas, clientes, onUpdateTarefa, onAddTarefa }) => {
  const [showModal, setShowModal] = React.useState(false)
  const [filterStatus, setFilterStatus] = React.useState<'todas' | 'pendente' | 'concluida'>('pendente')
  const [newTitulo, setNewTitulo] = React.useState('')
  const [newDescricao, setNewDescricao] = React.useState('')
  const [newData, setNewData] = React.useState(new Date().toISOString().split('T')[0])
  const [newHora, setNewHora] = React.useState('')
  const [newTipo, setNewTipo] = React.useState<Tarefa['tipo']>('ligacao')
  const [newPrioridade, setNewPrioridade] = React.useState<Tarefa['prioridade']>('media')
  const [newClienteId, setNewClienteId] = React.useState<number | ''>(clientes[0]?.id ?? '')

  const hoje = new Date().toISOString().split('T')[0]

  const filteredTarefas = tarefas.filter(t => {
    return filterStatus === 'todas' || t.status === filterStatus
  })

  const tarefasPorData = filteredTarefas.reduce((acc, t) => {
    if (!acc[t.data]) acc[t.data] = []
    acc[t.data].push(t)
    return acc
  }, {} as Record<string, Tarefa[]>)

  const datasOrdenadas = Object.keys(tarefasPorData).sort()

  const handleAddTarefa = () => {
    if (!newTitulo.trim()) return
    onAddTarefa({
      id: Date.now(),
      titulo: newTitulo.trim(),
      descricao: newDescricao.trim() || undefined,
      data: newData,
      hora: newHora.trim() || undefined,
      tipo: newTipo,
      status: 'pendente',
      prioridade: newPrioridade,
      clienteId: typeof newClienteId === 'number' ? newClienteId : undefined
    })
    setNewTitulo('')
    setNewDescricao('')
    setNewHora('')
    setShowModal(false)
  }

  const toggleStatus = (tarefa: Tarefa) => {
    onUpdateTarefa({ ...tarefa, status: tarefa.status === 'pendente' ? 'concluida' : 'pendente' })
  }

  const getTipoIcon = (tipo: Tarefa['tipo']) => {
    switch (tipo) {
      case 'ligacao': return '📞'
      case 'reuniao': return '🤝'
      case 'email': return '📧'
      case 'whatsapp': return '💬'
      case 'follow-up': return '🔄'
      default: return '📋'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Tarefas e Agenda</h1>
          <p className="mt-1 text-sm text-gray-600">Organize suas atividades e nunca perca um follow-up</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              const sugeridas: Tarefa[] = [
                { id: Date.now() + 1, clienteId: clientes.find(c => c.diasInativo && c.diasInativo > 7)?.id, titulo: 'Follow-up com leads inativos', descricao: 'Entrar em contato com clientes sem interação há mais de 7 dias', data: hoje, hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta' },
                { id: Date.now() + 2, clienteId: clientes.find(c => c.etapa === 'negociacao')?.id, titulo: 'Enviar proposta comercial', descricao: 'Preparar e enviar proposta para leads em negociação', data: hoje, hora: '14:00', tipo: 'email', status: 'pendente', prioridade: 'alta' },
                { id: Date.now() + 3, titulo: 'Revisar pipeline de vendas', descricao: 'Analisar funil e identificar gargalos', data: amanha, hora: '09:00', tipo: 'outro', status: 'pendente', prioridade: 'media' },
                { id: Date.now() + 4, clienteId: clientes.find(c => c.etapa === 'amostra')?.id, titulo: 'Agendar reunião de apresentação', descricao: 'Marcar reunião para apresentar produtos', data: amanha, hora: '15:00', tipo: 'reuniao', status: 'pendente', prioridade: 'media' },
                { id: Date.now() + 5, titulo: 'Atualizar CRM e registros', descricao: 'Revisar e atualizar informações de clientes', data: amanha, tipo: 'outro', status: 'pendente', prioridade: 'baixa' }
              ]
              sugeridas.forEach(t => onAddTarefa(t))
              alert(`✨ IA adicionou ${sugeridas.length} tarefas sugeridas!`)
            }}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-apple hover:from-purple-700 hover:to-blue-700 shadow-apple-sm flex items-center"
          >
            <SparklesIcon className="h-4 w-4 mr-2" />
            IA Sugerir Tarefas
          </button>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center">
            <PlusIcon className="h-4 w-4 mr-2" />
            Nova Tarefa
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="todas">Todas</option>
          <option value="pendente">Pendentes</option>
          <option value="concluida">Concluídas</option>
        </select>
      </div>

      <div className="space-y-6">
        {datasOrdenadas.length === 0 && (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhuma tarefa encontrada</p>
          </div>
        )}
        {datasOrdenadas.map(data => {
          const tarefasDia = tarefasPorData[data].sort((a, b) => {
            if (a.hora && b.hora) return a.hora.localeCompare(b.hora)
            if (a.hora) return -1
            if (b.hora) return 1
            return 0
          })
          const isHoje = data === hoje
          return (
            <div key={data} className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
              <div className={`px-6 py-4 border-b border-gray-200 ${isHoje ? 'bg-primary-50' : ''}`}>
                <h3 className={`text-lg font-semibold ${isHoje ? 'text-primary-700' : 'text-gray-900'}`}>
                  {isHoje ? '🔥 Hoje' : new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{tarefasDia.length} tarefa(s)</p>
              </div>
              <div className="p-6 space-y-3">
                {tarefasDia.map(tarefa => {
                  const cliente = clientes.find(c => c.id === tarefa.clienteId)
                  return (
                    <div key={tarefa.id} className={`p-4 rounded-apple border-2 transition-all ${tarefa.status === 'concluida' ? 'bg-gray-50 border-gray-200 opacity-60' : tarefa.prioridade === 'alta' ? 'bg-red-50 border-red-200' : tarefa.prioridade === 'media' ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-start gap-4">
                        <button onClick={() => toggleStatus(tarefa)} className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${tarefa.status === 'concluida' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-primary-500'}`}>
                          {tarefa.status === 'concluida' && <span className="text-white text-xs">✓</span>}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getTipoIcon(tarefa.tipo)}</span>
                                <h4 className={`font-semibold text-gray-900 ${tarefa.status === 'concluida' ? 'line-through' : ''}`}>{tarefa.titulo}</h4>
                              </div>
                              {tarefa.descricao && <p className="text-sm text-gray-600 mt-1">{tarefa.descricao}</p>}
                              {cliente && <p className="text-xs text-gray-500 mt-2">👤 {cliente.razaoSocial}</p>}
                            </div>
                            <div className="text-right">
                              {tarefa.hora && <p className="text-sm font-semibold text-gray-900">🕐 {tarefa.hora}</p>}
                              <span className={`inline-block mt-1 px-2 py-1 text-xs font-semibold rounded-full ${tarefa.prioridade === 'alta' ? 'bg-red-100 text-red-700' : tarefa.prioridade === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{tarefa.prioridade}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-2xl w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Nova Tarefa</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input value={newTitulo} onChange={(e) => setNewTitulo(e.target.value)} placeholder="Ex: Ligar para SuperBH" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea value={newDescricao} onChange={(e) => setNewDescricao(e.target.value)} rows={2} placeholder="Detalhes..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input type="date" value={newData} onChange={(e) => setNewData(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input type="time" value={newHora} onChange={(e) => setNewHora(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={newTipo} onChange={(e) => setNewTipo(e.target.value as Tarefa['tipo'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="ligacao">📞 Ligação</option>
                    <option value="reuniao">🤝 Reunião</option>
                    <option value="email">📧 Email</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="follow-up">🔄 Follow-up</option>
                    <option value="outro">📋 Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                  <select value={newPrioridade} onChange={(e) => setNewPrioridade(e.target.value as Tarefa['prioridade'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (opcional)</label>
                <select value={newClienteId} onChange={(e) => setNewClienteId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Sem cliente</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAddTarefa} disabled={!newTitulo.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">Criar Tarefa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SocialSearchView: React.FC = () => {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchType, setSearchType] = React.useState<'instagram' | 'linkedin' | 'google' | 'facebook' | 'painel'>('painel')
  const [location, setLocation] = React.useState('Belo Horizonte - MG')
  const [isSearching, setIsSearching] = React.useState(false)
  const [results, setResults] = React.useState<Array<{ id: number; nome: string; descricao: string; endereco: string; telefone: string; site?: string; instagram?: string; linkedin?: string; facebook?: string; fonte?: string }>>([])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    await new Promise(r => setTimeout(r, 1500))
    let mockResults: typeof results = []
    if (searchType === 'painel' || searchType === 'google') {
      mockResults = [
        { id: 1, nome: 'SuperMercado Central BH', descricao: 'Supermercado de médio porte no centro de BH. 3 lojas.', endereco: 'Av. Afonso Pena, 1500 - Centro, BH - MG', telefone: '(31) 3333-4444', site: 'www.supercentralbh.com.br', instagram: '@supercentralbh', facebook: 'SuperCentralBH', fonte: searchType === 'painel' ? 'Google + Redes Sociais' : 'Google' },
        { id: 2, nome: 'Mercado Família BH', descricao: 'Rede familiar com 5 unidades em BH.', endereco: 'Rua da Bahia, 890 - Centro, BH - MG', telefone: '(31) 3222-5555', instagram: '@mercadofamiliabh', facebook: 'MercadoFamiliaBH', fonte: searchType === 'painel' ? 'Google + Redes Sociais' : 'Google' },
        { id: 3, nome: 'SuperCompras Pampulha', descricao: 'Supermercado premium na Pampulha.', endereco: 'Av. Portugal, 3200 - Pampulha, BH - MG', telefone: '(31) 3444-6666', site: 'www.supercompraspampulha.com.br', linkedin: 'SuperCompras Pampulha', fonte: searchType === 'painel' ? 'Google + Redes Sociais' : 'Google' }
      ]
    } else if (searchType === 'instagram') {
      mockResults = [
        { id: 1, nome: 'Empório Gourmet BH', descricao: 'Produtos premium. 12k seguidores.', endereco: 'Rua Pernambuco, 550 - Savassi, BH - MG', telefone: '(31) 99888-7777', instagram: '@emporiogourmetbh', fonte: 'Instagram' },
        { id: 2, nome: 'Açougue Premium BH', descricao: 'Carnes nobres. 8k seguidores.', endereco: 'Av. Raja Gabaglia, 2000 - Luxemburgo, BH - MG', telefone: '(31) 99777-6666', instagram: '@acouguepremiumbh', fonte: 'Instagram' }
      ]
    } else if (searchType === 'facebook') {
      mockResults = [
        { id: 1, nome: 'Distribuidora Alimentos BH', descricao: 'Atacadista. 5.000 curtidas.', endereco: 'Av. Cristiano Machado, 1500 - Cidade Nova, BH - MG', telefone: '(31) 3555-4444', facebook: 'DistribuidoraAlimentosBH', fonte: 'Facebook' },
        { id: 2, nome: 'Padaria Pão Quente BH', descricao: 'Rede de padarias. 3 unidades.', endereco: 'Rua Curitiba, 800 - Centro, BH - MG', telefone: '(31) 3222-3333', facebook: 'PadariasPaoQuente', fonte: 'Facebook' }
      ]
    } else if (searchType === 'linkedin') {
      mockResults = [
        { id: 1, nome: 'Rede Supermercados Mineiros S.A.', descricao: 'Rede com 15 lojas em MG. 500+ funcionários.', endereco: 'Av. do Contorno, 5000 - Funcionários, BH - MG', telefone: '(31) 3000-9000', linkedin: 'Rede Supermercados Mineiros', site: 'www.redesupermineiros.com.br', fonte: 'LinkedIn' }
      ]
    }
    setResults(mockResults)
    setIsSearching(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Busca por Redes Sociais</h1>
        <p className="mt-1 text-sm text-gray-600">Encontre potenciais clientes através de buscas em redes sociais e Google (MVP - mock)</p>
      </div>
      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">O que você procura?</label>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Ex: supermercados, restaurantes, hotéis..." className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Região</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Cidade - UF" className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fonte de busca</label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { id: 'painel', label: '🎯 Painel', desc: 'Busca completa' },
                { id: 'google', label: '🔍 Google', desc: 'Busca geral' },
                { id: 'instagram', label: '📸 Instagram', desc: 'Perfis comerciais' },
                { id: 'facebook', label: '👥 Facebook', desc: 'Páginas e grupos' },
                { id: 'linkedin', label: '💼 LinkedIn', desc: 'Empresas B2B' }
              ].map((source) => (
                <button key={source.id} onClick={() => setSearchType(source.id as any)} className={`p-3 rounded-apple border-2 transition-all ${searchType === source.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="text-center">
                    <div className="text-base font-semibold text-gray-900">{source.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{source.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleSearch} disabled={!searchQuery.trim() || isSearching} className="w-full px-6 py-3 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm font-semibold">
            {isSearching ? '🔍 Buscando...' : '🔍 Buscar Potenciais Clientes'}
          </button>
        </div>
      </div>
      {results.length > 0 && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Resultados ({results.length})</h3>
          </div>
          <div className="p-6 space-y-4">
            {results.map((result) => (
              <div key={result.id} className="p-4 border-2 border-gray-200 rounded-apple hover:border-primary-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-gray-900">{result.nome}</h4>
                    <p className="text-sm text-gray-600 mt-1">{result.descricao}</p>
                    <div className="mt-3 space-y-1">
                      <p className="text-sm text-gray-700">📍 {result.endereco}</p>
                      <p className="text-sm text-gray-700">📞 {result.telefone}</p>
                      {result.site && <p className="text-sm text-primary-600">🌐 {result.site}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {result.fonte && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-semibold">🎯 {result.fonte}</span>}
                        {result.instagram && <span className="text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded-full">📸 {result.instagram}</span>}
                        {result.facebook && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">👥 {result.facebook}</span>}
                        {result.linkedin && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">💼 {result.linkedin}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => alert(`Importar: ${result.nome}\n${result.telefone}\n${result.endereco}`)} className="ml-4 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm whitespace-nowrap">➕ Adicionar Lead</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!isSearching && results.length === 0 && (
        <div className="bg-gray-50 rounded-apple border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-600">Digite sua busca e clique em "Buscar" para encontrar potenciais clientes</p>
          <p className="text-sm text-gray-500 mt-2">MVP: Demonstração com dados mockados</p>
        </div>
      )}
    </div>
  )
}

const IntegracoesView: React.FC = () => {
  const [integracoes, setIntegracoes] = React.useState([
    { id: 1, nome: 'WhatsApp Business', tipo: 'whatsapp', status: 'conectado', icon: '💬' },
    { id: 2, nome: 'Gmail', tipo: 'email', status: 'conectado', icon: '📧' },
    { id: 3, nome: 'LinkedIn', tipo: 'linkedin', status: 'desconectado', icon: '💼' },
    { id: 4, nome: 'Instagram Business', tipo: 'instagram', status: 'desconectado', icon: '📸' },
    { id: 5, nome: 'Facebook Pages', tipo: 'facebook', status: 'desconectado', icon: '👥' },
    { id: 6, nome: 'Google Sheets', tipo: 'sheets', status: 'conectado', icon: '📊' },
    { id: 7, nome: 'Zapier', tipo: 'zapier', status: 'desconectado', icon: '⚡' },
    { id: 8, nome: 'Webhook Personalizado', tipo: 'webhook', status: 'desconectado', icon: '🔗' }
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Integrações</h1>
        <p className="mt-1 text-sm text-gray-600">Conecte o CRM com suas ferramentas favoritas</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integracoes.map((int) => (
          <div key={int.id} className="bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-6 hover:border-primary-300 transition-all">
            <div className="flex items-center gap-3">
              <div className="text-4xl">{int.icon}</div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{int.nome}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${int.status === 'conectado' ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                  <span className="text-xs text-gray-600">{int.status === 'conectado' ? 'Conectado' : 'Desconectado'}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              {int.tipo === 'whatsapp' && 'Envie mensagens automáticas via WhatsApp Business API'}
              {int.tipo === 'email' && 'Sincronize emails e envie campanhas automatizadas'}
              {int.tipo === 'linkedin' && 'Conecte com leads e envie mensagens pelo LinkedIn'}
              {int.tipo === 'instagram' && 'Gerencie DMs e interações do Instagram Business'}
              {int.tipo === 'facebook' && 'Integre com Facebook Pages e Messenger'}
              {int.tipo === 'sheets' && 'Exporte e importe dados via Google Sheets'}
              {int.tipo === 'zapier' && 'Conecte com 5000+ apps via Zapier'}
              {int.tipo === 'webhook' && 'Configure webhooks personalizados'}
            </p>
            <button
              onClick={() => {
                const novoStatus = int.status === 'conectado' ? 'desconectado' : 'conectado'
                setIntegracoes(prev => prev.map(i => i.id === int.id ? {...i, status: novoStatus} : i))
                alert(`${int.nome} ${novoStatus === 'conectado' ? 'conectado' : 'desconectado'} com sucesso!`)
              }}
              className={`mt-4 w-full px-4 py-2 rounded-apple shadow-apple-sm font-semibold transition-colors ${int.status === 'conectado' ? 'bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
            >
              {int.status === 'conectado' ? 'Desconectar' : 'Conectar'}
            </button>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 rounded-apple border-2 border-blue-200 p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">💡</div>
          <div>
            <h3 className="text-lg font-semibold text-blue-900">Dica: Automatize seu fluxo</h3>
            <p className="text-sm text-blue-700 mt-2">Conecte WhatsApp + Gmail + Google Sheets para criar um fluxo completo.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const VendedoresView: React.FC<{
  vendedores: Vendedor[]
  clientes: Cliente[]
  onAddVendedor: (v: Vendedor) => void
  onUpdateVendedor: (v: Vendedor) => void
}> = ({ vendedores, clientes, onAddVendedor, onUpdateVendedor }) => {
  const [selectedVendedorId, setSelectedVendedorId] = React.useState<number | null>(null)
  const [showModal, setShowModal] = React.useState(false)
  const [newNome, setNewNome] = React.useState('')
  const [newEmail, setNewEmail] = React.useState('')
  const [newTelefone, setNewTelefone] = React.useState('')
  const [newCargo, setNewCargo] = React.useState<Vendedor['cargo']>('vendedor')
  const [newMetaVendas, setNewMetaVendas] = React.useState('150000')
  const [newMetaLeads, setNewMetaLeads] = React.useState('10')
  const [newMetaConversao, setNewMetaConversao] = React.useState('15')
  const [newUsuario, setNewUsuario] = React.useState('')
  const [newSenha, setNewSenha] = React.useState('')

  const [editingMetas, setEditingMetas] = React.useState(false)
  const [editMetaVendas, setEditMetaVendas] = React.useState('')
  const [editMetaLeads, setEditMetaLeads] = React.useState('')
  const [editMetaConversao, setEditMetaConversao] = React.useState('')
  const [editingCredentials, setEditingCredentials] = React.useState(false)
  const [editUsuario, setEditUsuario] = React.useState('')
  const [editSenha, setEditSenha] = React.useState('')

  const selectedVendedor = vendedores.find(v => v.id === selectedVendedorId) ?? null

  const getVendedorMetrics = (vendedor: Vendedor) => {
    const clientesVendedor = clientes.filter(c => c.vendedorId === vendedor.id)
    const totalLeads = clientesVendedor.length
    const valorPipeline = clientesVendedor.reduce((sum, c) => sum + (c.valorEstimado || 0), 0)
    const conversoes = clientesVendedor.filter(c => c.etapa === 'pos_venda').length
    const taxaConversao = totalLeads > 0 ? (conversoes / totalLeads) * 100 : 0
    return { totalLeads, valorPipeline, conversoes, taxaConversao, clientesVendedor }
  }

  const ranking = [...vendedores]
    .filter(v => v.ativo)
    .map(v => ({ ...v, metrics: getVendedorMetrics(v) }))
    .sort((a, b) => b.metrics.valorPipeline - a.metrics.valorPipeline)

  const getCargoLabel = (cargo: Vendedor['cargo']) => {
    switch (cargo) {
      case 'gerente': return 'Gerente'
      case 'sdr': return 'SDR'
      default: return 'Vendedor'
    }
  }

  const getCargoBadge = (cargo: Vendedor['cargo']) => {
    switch (cargo) {
      case 'gerente': return 'bg-purple-100 text-purple-800'
      case 'sdr': return 'bg-blue-100 text-blue-800'
      default: return 'bg-green-100 text-green-800'
    }
  }

  const getBarColor = (pct: number) => {
    if (pct >= 100) return 'bg-green-500'
    if (pct >= 75) return 'bg-blue-500'
    if (pct >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const handleAddVendedor = () => {
    if (!newNome.trim() || !newEmail.trim() || !newUsuario.trim() || !newSenha.trim()) return
    const initials = newNome.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    onAddVendedor({
      id: Date.now(),
      nome: newNome.trim(),
      email: newEmail.trim(),
      telefone: newTelefone.trim(),
      cargo: newCargo,
      avatar: initials,
      usuario: newUsuario.trim(),
      senha: newSenha.trim(),
      metaVendas: Number(newMetaVendas) || 150000,
      metaLeads: Number(newMetaLeads) || 10,
      metaConversao: Number(newMetaConversao) || 15,
      ativo: true
    })
    setNewNome(''); setNewEmail(''); setNewTelefone(''); setNewUsuario(''); setNewSenha(''); setShowModal(false)
  }

  const handleSaveCredentials = () => {
    if (!selectedVendedor || !editUsuario.trim() || !editSenha.trim()) return
    onUpdateVendedor({
      ...selectedVendedor,
      usuario: editUsuario.trim(),
      senha: editSenha.trim()
    })
    setEditingCredentials(false)
  }

  const handleSaveMetas = () => {
    if (!selectedVendedor) return
    onUpdateVendedor({
      ...selectedVendedor,
      metaVendas: Number(editMetaVendas) || selectedVendedor.metaVendas,
      metaLeads: Number(editMetaLeads) || selectedVendedor.metaLeads,
      metaConversao: Number(editMetaConversao) || selectedVendedor.metaConversao
    })
    setEditingMetas(false)
  }

  if (selectedVendedor) {
    const m = getVendedorMetrics(selectedVendedor)
    const pctVendas = Math.min((m.valorPipeline / selectedVendedor.metaVendas) * 100, 100)
    const pctLeads = Math.min((m.totalLeads / selectedVendedor.metaLeads) * 100, 100)
    const pctConversao = Math.min((m.taxaConversao / selectedVendedor.metaConversao) * 100, 100)

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedVendedorId(null)} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm font-medium text-gray-700">← Voltar</button>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Perfil do Vendedor</h1>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl sm:text-2xl font-bold text-primary-700">{selectedVendedor.avatar}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">{selectedVendedor.nome}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getCargoBadge(selectedVendedor.cargo)}`}>{getCargoLabel(selectedVendedor.cargo)}</span>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${selectedVendedor.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{selectedVendedor.ativo ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-1 sm:gap-6 mt-3 text-sm text-gray-600">
                <span className="truncate">📧 {selectedVendedor.email}</span>
                <span>📞 {selectedVendedor.telefone}</span>
              </div>
            </div>
            <button
              onClick={() => {
                onUpdateVendedor({ ...selectedVendedor, ativo: !selectedVendedor.ativo })
              }}
              className={`px-4 py-2 rounded-apple text-sm font-semibold self-start ${selectedVendedor.ativo ? 'bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100' : 'bg-green-600 text-white hover:bg-green-700'}`}
            >
              {selectedVendedor.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">🔐 Credenciais de Acesso</h3>
            {!editingCredentials ? (
              <button onClick={() => { setEditingCredentials(true); setEditUsuario(selectedVendedor.usuario); setEditSenha(selectedVendedor.senha) }} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-apple hover:bg-gray-50 font-medium">✏️ Editar</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingCredentials(false)} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
                <button onClick={handleSaveCredentials} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700">Salvar</button>
              </div>
            )}
          </div>
          {editingCredentials ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
                <input type="text" value={editUsuario} onChange={(e) => setEditUsuario(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input type="text" value={editSenha} onChange={(e) => setEditSenha(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 rounded-apple border border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-500">Usuário</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{selectedVendedor.usuario}</p>
              </div>
              <div className="p-3 rounded-apple border border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-500">Senha</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{'•'.repeat(selectedVendedor.senha.length)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-600">Clientes</p>
            <p className="text-2xl font-bold text-gray-900">{m.totalLeads}</p>
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-600">Pipeline</p>
            <p className="text-2xl font-bold text-gray-900">R$ {m.valorPipeline.toLocaleString('pt-BR')}</p>
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-600">Conversões</p>
            <p className="text-2xl font-bold text-green-600">{m.conversoes}</p>
          </div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-600">Taxa Conversão</p>
            <p className="text-2xl font-bold text-purple-600">{m.taxaConversao.toFixed(1)}%</p>
          </div>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">🎯 Metas Individuais</h3>
            {!editingMetas ? (
              <button onClick={() => { setEditingMetas(true); setEditMetaVendas(String(selectedVendedor.metaVendas)); setEditMetaLeads(String(selectedVendedor.metaLeads)); setEditMetaConversao(String(selectedVendedor.metaConversao)) }} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-apple hover:bg-gray-50 font-medium">✏️ Editar Metas</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingMetas(false)} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
                <button onClick={handleSaveMetas} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700">Salvar</button>
              </div>
            )}
          </div>

          {editingMetas ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta Vendas (R$)</label>
                <input type="number" value={editMetaVendas} onChange={(e) => setEditMetaVendas(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta Leads</label>
                <input type="number" value={editMetaLeads} onChange={(e) => setEditMetaLeads(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta Conversão (%)</label>
                <input type="number" value={editMetaConversao} onChange={(e) => setEditMetaConversao(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">💰 Vendas</p>
                  <p className="text-sm font-bold text-gray-900">R$ {m.valorPipeline.toLocaleString('pt-BR')} / {selectedVendedor.metaVendas.toLocaleString('pt-BR')}</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full transition-all duration-500 ${getBarColor(pctVendas)}`} style={{ width: `${pctVendas}%` }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{pctVendas.toFixed(0)}% da meta</p>
              </div>
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">📋 Leads</p>
                  <p className="text-sm font-bold text-gray-900">{m.totalLeads} / {selectedVendedor.metaLeads}</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full transition-all duration-500 ${getBarColor(pctLeads)}`} style={{ width: `${pctLeads}%` }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{pctLeads.toFixed(0)}% da meta</p>
              </div>
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-600">🔄 Conversão</p>
                  <p className="text-sm font-bold text-gray-900">{m.taxaConversao.toFixed(1)}% / {selectedVendedor.metaConversao}%</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full transition-all duration-500 ${getBarColor(pctConversao)}`} style={{ width: `${pctConversao}%` }}></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{pctConversao.toFixed(0)}% da meta</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Clientes Atribuídos ({m.clientesVendedor.length})</h3>
          </div>
          <div className="p-6">
            {m.clientesVendedor.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum cliente atribuído a este vendedor.</p>
            ) : (
              <div className="space-y-2">
                {m.clientesVendedor.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-apple border border-gray-200">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{c.razaoSocial}</p>
                      <p className="text-xs text-gray-500">{c.contatoNome} • {c.etapa}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">R$ {(c.valorEstimado || 0).toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-gray-500">Score: {c.score || 0}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Equipe de Vendas</h1>
          <p className="mt-1 text-sm text-gray-600">Gerencie sua equipe, acompanhe metas e performance individual</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2.5 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center self-start">
          <PlusIcon className="h-4 w-4 mr-2" />
          Novo Vendedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {vendedores.map(v => {
          const m = getVendedorMetrics(v)
          const pctVendas = Math.min((m.valorPipeline / v.metaVendas) * 100, 100)
          return (
            <div key={v.id} onClick={() => setSelectedVendedorId(v.id)} className="bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-6 hover:border-primary-300 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${v.ativo ? 'bg-primary-100' : 'bg-gray-200'}`}>
                  <span className={`text-sm font-bold ${v.ativo ? 'text-primary-700' : 'text-gray-500'}`}>{v.avatar}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{v.nome}</h3>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getCargoBadge(v.cargo)}`}>{getCargoLabel(v.cargo)}</span>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Clientes</span>
                  <span className="font-semibold text-gray-900">{m.totalLeads}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pipeline</span>
                  <span className="font-semibold text-gray-900">R$ {m.valorPipeline.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Meta vendas</span>
                    <span className="font-semibold text-gray-700">{pctVendas.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className={`h-2 rounded-full ${getBarColor(pctVendas)}`} style={{ width: `${pctVendas}%` }}></div>
                  </div>
                </div>
              </div>
              {!v.ativo && <p className="text-xs text-red-500 mt-2 font-semibold">Inativo</p>}
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">🏆 Ranking da Equipe</h3>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {ranking.map((v, index) => {
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}º`
              return (
                <div key={v.id} className={`flex items-center gap-4 p-4 rounded-apple border-2 transition-all ${index === 0 ? 'bg-yellow-50 border-yellow-200' : index === 1 ? 'bg-gray-50 border-gray-300' : index === 2 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
                  <div className="text-2xl w-10 text-center font-bold">{medal}</div>
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-primary-700">{v.avatar}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{v.nome}</p>
                    <p className="text-xs text-gray-500">{getCargoLabel(v.cargo)} • {v.metrics.totalLeads} clientes</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">R$ {v.metrics.valorPipeline.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-gray-500">Conversão: {v.metrics.taxaConversao.toFixed(1)}%</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Novo Vendedor</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Nome completo" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@empresa.com" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={newTelefone} onChange={(e) => setNewTelefone(e.target.value)} placeholder="(00) 00000-0000" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                <select value={newCargo} onChange={(e) => setNewCargo(e.target.value as Vendedor['cargo'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="vendedor">Vendedor</option>
                  <option value="sdr">SDR</option>
                  <option value="gerente">Gerente</option>
                </select>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">🔐 Credenciais de Acesso</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Usuário *</label>
                    <input value={newUsuario} onChange={(e) => setNewUsuario(e.target.value)} placeholder="nome.usuario" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Senha *</label>
                    <input value={newSenha} onChange={(e) => setNewSenha(e.target.value)} placeholder="Senha de acesso" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Metas Mensais</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Vendas (R$)</label>
                    <input type="number" value={newMetaVendas} onChange={(e) => setNewMetaVendas(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Leads</label>
                    <input type="number" value={newMetaLeads} onChange={(e) => setNewMetaLeads(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Conversão (%)</label>
                    <input type="number" value={newMetaConversao} onChange={(e) => setNewMetaConversao(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAddVendedor} disabled={!newNome.trim() || !newEmail.trim() || !newUsuario.trim() || !newSenha.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">Cadastrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const MapaView: React.FC<{ clientes: Cliente[] }> = ({ clientes }) => {
  const [selectedClienteId, setSelectedClienteId] = React.useState<number>(clientes[0]?.id ?? 0)
  const selectedCliente = clientes.find((c) => c.id === selectedClienteId) ?? null
  const [address, setAddress] = React.useState<string>(selectedCliente?.endereco || '')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string>('')
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null)

  React.useEffect(() => {
    const nextAddress = selectedCliente?.endereco || ''
    setAddress(nextAddress)
    setCoords(null)
    setError('')
  }, [selectedClienteId])

  const geocode = async () => {
    setError('')
    if (!address.trim()) {
      setError('Informe um endereço para localizar no mapa.')
      return
    }

    setIsLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      })
      const data: Array<{ lat: string; lon: string }> = await res.json()
      if (!data || data.length === 0) {
        setError('Endereço não encontrado. Tente adicionar cidade/UF.')
        setCoords(null)
        return
      }
      setCoords({ lat: Number(data[0].lat), lon: Number(data[0].lon) })
    } catch {
      setError('Falha ao consultar o mapa. Verifique sua internet e tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const iframeSrc = coords
    ? `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${coords.lat}%2C${coords.lon}&zoom=15`
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Mapa de Leads</h1>
        <p className="mt-1 text-sm text-gray-600">Localize leads pelo endereço e visualize no mapa.</p>
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Lead / Empresa</label>
            <select
              value={selectedClienteId}
              onChange={(e) => setSelectedClienteId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial}
                </option>
              ))}
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">Endereço</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Rua, número, bairro, cidade - UF"
            />

            <button
              onClick={geocode}
              disabled={isLoading}
              className="mt-3 w-full px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 transition-colors duration-200 shadow-apple-sm"
            >
              {isLoading ? 'Buscando...' : 'Buscar no mapa'}
            </button>

            {error && (
              <div className="mt-3 text-sm text-red-600">{error}</div>
            )}

            {coords && (
              <div className="mt-4 rounded-apple border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs text-gray-700">Lat: {coords.lat.toFixed(6)}</div>
                <div className="text-xs text-gray-700">Lon: {coords.lon.toFixed(6)}</div>
                <a
                  className="text-xs text-primary-700 hover:text-primary-900 underline mt-2 inline-block"
                  href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=16/${coords.lat}/${coords.lon}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir no OpenStreetMap
                </a>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-apple border border-gray-200 overflow-hidden bg-gray-50" style={{ height: 520 }}>
              {iframeSrc ? (
                <iframe
                  title="mapa"
                  src={iframeSrc}
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                  Informe um endereço e clique em “Buscar no mapa”.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Relatórios View
const RelatoriosView: React.FC<{ clientes: Cliente[], vendedores: Vendedor[], interacoes: Interacao[], produtos?: Produto[] }> = ({ clientes, vendedores, interacoes, produtos = [] }) => {
  const stages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda', 'perdido']
  const stageLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
  const COLORS = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899', '#EF4444']

  const pipelineData = stages.map(s => ({
    name: stageLabels[s] || s,
    valor: clientes.filter(c => c.etapa === s).reduce((sum, c) => sum + (c.valorEstimado || 0), 0),
    qtd: clientes.filter(c => c.etapa === s).length
  }))

  const pieData = stages.map(s => ({
    name: stageLabels[s] || s,
    value: clientes.filter(c => c.etapa === s).length
  })).filter(d => d.value > 0)

  const vendedorData = vendedores.filter(v => v.ativo).map(v => {
    const cv = clientes.filter(c => c.vendedorId === v.id)
    return {
      name: v.nome.split(' ')[0],
      pipeline: cv.reduce((s, c) => s + (c.valorEstimado || 0), 0),
      leads: cv.length,
      conversoes: cv.filter(c => c.etapa === 'pos_venda').length
    }
  })

  const interacaoData = ['email', 'whatsapp', 'linkedin', 'instagram', 'ligacao', 'reuniao'].map(tipo => ({
    name: tipo.charAt(0).toUpperCase() + tipo.slice(1),
    qtd: interacoes.filter(i => i.tipo === tipo).length
  })).filter(d => d.qtd > 0)

  const gerarRelatorioPDF = () => {
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const totalLeads = clientes.length
    const leadsAtivos = clientes.filter(c => c.etapa !== 'perdido').length
    const perdidos = clientes.filter(c => c.etapa === 'perdido')
    const posVenda = clientes.filter(c => c.etapa === 'pos_venda')
    const totalPipeline = clientes.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const valorPerdido = perdidos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const valorGanho = posVenda.reduce((s, c) => s + (c.valorEstimado || 0), 0)
    const taxaConversao = totalLeads > 0 ? ((posVenda.length / totalLeads) * 100).toFixed(1) : '0'
    const taxaPerda = totalLeads > 0 ? ((perdidos.length / totalLeads) * 100).toFixed(1) : '0'
    const ticketMedio = leadsAtivos > 0 ? Math.round(totalPipeline / leadsAtivos) : 0

    const stLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
    const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }

    const pipelineRows = stages.map(s => {
      const cls = clientes.filter(c => c.etapa === s)
      return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${cls.length}</td><td style="text-align:right">R$ ${cls.reduce((sum, c) => sum + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</td></tr>`
    }).join('')

    const vendRows = vendedores.filter(v => v.ativo).map(v => {
      const cv = clientes.filter(c => c.vendedorId === v.id)
      const cvAtivos = cv.filter(c => c.etapa !== 'perdido')
      const cvPerdidos = cv.filter(c => c.etapa === 'perdido')
      const cvGanhos = cv.filter(c => c.etapa === 'pos_venda')
      return `<tr><td>${v.nome}</td><td style="text-align:center">${cv.length}</td><td style="text-align:center">${cvGanhos.length}</td><td style="text-align:center">${cvPerdidos.length}</td><td style="text-align:right">R$ ${cvAtivos.reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</td></tr>`
    }).join('')

    const catCount = perdidos.reduce((acc, c) => { const k = c.categoriaPerda || 'outro'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)
    const perdaRows = Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${catLabels[k] || k}</td><td style="text-align:center">${v}</td><td style="text-align:right">${totalLeads > 0 ? ((v / totalLeads) * 100).toFixed(1) : 0}%</td></tr>`).join('')

    // Conversion funnel
    const funilStages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
    const passaramPor: Record<string, number> = {}
    funilStages.forEach(s => { passaramPor[s] = 0 })
    clientes.forEach(c => {
      const etapas = new Set<string>(); etapas.add(c.etapa)
      ;(c.historicoEtapas || []).forEach(h => { etapas.add(h.etapa); if (h.de) etapas.add(h.de) })
      funilStages.forEach(s => { if (etapas.has(s)) passaramPor[s]++ })
    })
    const convRows = funilStages.map((s, i) => {
      const qtd = passaramPor[s]
      const ant = i > 0 ? passaramPor[funilStages[i - 1]] : qtd
      const taxa = ant > 0 ? ((qtd / ant) * 100).toFixed(0) : '—'
      return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${qtd}</td><td style="text-align:center">${i > 0 ? taxa + '%' : '—'}</td></tr>`
    }).join('')

    // Top clients
    const topClientes = [...clientes].filter(c => c.etapa !== 'perdido').sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0)).slice(0, 10)
    const topRows = topClientes.map(c => {
      const vend = vendedores.find(v => v.id === c.vendedorId)
      return `<tr><td>${c.razaoSocial}</td><td>${stLabels[c.etapa] || c.etapa}</td><td style="text-align:center">${c.score || 0}</td><td style="text-align:right">R$ ${(c.valorEstimado || 0).toLocaleString('pt-BR')}</td><td>${vend?.nome || '—'}</td></tr>`
    }).join('')

    // AI insights
    const etapaMaisPerdas = Object.entries(perdidos.reduce((acc, c) => { const k = c.etapaAnterior || 'desconhecido'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
    const motivoTop = Object.entries(catCount).sort((a, b) => b[1] - a[1])

    const probEtapa: Record<string, number> = { 'prospecção': 0.10, 'amostra': 0.25, 'homologado': 0.50, 'negociacao': 0.75, 'pos_venda': 0.95 }
    const receitaProjetada = clientes.filter(c => c.etapa !== 'perdido').reduce((s, c) => s + (c.valorEstimado || 0) * (probEtapa[c.etapa] || 0), 0)

    const clientesRisco = clientes.filter(c => {
      if (!c.dataEntradaEtapa) return false
      const dias = Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000)
      return (c.etapa === 'amostra' && dias >= 20) || (c.etapa === 'homologado' && dias >= 55)
    })

    const insights = [
      `O pipeline atual totaliza <strong>R$ ${totalPipeline.toLocaleString('pt-BR')}</strong> distribuídos em <strong>${leadsAtivos}</strong> leads ativos.`,
      `A taxa de conversão global é de <strong>${taxaConversao}%</strong> (${posVenda.length} de ${totalLeads} leads chegaram a Pós-Venda).`,
      `Receita projetada (ponderada por probabilidade): <strong>R$ ${receitaProjetada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>.`,
      motivoTop.length > 0 ? `O principal motivo de perda é <strong>"${catLabels[motivoTop[0][0]] || motivoTop[0][0]}"</strong> com ${motivoTop[0][1]} ocorrência(s). Recomenda-se investigar este padrão com a equipe.` : '',
      etapaMaisPerdas.length > 0 ? `A etapa com mais perdas é <strong>"${stLabels[etapaMaisPerdas[0][0]] || etapaMaisPerdas[0][0]}"</strong> (${etapaMaisPerdas[0][1]} clientes). Foco em melhorar acompanhamento nessa fase.` : '',
      clientesRisco.length > 0 ? `⚠️ <strong>${clientesRisco.length}</strong> cliente(s) em risco de perda por prazo: ${clientesRisco.map(c => c.razaoSocial).join(', ')}.` : 'Nenhum cliente em risco iminente de prazo.',
      `Ticket médio: <strong>R$ ${ticketMedio.toLocaleString('pt-BR')}</strong>. ${ticketMedio > 80000 ? 'Acima da meta — bom indicador.' : 'Abaixo da meta de R$ 80.000 — considere focar em clientes de maior valor.'}`,
    ].filter(Boolean)

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Comercial MF Paris</title>
<style>
  @page { margin: 20mm; size: A4; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 22pt; color: #1e40af; margin-bottom: 4px; border-bottom: 3px solid #3b82f6; padding-bottom: 8px; }
  h2 { font-size: 14pt; color: #1e3a5f; margin-top: 28px; margin-bottom: 8px; border-left: 4px solid #3b82f6; padding-left: 10px; }
  .subtitle { font-size: 10pt; color: #666; margin-bottom: 20px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
  .kpi .label { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi .value { font-size: 16pt; font-weight: 700; color: #1e293b; margin-top: 4px; }
  .kpi .value.green { color: #16a34a; }
  .kpi .value.red { color: #dc2626; }
  .kpi .value.blue { color: #2563eb; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 20px 0; font-size: 10pt; }
  th { background: #f1f5f9; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  .insights { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .insights h2 { color: #1e40af; border-left-color: #3b82f6; margin-top: 0; }
  .insights ul { margin: 8px 0; padding-left: 20px; }
  .insights li { margin-bottom: 6px; font-size: 10.5pt; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #94a3b8; text-align: center; }
  .page-break { page-break-before: always; }
</style></head><body>
<h1>📊 Relatório Comercial — MF Paris</h1>
<p class="subtitle">Gerado em ${hoje} • Dados em tempo real do CRM</p>

<div class="kpi-grid">
  <div class="kpi"><div class="label">Total Leads</div><div class="value">${totalLeads}</div></div>
  <div class="kpi"><div class="label">Leads Ativos</div><div class="value blue">${leadsAtivos}</div></div>
  <div class="kpi"><div class="label">Pipeline Total</div><div class="value">R$ ${totalPipeline.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="label">Ticket Médio</div><div class="value">R$ ${ticketMedio.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="label">Conversão</div><div class="value green">${taxaConversao}%</div></div>
  <div class="kpi"><div class="label">Vendas Fechadas</div><div class="value green">R$ ${valorGanho.toLocaleString('pt-BR')}</div></div>
  <div class="kpi"><div class="label">Taxa de Perda</div><div class="value red">${taxaPerda}%</div></div>
  <div class="kpi"><div class="label">Valor Perdido</div><div class="value red">R$ ${valorPerdido.toLocaleString('pt-BR')}</div></div>
</div>

<div class="insights">
  <h2>🤖 Análise Inteligente (IA)</h2>
  <ul>${insights.map(i => `<li>${i}</li>`).join('')}</ul>
</div>

<h2>📊 Pipeline por Etapa</h2>
<table><thead><tr><th>Etapa</th><th style="text-align:center">Leads</th><th style="text-align:right">Valor</th></tr></thead><tbody>${pipelineRows}</tbody></table>

<h2>📈 Funil de Conversão</h2>
<table><thead><tr><th>Etapa</th><th style="text-align:center">Passaram</th><th style="text-align:center">Taxa</th></tr></thead><tbody>${convRows}</tbody></table>

<h2>👥 Desempenho por Vendedor</h2>
<table><thead><tr><th>Vendedor</th><th style="text-align:center">Leads</th><th style="text-align:center">Ganhos</th><th style="text-align:center">Perdidos</th><th style="text-align:right">Pipeline Ativo</th></tr></thead><tbody>${vendRows}</tbody></table>

<div class="page-break"></div>

<h2>🏆 Top 10 Clientes (por valor)</h2>
<table><thead><tr><th>Cliente</th><th>Etapa</th><th style="text-align:center">Score</th><th style="text-align:right">Valor</th><th>Vendedor</th></tr></thead><tbody>${topRows}</tbody></table>

${perdidos.length > 0 ? `<h2>❌ Análise de Perdas</h2>
<table><thead><tr><th>Motivo</th><th style="text-align:center">Qtd</th><th style="text-align:right">% do Total</th></tr></thead><tbody>${perdaRows}</tbody></table>` : ''}

<h2>🔮 Projeção de Receita</h2>
<table><thead><tr><th>Etapa</th><th style="text-align:center">Leads</th><th style="text-align:center">Prob.</th><th style="text-align:right">Valor Pipeline</th><th style="text-align:right">Projetado</th></tr></thead><tbody>
${funilStages.map(s => {
  const cls = clientes.filter(c => c.etapa === s)
  const val = cls.reduce((sum, c) => sum + (c.valorEstimado || 0), 0)
  const proj = val * (probEtapa[s] || 0)
  return `<tr><td>${stLabels[s]}</td><td style="text-align:center">${cls.length}</td><td style="text-align:center">${((probEtapa[s] || 0) * 100).toFixed(0)}%</td><td style="text-align:right">R$ ${val.toLocaleString('pt-BR')}</td><td style="text-align:right"><strong>R$ ${proj.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong></td></tr>`
}).join('')}
<tr style="background:#f0fdf4;font-weight:700"><td colspan="4">Total Projetado</td><td style="text-align:right;color:#16a34a">R$ ${receitaProjetada.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td></tr>
</tbody></table>

<div class="footer">
  Relatório gerado automaticamente pelo CRM MF Paris com análise de IA • ${hoje}<br/>
  Os dados refletem o estado atual do pipeline no momento da geração.
</div>
</body></html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      setTimeout(() => { printWindow.print() }, 500)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Relatórios e Gráficos</h1>
          <p className="mt-1 text-sm text-gray-600">Análise visual completa do pipeline, vendedores e interações</p>
        </div>
        <button onClick={gerarRelatorioPDF} className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-apple hover:from-blue-700 hover:to-indigo-700 shadow-apple-sm flex items-center gap-2 font-medium text-sm transition-all self-start">
          <SparklesIcon className="h-4 w-4" />
          Gerar Relatório com IA
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Pipeline por Etapa (R$)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Valor']} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {pipelineData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🥧 Distribuição de Leads</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {pieData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 Desempenho por Vendedor</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={vendedorData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number, name: string) => [name === 'pipeline' ? `R$ ${value.toLocaleString('pt-BR')}` : value, name === 'pipeline' ? 'Pipeline' : name === 'leads' ? 'Leads' : 'Conversões']} />
              <Bar dataKey="pipeline" fill="#6366F1" name="Pipeline" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💬 Interações por Canal</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={interacaoData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
              <Tooltip />
              <Bar dataKey="qtd" fill="#10B981" name="Quantidade" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Produtos por Pipeline */}
      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📦 Produtos por Volume de Pipeline</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={(() => {
            const prodPipeline: Record<string, number> = {}
            clientes.forEach(c => (c.produtosInteresse || []).forEach(p => { prodPipeline[p] = (prodPipeline[p] || 0) + (c.valorEstimado || 0) }))
            return Object.entries(prodPipeline).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, valor]) => ({ name: name.length > 18 ? name.slice(0, 18) + '…' : name, valor }))
          })()} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={140} />
            <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Pipeline']} />
            <Bar dataKey="valor" fill="#F59E0B" name="Pipeline" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Resumo Executivo</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-apple border border-blue-200">
            <p className="text-xs text-blue-600 font-medium">Total Pipeline</p>
            <p className="text-xl font-bold text-blue-900">R$ {clientes.reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</p>
          </div>
          <div className="p-4 bg-green-50 rounded-apple border border-green-200">
            <p className="text-xs text-green-600 font-medium">Vendas Fechadas</p>
            <p className="text-xl font-bold text-green-900">R$ {clientes.filter(c => c.etapa === 'pos_venda').reduce((s, c) => s + (c.valorEstimado || 0), 0).toLocaleString('pt-BR')}</p>
          </div>
          <div className="p-4 bg-red-50 rounded-apple border border-red-200">
            <p className="text-xs text-red-600 font-medium">Perdidos</p>
            <p className="text-xl font-bold text-red-900">{clientes.filter(c => c.etapa === 'perdido').length} leads</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-apple border border-purple-200">
            <p className="text-xs text-purple-600 font-medium">Taxa Conversão</p>
            <p className="text-xl font-bold text-purple-900">{clientes.length > 0 ? ((clientes.filter(c => c.etapa === 'pos_venda').length / clientes.length) * 100).toFixed(1) : 0}%</p>
          </div>
        </div>
      </div>

      {/* Item 7: Taxa de conversão entre etapas */}
      {(() => {
        const funilStages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
        const funilLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda' }

        const passaramPor: Record<string, number> = {}
        funilStages.forEach(s => { passaramPor[s] = 0 })
        clientes.forEach(c => {
          const etapas = new Set<string>()
          etapas.add(c.etapa)
          ;(c.historicoEtapas || []).forEach(h => { etapas.add(h.etapa); if (h.de) etapas.add(h.de) })
          funilStages.forEach(s => { if (etapas.has(s)) passaramPor[s]++ })
        })

        const convData = funilStages.map((s, i) => {
          const qtd = passaramPor[s]
          const anterior = i > 0 ? passaramPor[funilStages[i - 1]] : qtd
          const taxa = anterior > 0 ? (qtd / anterior) * 100 : 0
          return { name: funilLabels[s], qtd, taxa: Math.round(taxa) }
        })

        const maxQtd = Math.max(...convData.map(d => d.qtd), 1)

        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">📈 Funil de Conversão</h3>
            <p className="text-sm text-gray-500 mb-5">Taxa de conversão entre cada etapa do funil</p>
            <div className="space-y-3">
              {convData.map((d, i) => (
                <div key={d.name}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 w-24 text-right">{d.name}</span>
                    <div className="flex-1 relative">
                      <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                        <div className="h-8 rounded-full flex items-center px-3 transition-all duration-500"
                          style={{ width: `${Math.max((d.qtd / maxQtd) * 100, 8)}%`, backgroundColor: ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899'][i] || '#6B7280' }}>
                          <span className="text-xs font-bold text-white drop-shadow">{d.qtd} lead{d.qtd !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                    {i > 0 && (
                      <span className={`text-sm font-bold w-14 text-right ${d.taxa >= 60 ? 'text-green-600' : d.taxa >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{d.taxa}%</span>
                    )}
                    {i === 0 && <span className="text-sm font-bold w-14 text-right text-gray-400">—</span>}
                  </div>
                  {i < convData.length - 1 && (
                    <div className="flex items-center ml-24 pl-3 py-0.5">
                      <span className="text-gray-300 text-xs">↓</span>
                      <span className="text-[10px] text-gray-400 ml-1">{convData[i + 1].taxa}% avançam</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Item 8: Tempo médio por etapa */}
      {(() => {
        const funilStages = ['prospecção', 'amostra', 'homologado', 'negociacao', 'pos_venda']
        const funilLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda' }
        const stColors = ['#3B82F6', '#EAB308', '#22C55E', '#A855F7', '#EC4899']

        const temposPorEtapa: Record<string, number[]> = {}
        funilStages.forEach(s => { temposPorEtapa[s] = [] })

        clientes.forEach(c => {
          const hist = c.historicoEtapas || []
          for (let i = 0; i < hist.length; i++) {
            const etapa = hist[i].de
            if (etapa && funilStages.includes(etapa)) {
              const entrada = i > 0 ? new Date(hist[i - 1].data).getTime() : (c.dataEntradaEtapa ? new Date(c.dataEntradaEtapa).getTime() : null)
              if (entrada) {
                const saida = new Date(hist[i].data).getTime()
                const dias = Math.max(1, Math.floor((saida - entrada) / 86400000))
                temposPorEtapa[etapa].push(dias)
              }
            }
          }
          // Se ainda está na etapa e tem dataEntradaEtapa
          if (funilStages.includes(c.etapa) && c.dataEntradaEtapa) {
            const dias = Math.max(1, Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000))
            temposPorEtapa[c.etapa].push(dias)
          }
        })

        const tempoData = funilStages.map((s, i) => {
          const arr = temposPorEtapa[s]
          const media = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
          return { name: funilLabels[s], dias: media, fill: stColors[i], count: arr.length }
        }).filter(d => d.count > 0)

        if (tempoData.length === 0) return null
        return (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">⏱️ Tempo Médio por Etapa</h3>
            <p className="text-sm text-gray-500 mb-4">Dias que os clientes ficam em média em cada etapa antes de avançar</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tempoData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} unit=" dias" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(value: number) => [`${value} dias`, 'Média']} />
                <Bar dataKey="dias" radius={[0, 6, 6, 0]}>
                  {tempoData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-3">
              {tempoData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                  <span className="text-xs text-gray-600">{d.name}: <span className="font-bold text-gray-900">{d.dias}d</span></span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Relatório de Perdas */}
      {(() => {
        const perdidos = clientes.filter(c => c.etapa === 'perdido')
        const totalPerdido = perdidos.length
        const valorPerdido = perdidos.reduce((s, c) => s + (c.valorEstimado || 0), 0)
        const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
        const catColors: Record<string, string> = { preco: '#EAB308', prazo: '#F97316', qualidade: '#3B82F6', concorrencia: '#EF4444', sem_resposta: '#6B7280', outro: '#A855F7' }

        const porCategoria = Object.entries(
          perdidos.reduce((acc, c) => { const k = c.categoriaPerda || 'outro'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)
        ).map(([key, value]) => ({ name: catLabels[key] || key, value, fill: catColors[key] || '#6B7280' }))

        const porEtapaOrigem = Object.entries(
          perdidos.reduce((acc, c) => { const k = c.etapaAnterior || 'desconhecido'; acc[k] = (acc[k] || 0) + 1; return acc }, {} as Record<string, number>)
        ).map(([key, value]) => ({ name: stageLabels[key] || key, qtd: value }))

        const porVendedor = vendedores.filter(v => v.ativo).map(v => ({
          name: v.nome.split(' ')[0],
          perdidos: perdidos.filter(c => c.vendedorId === v.id).length,
          valorPerdido: perdidos.filter(c => c.vendedorId === v.id).reduce((s, c) => s + (c.valorEstimado || 0), 0)
        })).filter(v => v.perdidos > 0)

        const motivoMaisFrequente = porCategoria.length > 0 ? porCategoria.sort((a, b) => b.value - a.value)[0].name : '—'

        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">❌ Relatório de Perdas</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-red-50 rounded-apple border border-red-200">
                <p className="text-xs text-red-600 font-medium">Total Perdidos</p>
                <p className="text-2xl font-bold text-red-900">{totalPerdido}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-apple border border-red-200">
                <p className="text-xs text-red-600 font-medium">Valor Perdido</p>
                <p className="text-2xl font-bold text-red-900">R$ {valorPerdido.toLocaleString('pt-BR')}</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-apple border border-orange-200">
                <p className="text-xs text-orange-600 font-medium">Motivo + Frequente</p>
                <p className="text-2xl font-bold text-orange-900">{motivoMaisFrequente}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-apple border border-gray-200">
                <p className="text-xs text-gray-600 font-medium">Taxa de Perda</p>
                <p className="text-2xl font-bold text-gray-900">{clientes.length > 0 ? ((totalPerdido / clientes.length) * 100).toFixed(1) : 0}%</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">🥧 Perdas por Motivo</h3>
                {porCategoria.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={porCategoria} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {porCategoria.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-gray-400 text-center py-12">Nenhum cliente perdido</p>}
              </div>

              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Perdas por Etapa de Origem</h3>
                {porEtapaOrigem.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={porEtapaOrigem}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="qtd" fill="#EF4444" name="Perdidos" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-gray-400 text-center py-12">Nenhum dado</p>}
              </div>
            </div>

            {porVendedor.length > 0 && (
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 Perdas por Vendedor</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Vendedor</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Clientes Perdidos</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Valor Perdido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porVendedor.map((v, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-sm font-medium text-gray-900">{v.name}</td>
                          <td className="py-2 px-3 text-sm text-right text-red-600 font-bold">{v.perdidos}</td>
                          <td className="py-2 px-3 text-sm text-right text-red-600">R$ {v.valorPerdido.toLocaleString('pt-BR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {perdidos.length > 0 && (
              <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Clientes Perdidos — Detalhe</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Cliente</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Motivo</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Etapa Anterior</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-gray-600">Valor</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Data</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-600">Vendedor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perdidos.map(c => {
                        const vend = vendedores.find(v => v.id === c.vendedorId)
                        return (
                          <tr key={c.id} className="border-b border-gray-100">
                            <td className="py-2 px-3 text-sm font-medium text-gray-900">{c.razaoSocial}</td>
                            <td className="py-2 px-3"><span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">{catLabels[c.categoriaPerda || 'outro']}</span>{c.motivoPerda && <p className="text-xs text-gray-500 mt-0.5">{c.motivoPerda}</p>}</td>
                            <td className="py-2 px-3 text-sm text-gray-700">{stageLabels[c.etapaAnterior || ''] || '—'}</td>
                            <td className="py-2 px-3 text-sm text-right font-medium text-red-600">R$ {(c.valorEstimado || 0).toLocaleString('pt-BR')}</td>
                            <td className="py-2 px-3 text-sm text-gray-700">{c.dataPerda ? new Date(c.dataPerda).toLocaleDateString('pt-BR') : '—'}</td>
                            <td className="py-2 px-3 text-sm text-gray-700">{vend?.nome || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// Templates View
const TemplatesView: React.FC<{ templates: Template[], onAdd: (t: Template) => void, onDelete: (id: number) => void }> = ({ templates, onAdd, onDelete }) => {
  const [showModal, setShowModal] = React.useState(false)
  const [filterCanal, setFilterCanal] = React.useState<string>('')
  const [filterEtapa, setFilterEtapa] = React.useState<string>('')
  const [newNome, setNewNome] = React.useState('')
  const [newCanal, setNewCanal] = React.useState<'email' | 'whatsapp'>('email')
  const [newEtapa, setNewEtapa] = React.useState('prospecção')
  const [newAssunto, setNewAssunto] = React.useState('')
  const [newCorpo, setNewCorpo] = React.useState('')
  const [previewId, setPreviewId] = React.useState<number | null>(null)

  const filtered = templates.filter(t => {
    return (!filterCanal || t.canal === filterCanal) && (!filterEtapa || t.etapa === filterEtapa)
  })

  const handleAdd = () => {
    if (!newNome.trim() || !newCorpo.trim()) return
    onAdd({ id: Date.now(), nome: newNome.trim(), canal: newCanal, etapa: newEtapa, assunto: newAssunto.trim() || undefined, corpo: newCorpo.trim() })
    setNewNome(''); setNewAssunto(''); setNewCorpo(''); setShowModal(false)
  }

  const previewTemplate = templates.find(t => t.id === previewId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Templates de Mensagens</h1>
          <p className="mt-1 text-sm text-gray-600">Modelos prontos de email e WhatsApp para cada etapa do funil</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2.5 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center self-start">
          <PlusIcon className="h-4 w-4 mr-2" /> Novo Template
        </button>
      </div>

      <div className="flex gap-3">
        <select value={filterCanal} onChange={(e) => setFilterCanal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todos os canais</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select value={filterEtapa} onChange={(e) => setFilterEtapa(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todas as etapas</option>
          <option value="prospecção">Prospecção</option>
          <option value="amostra">Amostra</option>
          <option value="homologado">Homologado</option>
          <option value="negociacao">Negociação</option>
          <option value="pos_venda">Pós-Venda</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t => (
          <div key={t.id} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5 hover:shadow-apple transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${t.canal === 'email' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  {t.canal === 'email' ? '📧 Email' : '💬 WhatsApp'}
                </span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                  {t.etapa}
                </span>
              </div>
              <button onClick={() => onDelete(t.id)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{t.nome}</h3>
            {t.assunto && <p className="text-xs text-gray-500 mb-2">Assunto: {t.assunto}</p>}
            <p className="text-sm text-gray-600 line-clamp-3 whitespace-pre-line">{t.corpo.slice(0, 120)}...</p>
            <button onClick={() => setPreviewId(t.id)} className="mt-3 text-xs text-primary-600 hover:text-primary-800 font-medium">Ver completo →</button>
          </div>
        ))}
      </div>

      {previewTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{previewTemplate.nome}</h2>
                <div className="flex gap-2 mt-1">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${previewTemplate.canal === 'email' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                    {previewTemplate.canal === 'email' ? '📧 Email' : '💬 WhatsApp'}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">{previewTemplate.etapa}</span>
                </div>
              </div>
              <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            {previewTemplate.assunto && (
              <div className="mb-3 p-3 bg-gray-50 rounded-apple border border-gray-200">
                <p className="text-xs text-gray-500">Assunto</p>
                <p className="text-sm font-medium text-gray-900">{previewTemplate.assunto}</p>
              </div>
            )}
            <div className="p-4 bg-gray-50 rounded-apple border border-gray-200 whitespace-pre-line text-sm text-gray-800">
              {previewTemplate.corpo}
            </div>
            <p className="text-xs text-gray-500 mt-3">Variáveis: {'{nome}'}, {'{empresa}'}, {'{vendedor}'}</p>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Novo Template</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Ex: Follow-up Pós-Reunião" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
                  <select value={newCanal} onChange={(e) => setNewCanal(e.target.value as 'email' | 'whatsapp')} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
                  <select value={newEtapa} onChange={(e) => setNewEtapa(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="prospecção">Prospecção</option>
                    <option value="amostra">Amostra</option>
                    <option value="homologado">Homologado</option>
                    <option value="negociacao">Negociação</option>
                    <option value="pos_venda">Pós-Venda</option>
                  </select>
                </div>
              </div>
              {newCanal === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
                  <input value={newAssunto} onChange={(e) => setNewAssunto(e.target.value)} placeholder="Assunto do email" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Corpo da mensagem *</label>
                <textarea value={newCorpo} onChange={(e) => setNewCorpo(e.target.value)} rows={6} placeholder="Use {nome}, {empresa}, {vendedor} como variáveis..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAdd} disabled={!newNome.trim() || !newCorpo.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">Criar Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Produtos View
const ProdutosView: React.FC<{
  produtos: Produto[]
  onAdd: (p: Produto) => void
  onUpdate: (p: Produto) => void
  onDelete: (id: number) => void
  isGerente: boolean
}> = ({ produtos, onAdd, onUpdate, onDelete, isGerente }) => {
  const [search, setSearch] = React.useState('')
  const [filterCategoria, setFilterCategoria] = React.useState('')
  const [filterAtivo, setFilterAtivo] = React.useState<string>('')
  const [showModal, setShowModal] = React.useState(false)
  const [editing, setEditing] = React.useState<Produto | null>(null)
  const [previewId, setPreviewId] = React.useState<number | null>(null)

  const [fNome, setFNome] = React.useState('')
  const [fDescricao, setFDescricao] = React.useState('')
  const [fCategoria, setFCategoria] = React.useState<Produto['categoria']>('sacaria')
  const [fPreco, setFPreco] = React.useState('')
  const [fUnidade, setFUnidade] = React.useState('un')
  const [fFoto, setFFoto] = React.useState('')
  const [fSku, setFSku] = React.useState('')
  const [fEstoque, setFEstoque] = React.useState('')
  const [fPesoKg, setFPesoKg] = React.useState('')
  const [fMargemLucro, setFMargemLucro] = React.useState('')
  const [fAtivo, setFAtivo] = React.useState(true)
  const [fDestaque, setFDestaque] = React.useState(false)

  const filtered = produtos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCategoria || p.categoria === filterCategoria
    const matchAtivo = filterAtivo === '' || (filterAtivo === 'ativo' ? p.ativo : !p.ativo)
    return matchSearch && matchCat && matchAtivo
  })

  const openNew = () => {
    setEditing(null)
    setFNome(''); setFDescricao(''); setFCategoria('sacaria'); setFPreco(''); setFUnidade('sc')
    setFFoto(''); setFSku(''); setFEstoque(''); setFPesoKg(''); setFMargemLucro('')
    setFAtivo(true); setFDestaque(false); setShowModal(true)
  }

  const openEdit = (p: Produto) => {
    setEditing(p)
    setFNome(p.nome); setFDescricao(p.descricao); setFCategoria(p.categoria); setFPreco(String(p.preco)); setFUnidade(p.unidade)
    setFFoto(p.foto); setFSku(p.sku || ''); setFEstoque(p.estoque !== undefined ? String(p.estoque) : ''); setFPesoKg(p.pesoKg !== undefined ? String(p.pesoKg) : ''); setFMargemLucro(p.margemLucro !== undefined ? String(p.margemLucro) : '')
    setFAtivo(p.ativo); setFDestaque(p.destaque); setShowModal(true)
  }

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Imagem deve ter no máximo 2MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setFFoto(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    if (!fNome.trim() || !fDescricao.trim() || !fPreco) return
    const prod: Produto = {
      id: editing ? editing.id : Date.now(),
      nome: fNome.trim(),
      descricao: fDescricao.trim(),
      categoria: fCategoria,
      preco: parseFloat(fPreco),
      unidade: fUnidade,
      foto: fFoto,
      sku: fSku.trim() || undefined,
      estoque: fEstoque ? parseInt(fEstoque) : undefined,
      pesoKg: fPesoKg ? parseFloat(fPesoKg) : undefined,
      margemLucro: fMargemLucro ? parseFloat(fMargemLucro) : undefined,
      ativo: fAtivo,
      destaque: fDestaque,
      dataCadastro: editing ? editing.dataCadastro : new Date().toISOString().split('T')[0]
    }
    if (editing) { onUpdate(prod) } else { onAdd(prod) }
    setShowModal(false)
  }

  const catLabel: Record<string, string> = { sacaria: 'Sacaria 25kg', okey_lac: 'Okey Lac 25kg', varejo_lacteo: 'Varejo Lácteo', cafe: 'Café', outros: 'Outros' }
  const catColor: Record<string, string> = { sacaria: 'bg-amber-100 text-amber-800', okey_lac: 'bg-blue-100 text-blue-800', varejo_lacteo: 'bg-purple-100 text-purple-800', cafe: 'bg-yellow-100 text-yellow-900', outros: 'bg-gray-100 text-gray-800' }

  const previewProd = produtos.find(p => p.id === previewId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Catálogo de Produtos</h1>
          <p className="mt-1 text-sm text-gray-600">{produtos.filter(p => p.ativo).length} produtos ativos — {produtos.length} total</p>
        </div>
        {isGerente && (
          <button onClick={openNew} className="px-4 py-2.5 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center self-start">
            <PlusIcon className="h-4 w-4 mr-2" /> Novo Produto
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar por nome ou SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-4 py-2.5 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-72" />
        <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todas categorias</option>
          <option value="sacaria">Sacaria 25kg</option>
          <option value="okey_lac">Okey Lac 25kg</option>
          <option value="varejo_lacteo">Varejo Lácteo</option>
          <option value="cafe">Café</option>
          <option value="outros">Outros</option>
        </select>
        <select value={filterAtivo} onChange={(e) => setFilterAtivo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(p => (
          <div key={p.id} className={`bg-white rounded-apple shadow-apple-sm border border-gray-200 overflow-hidden hover:shadow-apple transition-shadow ${!p.ativo ? 'opacity-60' : ''}`}>
            <div className="h-40 bg-gray-100 flex items-center justify-center relative">
              {p.foto ? (
                <img src={p.foto} alt={p.nome} className="w-full h-full object-cover" />
              ) : (
                <PhotoIcon className="h-16 w-16 text-gray-300" />
              )}
              {p.destaque && <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-full">Destaque</span>}
              {!p.ativo && <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">Inativo</span>}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between mb-1">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${catColor[p.categoria]}`}>{catLabel[p.categoria]}</span>
                {p.sku && <span className="text-xs text-gray-400 font-mono">{p.sku}</span>}
              </div>
              <h3 className="font-semibold text-gray-900 mt-2 text-sm leading-tight">{p.nome}</h3>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.descricao}</p>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-lg font-bold text-primary-600">R$ {p.preco.toFixed(2).replace('.', ',')}</p>
                  <p className="text-xs text-gray-400">/{p.unidade}</p>
                </div>
                {p.estoque !== undefined && (
                  <p className={`text-xs font-medium ${p.estoque > 100 ? 'text-green-600' : p.estoque > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {p.estoque > 0 ? `${p.estoque} em estoque` : 'Sem estoque'}
                  </p>
                )}
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => setPreviewId(p.id)} className="text-xs text-primary-600 hover:text-primary-800 font-medium flex-1">Ver detalhes</button>
                {isGerente && (
                  <>
                    <button onClick={() => openEdit(p)} className="text-xs text-gray-600 hover:text-gray-800 font-medium">Editar</button>
                    <button onClick={() => onUpdate({ ...p, ativo: !p.ativo })} className="text-xs text-gray-600 hover:text-gray-800 font-medium">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && <div className="text-center py-12 text-gray-500">Nenhum produto encontrado</div>}

      {/* Detail Modal */}
      {previewProd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
            {previewProd.foto ? (
              <img src={previewProd.foto} alt={previewProd.nome} className="w-full h-56 object-cover rounded-t-apple" />
            ) : (
              <div className="w-full h-56 bg-gray-100 flex items-center justify-center rounded-t-apple"><PhotoIcon className="h-20 w-20 text-gray-300" /></div>
            )}
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${catColor[previewProd.categoria]}`}>{catLabel[previewProd.categoria]}</span>
                    {previewProd.destaque && <span className="px-2 py-0.5 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-full">Destaque</span>}
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${previewProd.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{previewProd.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{previewProd.nome}</h2>
                </div>
                <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
              </div>
              <p className="text-sm text-gray-600 mt-3">{previewProd.descricao}</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Preço</p><p className="text-lg font-bold text-primary-600">R$ {previewProd.preco.toFixed(2).replace('.', ',')}/{previewProd.unidade}</p></div>
                {previewProd.sku && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">SKU</p><p className="text-sm font-mono font-semibold text-gray-900">{previewProd.sku}</p></div>}
                {previewProd.estoque !== undefined && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Estoque</p><p className="text-sm font-semibold text-gray-900">{previewProd.estoque} {previewProd.unidade}</p></div>}
                {previewProd.pesoKg !== undefined && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Peso</p><p className="text-sm font-semibold text-gray-900">{previewProd.pesoKg} kg</p></div>}
                {previewProd.margemLucro !== undefined && <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Margem</p><p className="text-sm font-semibold text-gray-900">{previewProd.margemLucro}%</p></div>}
                <div className="p-3 bg-gray-50 rounded-apple"><p className="text-xs text-gray-500">Cadastrado em</p><p className="text-sm font-semibold text-gray-900">{new Date(previewProd.dataCadastro).toLocaleDateString('pt-BR')}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>

            <div className="space-y-4">
              {/* Foto Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Foto do Produto</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-gray-100 rounded-apple border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {fFoto ? <img src={fFoto} alt="Preview" className="w-full h-full object-cover" /> : <PhotoIcon className="h-10 w-10 text-gray-300" />}
                  </div>
                  <div>
                    <label className="px-4 py-2 bg-white border border-gray-300 rounded-apple text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer inline-block">
                      <input type="file" accept="image/*" className="hidden" onChange={handleFoto} />
                      Escolher imagem
                    </label>
                    <p className="text-xs text-gray-500 mt-1">JPG, PNG ou WebP. Máx 2MB.</p>
                    {fFoto && <button onClick={() => setFFoto('')} className="text-xs text-red-500 hover:text-red-700 mt-1">Remover foto</button>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Ex: Filé de Tilápia Congelado" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                  <textarea value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} rows={3} placeholder="Descrição detalhada do produto..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                  <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value as Produto['categoria'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="sacaria">Sacaria 25kg</option>
                    <option value="okey_lac">Okey Lac 25kg</option>
                    <option value="varejo_lacteo">Varejo Lácteo</option>
                    <option value="cafe">Café</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input value={fSku} onChange={(e) => setFSku(e.target.value)} placeholder="CONG-001" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
                  <input type="number" step="0.01" value={fPreco} onChange={(e) => setFPreco(e.target.value)} placeholder="0,00" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidade *</label>
                  <select value={fUnidade} onChange={(e) => setFUnidade(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="sc">Saco (sc)</option>
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="cx">Caixa (cx)</option>
                    <option value="lt">Litro (lt)</option>
                    <option value="pct">Pacote (pct)</option>
                    <option value="fd">Fardo (fd)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estoque</label>
                  <input type="number" value={fEstoque} onChange={(e) => setFEstoque(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg)</label>
                  <input type="number" step="0.1" value={fPesoKg} onChange={(e) => setFPesoKg(e.target.value)} placeholder="0.0" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Margem Lucro (%)</label>
                  <input type="number" step="0.1" value={fMargemLucro} onChange={(e) => setFMargemLucro(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={fAtivo} onChange={(e) => setFAtivo(e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
                  <span className="text-sm text-gray-700">Produto ativo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={fDestaque} onChange={(e) => setFDestaque(e.target.checked)} className="w-4 h-4 text-yellow-500 rounded" />
                  <span className="text-sm text-gray-700">Destaque / Promoção</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSave} disabled={!fNome.trim() || !fDescricao.trim() || !fPreco} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">{editing ? 'Salvar' : 'Criar Produto'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Pedidos View
function PedidosView({ pedidos, clientes, produtos, vendedores, loggedUser, onAddPedido, onUpdatePedido }: {
  pedidos: Pedido[]
  clientes: Cliente[]
  produtos: Produto[]
  vendedores: Vendedor[]
  loggedUser: Vendedor
  onAddPedido: (p: Pedido) => void
  onUpdatePedido: (p: Pedido) => void
}) {
  const isGerente = loggedUser.cargo === 'gerente'
  const [tab, setTab] = React.useState<'novo' | 'historico'>('novo')
  const clientesDisponiveis = isGerente ? clientes : clientes.filter(c => c.vendedorId === loggedUser.id)
  const produtosAtivos = produtos.filter(p => p.ativo)
  const [selectedClienteId, setSelectedClienteId] = React.useState<number | ''>(clientesDisponiveis[0]?.id ?? '')
  const [itensPedido, setItensPedido] = React.useState<ItemPedido[]>([])
  const [observacoes, setObservacoes] = React.useState('')
  const [searchProduto, setSearchProduto] = React.useState('')
  const [filterCategoria, setFilterCategoria] = React.useState('')
  const [pedidoEnviado, setPedidoEnviado] = React.useState<Pedido | null>(null)
  const [filtroStatus, setFiltroStatus] = React.useState<string>('')
  const [filtroCliente, setFiltroCliente] = React.useState<string>('')

  const produtosFiltrados = produtosAtivos.filter(p => {
    const matchSearch = p.nome.toLowerCase().includes(searchProduto.toLowerCase()) || (p.sku || '').toLowerCase().includes(searchProduto.toLowerCase())
    const matchCat = !filterCategoria || p.categoria === filterCategoria
    return matchSearch && matchCat
  })

  const totalPedido = itensPedido.reduce((sum, item) => sum + item.preco * item.quantidade, 0)

  const getItemQtd = (produtoId: number) => itensPedido.find(i => i.produtoId === produtoId)?.quantidade ?? 0

  const setItemQtd = (produto: Produto, qtd: number) => {
    if (qtd <= 0) {
      setItensPedido(prev => prev.filter(i => i.produtoId !== produto.id))
    } else {
      setItensPedido(prev => {
        const existe = prev.find(i => i.produtoId === produto.id)
        if (existe) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: qtd } : i)
        return [...prev, { produtoId: produto.id, nomeProduto: produto.nome, sku: produto.sku, unidade: produto.unidade, preco: produto.preco, quantidade: qtd }]
      })
    }
  }

  const handleEnviarPedido = (status: 'rascunho' | 'enviado') => {
    if (!selectedClienteId || itensPedido.length === 0) return
    const numero = `PED-${Date.now().toString().slice(-6)}`
    const novoPedido: Pedido = {
      id: Date.now(), numero, clienteId: Number(selectedClienteId), vendedorId: loggedUser.id,
      itens: itensPedido, observacoes: observacoes.trim(), status,
      dataCriacao: new Date().toISOString(),
      dataEnvio: status === 'enviado' ? new Date().toISOString() : undefined,
      totalValor: totalPedido
    }
    onAddPedido(novoPedido)
    if (status === 'enviado') setPedidoEnviado(novoPedido)
    setItensPedido([])
    setObservacoes('')
    setSelectedClienteId(clientesDisponiveis[0]?.id ?? '')
  }

  const pedidosFiltrados = pedidos
    .filter(p => {
      const matchStatus = !filtroStatus || p.status === filtroStatus
      const matchCliente = !filtroCliente || String(p.clienteId) === filtroCliente
      const matchVendedor = isGerente || p.vendedorId === loggedUser.id
      return matchStatus && matchCliente && matchVendedor
    })
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())

  const statusBadge = (s: Pedido['status']) => ({ rascunho: 'bg-gray-100 text-gray-700', enviado: 'bg-blue-100 text-blue-800', confirmado: 'bg-green-100 text-green-800', cancelado: 'bg-red-100 text-red-800' }[s])
  const statusLabel = (s: Pedido['status']) => ({ rascunho: '📝 Rascunho', enviado: '📤 Enviado', confirmado: '✅ Confirmado', cancelado: '❌ Cancelado' }[s])
  const catLabel: Record<string, string> = { sacaria: 'Sacaria 25kg', okey_lac: 'Okey Lac 25kg', varejo_lacteo: 'Varejo Lácteo', cafe: 'Café', outros: 'Outros' }
  const clienteSelecionado = clientes.find(c => c.id === Number(selectedClienteId))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Lançamento de Pedidos</h1>
          <p className="mt-1 text-sm text-gray-600">{isGerente ? 'Gerencie todos os pedidos da equipe' : `Olá, ${loggedUser.nome.split(' ')[0]}! Lance pedidos para seus clientes`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('novo')} className={`px-3 sm:px-4 py-2 rounded-apple text-sm font-medium transition-colors ${tab === 'novo' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>➕ Novo Pedido</button>
          <button onClick={() => setTab('historico')} className={`px-3 sm:px-4 py-2 rounded-apple text-sm font-medium transition-colors ${tab === 'historico' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>📋 Histórico ({pedidos.filter(p => isGerente || p.vendedorId === loggedUser.id).length})</button>
        </div>
      </div>

      {pedidoEnviado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Pedido Enviado!</h2>
            <p className="text-3xl font-bold text-primary-600 mb-4">{pedidoEnviado.numero}</p>
            <div className="bg-gray-50 rounded-apple p-4 text-left mb-6 space-y-1">
              <p className="text-sm text-gray-700"><span className="font-medium">Cliente:</span> {clientes.find(c => c.id === pedidoEnviado.clienteId)?.razaoSocial}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Itens:</span> {pedidoEnviado.itens.length} produto(s)</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Total:</span> R$ {pedidoEnviado.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Data:</span> {new Date(pedidoEnviado.dataCriacao).toLocaleString('pt-BR')}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setPedidoEnviado(null); setTab('historico') }} className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm font-medium">Ver Histórico</button>
              <button onClick={() => setPedidoEnviado(null)} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 text-sm font-medium">Novo Pedido</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'novo' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 space-y-4">
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">👤 Cliente</h3>
              {clientesDisponiveis.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum cliente atribuído a você.</p>
              ) : (
                <select value={selectedClienteId} onChange={(e) => setSelectedClienteId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                  <option value="">Selecione um cliente...</option>
                  {clientesDisponiveis.map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
                </select>
              )}
              {clienteSelecionado && (
                <div className="mt-3 p-3 bg-gray-50 rounded-apple border border-gray-200 space-y-1">
                  <p className="text-xs text-gray-500">Contato: <span className="text-gray-800 font-medium">{clienteSelecionado.contatoNome}</span></p>
                  <p className="text-xs text-gray-500">Tel: <span className="text-gray-800">{clienteSelecionado.contatoTelefone}</span></p>
                  <p className="text-xs text-gray-500">Etapa: <span className="text-gray-800">{clienteSelecionado.etapa}</span></p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">🛒 Carrinho ({itensPedido.length} {itensPedido.length === 1 ? 'item' : 'itens'})</h3>
              {itensPedido.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <ShoppingCartIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Adicione produtos ao pedido</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {itensPedido.map(item => (
                    <div key={item.produtoId} className="flex items-center justify-between p-2 bg-gray-50 rounded-apple border border-gray-200">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="text-xs font-medium text-gray-900 truncate">{item.nomeProduto}</p>
                        <p className="text-xs text-gray-500">R$ {item.preco.toFixed(2).replace('.', ',')} / {item.unidade}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setItemQtd(produtos.find(p => p.id === item.produtoId)!, item.quantidade - 1)} className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold text-sm">−</button>
                        <span className="w-8 text-center text-sm font-semibold text-gray-900">{item.quantidade}</span>
                        <button onClick={() => setItemQtd(produtos.find(p => p.id === item.produtoId)!, item.quantidade + 1)} className="w-6 h-6 rounded-full bg-primary-100 hover:bg-primary-200 flex items-center justify-center text-primary-700 font-bold text-sm">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {itensPedido.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total ({itensPedido.reduce((s, i) => s + i.quantidade, 0)} unid.)</span>
                  <span className="text-sm font-bold text-gray-900">R$ {totalPedido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">📝 Observações</h3>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Condições de entrega, prazo, forma de pagamento..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none" />
            </div>

            <div className="space-y-2">
              <button onClick={() => handleEnviarPedido('enviado')} disabled={!selectedClienteId || itensPedido.length === 0} className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-apple shadow-apple-sm transition-colors flex items-center justify-center gap-2">
                <PaperAirplaneIcon className="h-5 w-5" />
                Enviar Pedido — R$ {totalPedido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </button>
              <button onClick={() => handleEnviarPedido('rascunho')} disabled={!selectedClienteId || itensPedido.length === 0} className="w-full py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 font-medium rounded-apple transition-colors text-sm">💾 Salvar como Rascunho</button>
              {itensPedido.length > 0 && <button onClick={() => setItensPedido([])} className="w-full py-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors">🗑️ Limpar carrinho</button>}
            </div>
          </div>

          <div className="xl:col-span-2">
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">📦 Selecionar Produtos</h3>
              <div className="flex flex-wrap gap-3 mb-4">
                <input type="text" placeholder="Buscar por nome ou SKU..." value={searchProduto} onChange={(e) => setSearchProduto(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm flex-1 min-w-48" />
                <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Todas categorias</option>
                  <option value="sacaria">Sacaria 25kg</option>
                  <option value="okey_lac">Okey Lac 25kg</option>
                  <option value="varejo_lacteo">Varejo Lácteo</option>
                  <option value="cafe">Café</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {produtosFiltrados.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">Nenhum produto encontrado</p>}
                {produtosFiltrados.map(produto => {
                  const qtd = getItemQtd(produto.id)
                  const noCarrinho = qtd > 0
                  return (
                    <div key={produto.id} className={`flex items-center gap-4 p-3 rounded-apple border-2 transition-all ${noCarrinho ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                      <div className="w-14 h-14 bg-gray-100 rounded-apple flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {produto.foto ? <img src={produto.foto} alt={produto.nome} className="w-full h-full object-cover" /> : <PhotoIcon className="h-7 w-7 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-gray-900 truncate">{produto.nome}</p>
                          {produto.destaque && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-yellow-400 text-yellow-900 rounded-full flex-shrink-0">Destaque</span>}
                        </div>
                        <p className="text-xs text-gray-500">{catLabel[produto.categoria]}{produto.sku ? ` • ${produto.sku}` : ''}</p>
                        <p className="text-sm font-bold text-primary-600 mt-0.5">R$ {produto.preco.toFixed(2).replace('.', ',')} <span className="text-xs font-normal text-gray-400">/{produto.unidade}</span></p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {noCarrinho ? (
                          <>
                            <button onClick={() => setItemQtd(produto, qtd - 1)} className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold">−</button>
                            <span className="w-10 text-center font-bold text-gray-900">{qtd}</span>
                            <button onClick={() => setItemQtd(produto, qtd + 1)} className="w-8 h-8 rounded-full bg-primary-600 hover:bg-primary-700 flex items-center justify-center text-white font-bold">+</button>
                          </>
                        ) : (
                          <button onClick={() => setItemQtd(produto, 1)} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-apple transition-colors">+ Adicionar</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'historico' && (
        <div className="space-y-4">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="enviado">Enviado</option>
              <option value="confirmado">Confirmado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Todos os clientes</option>
              {(isGerente ? clientes : clientesDisponiveis).map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
            </select>
            <span className="text-sm text-gray-500 ml-auto">{pedidosFiltrados.length} pedido(s)</span>
          </div>

          {pedidosFiltrados.length === 0 ? (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-16 text-center">
              <ShoppingCartIcon className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Nenhum pedido encontrado</p>
              <p className="text-sm text-gray-400 mt-1">Lance seu primeiro pedido clicando em "Novo Pedido"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pedidosFiltrados.map(pedido => {
                const cliente = clientes.find(c => c.id === pedido.clienteId)
                const vendedor = vendedores.find(v => v.id === pedido.vendedorId)
                return (
                  <div key={pedido.id} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">{pedido.numero}</span>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge(pedido.status)}`}>{statusLabel(pedido.status)}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">{cliente?.razaoSocial || '—'}</span>
                          {isGerente && vendedor && <span className="text-gray-400"> • {vendedor.nome}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(pedido.dataCriacao).toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary-600">R$ {pedido.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-400">{pedido.itens.length} produto(s)</p>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 pt-3 space-y-1">
                      {pedido.itens.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700"><span className="font-medium">{item.quantidade}x</span> {item.nomeProduto}{item.sku && <span className="text-gray-400 text-xs ml-1">({item.sku})</span>}</span>
                          <span className="text-gray-900 font-medium">R$ {(item.preco * item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      {pedido.observacoes && <p className="text-xs text-gray-500 mt-2 italic">Obs: {pedido.observacoes}</p>}
                    </div>
                    {isGerente && pedido.status === 'enviado' && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'confirmado' })} className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-apple hover:bg-green-700">✅ Confirmar</button>
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'cancelado' })} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-apple hover:bg-red-100">❌ Cancelar</button>
                      </div>
                    )}
                    {pedido.status === 'rascunho' && pedido.vendedorId === loggedUser.id && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'enviado', dataEnvio: new Date().toISOString() })} className="px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-apple hover:bg-primary-700">📤 Enviar agora</button>
                        <button onClick={() => onUpdatePedido({ ...pedido, status: 'cancelado' })} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-apple hover:bg-red-100">🗑️ Descartar</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
