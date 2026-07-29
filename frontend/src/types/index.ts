export type ViewType = 'dashboard' | 'funil' | 'aprovacao' | 'clientes' | 'automacoes' | 'mapa' | 'prospeccao' | 'tarefas' | 'social' | 'integracoes' | 'equipe' | 'relatorios' | 'templates' | 'produtos' | 'pedidos' | 'ia' | 'ia-contexto' | 'criar-automacao' | 'omie' | 'trafico' | 'baseleads' | 'licitacoes' | 'treinamento' | 'configuracao-tarefas' | 'configuracao-mensagens' | 'missao'

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
  cpf?: string
  inscricaoEstadual?: string
  cnpj2?: string
  contatoNome: string
  contatoTelefone: string
  contatoCelular?: string
  contatoTelefoneFixo?: string
  contatoEmail: string
  endereco?: string
  enderecoRua?: string
  enderecoNumero?: string
  enderecoComplemento?: string
  enderecoBairro?: string
  enderecoCidade?: string
  enderecoEstado?: string
  enderecoCep?: string
  enderecoRua2?: string
  enderecoNumero2?: string
  enderecoComplemento2?: string
  enderecoBairro2?: string
  enderecoCidade2?: string
  enderecoEstado2?: string
  enderecoCep2?: string
  cnaePrimario?: string
  cnaeSecundario?: string
  whatsapp?: string
  redesSociais?: string
  omieCodigo?: string
  agendorCodigo?: string
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
  statusAmostra?: 'solicitada' | 'aguardando_gerente' | 'liberada' | 'coletada' | 'entregue' | 'em_teste' | 'aprovada' | 'reprovada' | 'cancelamento_pendente'
  dataHomologacao?: string
  proximoPedidoPrevisto?: string
  dataProposta?: string
  valorProposta?: number
  resultadoAmostra?: 'aprovada' | 'reprovada'
  dataResultadoAmostra?: string
  motivoReprovacao?: string
  statusFollowUp?: 'aguardando_aprovacao_gerente' | 'pedido_aprovado' | 'em_producao' | 'faturado' | 'expedido' | 'entregue' | 'satisfacao_pendente' | 'concluido' | 'novo_ciclo_iniciado' | 'perdido_negociacao'
  statusSatisfacao?: 'pendente' | 'satisfeito' | 'insatisfeito'
  notaSatisfacao?: number
  feedbackSatisfacao?: string
  cicloRecompra?: number
  dataProximaRecompra?: string
  totalCompras?: number
  omieStatusLogistico?: string
  omieCodigoRastreio?: string
  omieNotaFiscal?: string
  omieDataFaturamento?: string
  statusEntrega?: 'preparando' | 'enviado' | 'entregue'
  dataEntregaPrevista?: string
  dataEntregaRealizada?: string
  statusFaturamento?: 'a_faturar' | 'faturado'
  dataUltimoPedido?: string
  etapaAnterior?: string
  categoriaPerda?: 'preco' | 'prazo' | 'qualidade' | 'concorrencia' | 'sem_resposta' | 'outro'
  motivoPerda?: string
  dataPerda?: string
  segmento?: string
  classeCliente?: string
  localizacao?: string
  tentativaAmostra?: number
  whatsappValido?: boolean | null
  whatsappJid?: string
  whatsappValidadoEm?: string
  novoCiclo?: boolean
  cicloNumero?: number
  googlePlaceId?: string
  googleRating?: number
  googleReviews?: number
  website?: string
  latitude?: number
  longitude?: number
  statusCliente?: 'ativo' | 'em_risco' | 'inativo' | 'prospecto' | 'descartado' | 'bloqueado' | 'inativado'
  dataUltimaAmostra?: string
  dataUltimaVenda?: string
  grupoEconomicoId?: number
  // Redes sociais — campos individuais (substituem `redesSociais` legado)
  instagram?: string
  facebook?: string
  linkedin?: string
  // Contatos adicionais
  contatoFinanceiroNome?: string
  contatoFinanceiroTelefone?: string
  contatoComprasNome?: string
  contatoComprasTelefone?: string
  // Produtos de Interesse — quantidade mensal estimada por produto
  produtosQuantidadesMensais?: Record<string, number>
  produtosDenegados?: string[]
  // Inativação detalhada
  motivoInativacao?: string
  dataInativacao?: string
  inativadoPor?: number
  inativadoPorAbandono?: boolean
  descricao?: string
  criadoEm?: string
  criadoPorNome?: string
  atualizadoEm?: string
}

export interface FormData {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  cpf: string
  inscricaoEstadual: string
  cnpj2: string
  contatoNome: string
  contatoTelefone: string
  contatoCelular: string
  contatoTelefoneFixo: string
  contatoEmail: string
  enderecoRua: string
  enderecoNumero: string
  enderecoComplemento: string
  enderecoBairro: string
  enderecoCidade: string
  enderecoEstado: string
  enderecoCep: string
  enderecoRua2: string
  enderecoNumero2: string
  enderecoComplemento2: string
  enderecoBairro2: string
  enderecoCidade2: string
  enderecoEstado2: string
  enderecoCep2: string
  cnaePrimario: string
  cnaeSecundario: string
  segmento: string
  classeCliente: string
  redesSociais: string
  valorEstimado?: string
  produtosInteresse: string
  produtosQuantidades: Record<string, number>
  vendedorId?: string
  statusCliente?: string
  grupoEconomicoId?: string
  // Redes sociais individuais
  instagram?: string
  facebook?: string
  linkedin?: string
  website?: string
  // Contatos adicionais
  contatoFinanceiroNome?: string
  contatoFinanceiroTelefone?: string
  contatoComprasNome?: string
  contatoComprasTelefone?: string
  // Quantidade mensal estimada por produto
  produtosQuantidadesMensais?: Record<string, number>
  descricao?: string
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
  omieCodigo?: string
  marca?: string
  localEstoque?: string
  especieVolume?: string
  cfopInterno?: string
  cfopExterno?: string
  ncm?: string
}

