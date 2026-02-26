export type ViewType = 'dashboard' | 'funil' | 'clientes' | 'automacoes' | 'mapa' | 'prospeccao' | 'tarefas' | 'social' | 'integracoes' | 'equipe' | 'relatorios' | 'templates' | 'produtos' | 'pedidos'

export interface HistoricoEtapa {
  etapa: string
  data: string
  de?: string
}

export interface Cliente {
  id: number
  razaoSocial: string
  nomeFantasia?: string
  cnpj: string
  contatoNome: string
  contatoTelefone: string
  contatoEmail: string
  endereco?: string
  whatsapp?: string
  omieCodigo?: string
  etapa: string
  score?: number
  ultimaInteracao?: string
  diasInativo?: number
  valorEstimado?: number
  produtosInteresse?: string[]
  vendedorId?: number
  dataEntradaEtapa?: string
  historicoEtapas?: HistoricoEtapa[]
  notas?: string
  origemLead?: string
  dataEnvioAmostra?: string
  statusAmostra?: 'enviada' | 'aguardando_resposta' | 'aprovada' | 'rejeitada'
  dataHomologacao?: string
  proximoPedidoPrevisto?: string
  dataProposta?: string
  valorProposta?: number
  statusEntrega?: 'preparando' | 'enviado' | 'entregue'
  dataEntregaPrevista?: string
  dataEntregaRealizada?: string
  statusFaturamento?: 'a_faturar' | 'faturado'
  dataUltimoPedido?: string
  etapaAnterior?: string
  categoriaPerda?: 'preco' | 'prazo' | 'qualidade' | 'concorrencia' | 'sem_resposta' | 'outro'
  motivoPerda?: string
  dataPerda?: string
}

export interface FormData {
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

export interface Interacao {
  id: number
  clienteId: number
  tipo: 'email' | 'whatsapp' | 'linkedin' | 'instagram' | 'ligacao' | 'reuniao' | 'nota'
  data: string
  assunto: string
  descricao: string
  automatico: boolean
}

export interface DragItem {
  cliente: Cliente
  fromStage: string
}

export interface AICommand {
  id: string
  command: string
  response: string
  timestamp: string
}

export interface Notificacao {
  id: number
  tipo: 'success' | 'warning' | 'error' | 'info'
  titulo: string
  mensagem: string
  timestamp: string
  lida: boolean
  clienteId?: number
}

export interface Atividade {
  id: number
  tipo: string
  descricao: string
  vendedorNome: string
  timestamp: string
}

export interface Template {
  id: number
  nome: string
  canal: 'email' | 'whatsapp'
  etapa: string
  assunto?: string
  corpo: string
}

export interface Produto {
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

export interface DashboardMetrics {
  totalLeads: number
  leadsAtivos: number
  taxaConversao: number
  valorTotal: number
  ticketMedio: number
  leadsNovosHoje: number
  interacoesHoje: number
}

export interface DashboardViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  metrics: DashboardMetrics
}

export interface TemplateMsg {
  id: number
  canal: string
  nome: string
  conteudo: string
}

export interface CadenciaStep {
  id: number
  canal: Interacao['tipo']
  delayDias: number
  templateId?: number
}

export interface Cadencia {
  id: number
  nome: string
  steps: CadenciaStep[]
  pausarAoResponder: boolean
}

export interface Campanha {
  id: number
  nome: string
  cadenciaId: number
  etapa?: string
  minScore?: number
  diasInativoMin?: number
  status: 'rascunho' | 'ativa' | 'pausada'
}

export interface JobAutomacao {
  id: number
  clienteId: number
  canal: Interacao['tipo']
  tipo: 'propaganda' | 'contato'
  status: 'pendente' | 'enviado' | 'pausado' | 'erro'
  agendadoPara: string
  templateId?: number
  campanhaId?: number
}

export interface Tarefa {
  id: number
  titulo: string
  descricao?: string
  data: string
  hora?: string
  tipo: 'ligacao' | 'reuniao' | 'email' | 'whatsapp' | 'follow-up' | 'outro'
  status: 'pendente' | 'concluida'
  prioridade: 'alta' | 'media' | 'baixa'
  clienteId?: number
  vendedorId?: number
}

export interface Vendedor {
  id: number
  nome: string
  email: string
  telefone: string
  cargo: 'vendedor' | 'gerente' | 'sdr'
  avatar: string
  usuario: string
  metaVendas: number
  metaLeads: number
  metaConversao: number
  ativo: boolean
}

export interface ItemPedido {
  produtoId: number
  nomeProduto: string
  sku?: string
  unidade: string
  preco: number
  quantidade: number
}

export interface Pedido {
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

export interface FunilViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  loggedUser: Vendedor | null
  onDragStart: (e: React.DragEvent, cliente: Cliente, fromStage: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, toStage: string) => void
  onQuickAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
  onClickCliente?: (c: Cliente) => void
  isGerente?: boolean
  onImportNegocios?: (updates: { clienteId: number; changes: Partial<Cliente> }[], novos: Omit<Cliente, 'id'>[]) => void
}

export interface ClientesViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  onNewCliente: () => void
  onEditCliente: (cliente: Cliente) => void
  onImportClientes: (novos: Cliente[]) => void
  onDeleteCliente: (id: number) => void
  onDeleteAll?: () => Promise<void>
}