export interface ModuloTreinamento {
  id: number
  ordem: number
  ativo: boolean
  titulo: string
  descricao: string
  objetivo: string
  emoji: string
  dificuldade: 'Iniciante' | 'Médio' | 'Avançado'
  promptInstrucoes: string
  createdAt: string
  updatedAt: string
}

export interface PerfilTreinamento {
  id: number
  ordem: number
  ativo: boolean
  nome: string
  negocio: string
  emoji: string
  dor: string
  estilo: string
  promptInstrucoes: string
  createdAt: string
  updatedAt: string
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

export interface TarefaReagendamento {
  dataOriginal: string
  horaOriginal?: string
  motivo: string
  reagendadoEm: string
}

export interface Tarefa {
  id: number
  titulo: string
  descricao?: string
  data: string
  hora?: string
  tipo: 'ligacao' | 'reuniao' | 'email' | 'whatsapp' | 'follow-up' | 'outro' | 'visita'
  status: 'pendente' | 'concluida'
  prioridade: 'alta' | 'media' | 'baixa'
  clienteId?: number
  vendedorId?: number
  concluidaEm?: string
  criadoEm?: string
  reagendamentos?: TarefaReagendamento[]
  origemAutomacaoId?: number // ID da regra de automação que criou esta tarefa
  conclusao?: string
  // Missão Comercial
  missaoId?: number
  diaMissao?: number
  ordem?: number
  chegadaEm?: string
  saidaEm?: string
  localizacaoChegada?: { lat: number; lon: number }
  localizacaoSaida?: { lat: number; lon: number }
  resultado?: string
  interesse?: 'muito_interessado' | 'interessado' | 'pouco' | 'nao'
  produtosApresentados?: string[]
  proximosPassos?: string
  amostrasEntregues?: number
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
  precoOriginal?: number
  quantidade: number
}

export interface PropostaHistorico {
  id: number
  numero: string
  clienteId: number
  vendedorNome: string
  itens: ItemPedido[]
  observacoes: string
  frete?: string
  pagamento?: string
  totalValor: number
  criadoEm: string
}

export interface Pedido {
  id: number
  numero: string
  clienteId: number
  vendedorId: number
  itens: ItemPedido[]
  observacoes: string
  status: 'rascunho' | 'enviado' | 'confirmado' | 'cancelado' | 'cancelamento_solicitado'
  dataCriacao: string
  dataEnvio?: string
  dataAprovacao?: string
  totalValor: number
  motivoRecusa?: string
  aprovadoPor?: number
  omieCodigo?: string
  omieNumero?: string
  omieStatus?: string
  omieErro?: string
  tipo?: 'venda' | 'bonificacao'
  formaPagamento?: string
  tipoFrete?: 'CIF' | 'FOB'
  enderecoDiferente?: boolean
  enderecoEntregaRua?: string
  enderecoEntregaNumero?: string
  enderecoEntregaBairro?: string
  enderecoEntregaCidade?: string
  enderecoEntregaEstado?: string
  enderecoEntregaCep?: string
}

export interface FunilViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  pedidos?: Pedido[]
  propostas?: PropostaHistorico[]
  loggedUser: Vendedor | null
  onDragStart: (e: React.DragEvent, cliente: Cliente, fromStage: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, toStage: string) => void
  onQuickAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
  onClickCliente?: (c: Cliente) => void
  isGerente?: boolean
  onImportNegocios?: (updates: { clienteId: number; changes: Partial<Cliente> }[], novos: Omit<Cliente, 'id'>[]) => void
  moverCliente?: (clienteId: number, toStage: string, extras?: Partial<Cliente>) => void
  onNovoCiclo?: (cliente: Cliente) => void
}

export interface ClientesViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  onNewCliente: () => void
  onEditCliente: (cliente: Cliente) => void
  /** Clicar no nome do cliente abre a tela de PERFIL (ClientePanel), não o formulário de edição. */
  onClickCliente?: (cliente: Cliente) => void
  onUpdateCliente?: (id: number, changes: Partial<Cliente>) => Promise<void>
  onImportClientes: (novos: Cliente[]) => Promise<{ inserted: number; updated: number; errors: string[] }> | void
  onDeleteCliente: (id: number) => void
  onDeleteAll?: () => Promise<void>
}

export interface ChatMensagem {
  id: number
  senderId: number
  receiverId: number
  content: string
  readAt: string | null
  createdAt: string
}

export interface Missao {
  id: number
  nome: string
  objetivo?: string
  vendedorId?: number
  estado?: string
  cidades?: string[]
  dataSaida: string
  dataRetorno: string
  veiculo?: string
  hotel?: string
  status: 'planejada' | 'em_andamento' | 'concluida' | 'cancelada'
  metas?: {
    visitas?: number
    amostras?: number
    novosClientes?: number
    volume?: number
  }
  custoEstimado?: number
  createdAt?: string
  updatedAt?: string
}

export interface MissaoDespesa {
  id: number
  missaoId: number
  vendedorId?: number
  tipo: 'combustivel' | 'pedagio' | 'hotel' | 'alimentacao' | 'estacionamento' | 'outro'
  valor: number
  data: string
  comprovanteUrl?: string
  observacao?: string
  createdAt?: string
}
